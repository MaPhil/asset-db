const API = {
  rawTables: '/api/v1/raw-tables',
  assetPool: '/api/v1/asset-pool',
  assetPoolFields: '/api/v1/asset-pool/fields',
  categories: '/api/v1/categories',
  groups: '/api/v1/groups'
};

const PAGE_SIZE = 25;
const TOAST_STORAGE_KEY = 'assetPoolToast';

const state = {
  rawTables: [],
  assetPool: null,
  assetPoolSort: { key: '__rowId', direction: 'asc' },
  assetPoolPage: 1,
  assetFieldSuggestions: [],
  currentRawDetail: null,
  modal: {
    isOpen: false,
    mode: 'import',
    origin: 'overview',
    preview: null,
    rawTableId: null,
    tableTitle: '',
    stageOneValues: null
  },
  fieldManager: {
    isOpen: false,
    busyField: null,
    error: null
  }
};

function select(root, selector) {
  return root ? root.querySelector(selector) : null;
}

function selectAll(root, selector) {
  return root ? Array.from(root.querySelectorAll(selector)) : [];
}

function escapeHtml(value) {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  let payload = null;
  try {
    payload = await response.json();
  } catch (err) {
    payload = {};
  }
  if (!response.ok) {
    const error = new Error(payload.error || 'Request failed');
    error.payload = payload;
    throw error;
  }
  return payload;
}

function showToast(message) {
  const container = document.querySelector('.toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('toast--hide');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function consumePendingToast() {
  try {
    const message = sessionStorage.getItem(TOAST_STORAGE_KEY);
    if (message) {
      showToast(message);
      sessionStorage.removeItem(TOAST_STORAGE_KEY);
    }
  } catch (err) {
    // Storage might be unavailable (private mode); ignore.
  }
}

function renderSidebar(root) {
  const list = select(root, '[data-raw-list]');
  if (!list) return;
  list.innerHTML = '';

  if (!state.rawTables.length) {
    const empty = document.createElement('p');
    empty.className = 'helper-text';
    empty.textContent = 'No raw tables yet.';
    list.appendChild(empty);
    return;
  }

  const activeId = Number(root.dataset.rawTableId || '0');
  const view = root.dataset.view;

  state.rawTables.forEach((table) => {
    const link = document.createElement('a');
    link.href = `/asset-pool/raw/${table.id}`;
    link.className = 'sidebar-link';
    link.textContent = table.title;
    if (view === 'raw' && table.id === activeId) {
      link.dataset.active = 'true';
    }
    list.appendChild(link);
  });
}

function formatEntryCount(value) {
  const count = Number.isFinite(value) ? value : Number(value) || 0;
  return `${count} ${count === 1 ? 'entry' : 'entries'}`;
}

function renderFieldManager(root) {
  const panel = select(root, '[data-field-manager]');
  const trigger = select(root, '[data-open-field-manager]');
  if (!panel || !trigger) return;

  const list = select(panel, '[data-field-list]');
  const error = select(panel, '[data-field-error]');
  if (!list || !error) return;

  const fieldStats = Array.isArray(state.assetPool?.fieldStats) ? state.assetPool.fieldStats : [];
  list.innerHTML = '';

  if (!fieldStats.length) {
    const empty = document.createElement('p');
    empty.className = 'field-manager__empty';
    empty.textContent = 'No mapping fields available.';
    list.appendChild(empty);
  } else {
    const isBusy = state.fieldManager.busyField !== null;
    fieldStats.forEach((stat) => {
      if (!stat?.field) {
        return;
      }
      const item = document.createElement('div');
      item.className = 'field-manager__item';

      const info = document.createElement('div');
      info.className = 'field-manager__info';

      const name = document.createElement('p');
      name.className = 'field-manager__name';
      name.textContent = stat.field;
      info.appendChild(name);

      item.appendChild(info);

      const meta = document.createElement('div');
      meta.className = 'field-manager__meta';

      const count = document.createElement('span');
      count.className = 'field-manager__count';
      count.textContent = formatEntryCount(stat.count);
      meta.appendChild(count);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'button button--ghost field-manager__remove';
      remove.textContent = state.fieldManager.busyField === stat.field ? 'Removing…' : 'Remove';
      remove.disabled = isBusy;
      remove.addEventListener('click', () => handleRemoveField(stat.field, root));
      meta.appendChild(remove);

      item.appendChild(meta);
      list.appendChild(item);
    });
  }

  if (state.fieldManager.error) {
    error.hidden = false;
    error.textContent = state.fieldManager.error;
  } else {
    error.hidden = true;
    error.textContent = '';
  }

  panel.hidden = !state.fieldManager.isOpen;
  trigger.setAttribute('aria-expanded', state.fieldManager.isOpen ? 'true' : 'false');
}

function openFieldManager(root) {
  state.fieldManager.isOpen = true;
  state.fieldManager.error = null;
  renderFieldManager(root);
  const panel = select(root, '[data-field-manager]');
  if (panel) {
    panel.focus?.();
  }
}

function closeFieldManager(root) {
  if (state.fieldManager.busyField) {
    return;
  }
  state.fieldManager.isOpen = false;
  state.fieldManager.error = null;
  renderFieldManager(root);
}

async function handleRemoveField(field, root) {
  if (!field) return;
  state.fieldManager.error = null;
  state.fieldManager.busyField = field;
  renderFieldManager(root);

  try {
    const result = await fetchJson(`${API.assetPoolFields}/${encodeURIComponent(field)}`, {
      method: 'DELETE'
    });
    await Promise.all([refreshAssetPool(), refreshRawTables()]);
    const message = result?.removed
      ? `Removed mapping field "${field}".`
      : `No mappings were using "${field}".`;
    showToast(message);
    state.fieldManager.busyField = null;
    renderFieldManager(root);
  } catch (err) {
    state.fieldManager.error = err.payload?.error || err.message;
    state.fieldManager.busyField = null;
    renderFieldManager(root);
  }
}

function setupFieldManager(root) {
  const trigger = select(root, '[data-open-field-manager]');
  const panel = select(root, '[data-field-manager]');
  if (!trigger || !panel) return;

  if (!panel.hasAttribute('tabindex')) {
    panel.setAttribute('tabindex', '-1');
  }

  trigger.addEventListener('click', () => {
    if (state.fieldManager.isOpen) {
      closeFieldManager(root);
    } else {
      openFieldManager(root);
    }
  });

  const closeButton = select(panel, '[data-close-field-manager]');
  closeButton?.addEventListener('click', () => closeFieldManager(root));

  document.addEventListener('click', (event) => {
    if (!state.fieldManager.isOpen) return;
    if (panel.contains(event.target) || trigger.contains(event.target)) {
      return;
    }
    closeFieldManager(root);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.fieldManager.isOpen) {
      closeFieldManager(root);
    }
  });
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function applyAssetPoolSort(rows) {
  const { key, direction } = state.assetPoolSort;
  if (!key) return rows.slice();

  const sorted = rows.slice().sort((a, b) => {
    let aValue;
    let bValue;
    if (key === '__rowId') {
      aValue = a.id;
      bValue = b.id;
    } else if (key === '__table') {
      aValue = a.rawTableTitle;
      bValue = b.rawTableTitle;
    } else {
      aValue = a.values?.[key];
      bValue = b.values?.[key];
    }

    const aStr = aValue === null || aValue === undefined ? '' : String(aValue).toLowerCase();
    const bStr = bValue === null || bValue === undefined ? '' : String(bValue).toLowerCase();

    if (aStr < bStr) return direction === 'asc' ? -1 : 1;
    if (aStr > bStr) return direction === 'asc' ? 1 : -1;
    return 0;
  });

  return sorted;
}

function renderAssetPool(root) {
  const emptyState = select(root, '[data-empty-state]');
  const container = select(root, '[data-asset-pool-table]');
  if (!container || !emptyState) return;

  if (!state.rawTables.length) {
    emptyState.hidden = false;
    container.hidden = true;
    container.innerHTML = '';
    return;
  }

  const view = state.assetPool;
  const columns = Array.isArray(view?.columns) ? view.columns : [];
  const rows = Array.isArray(view?.rows) ? view.rows : [];

  emptyState.hidden = true;
  container.hidden = false;

  if (!rows.length) {
    state.assetPoolPage = 1;
    container.innerHTML = '';
    const placeholder = document.createElement('div');
    placeholder.className = 'card card--empty';
    placeholder.innerHTML = `
      <h2>No mapped rows yet</h2>
      <p>Map at least one column from a raw table to populate the Asset Pool.</p>
    `;
    container.appendChild(placeholder);
    renderFieldManager(root);
    return;
  }

  const sortedRows = applyAssetPoolSort(rows);
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  if (state.assetPoolPage > totalPages) {
    state.assetPoolPage = totalPages;
  }
  const start = (state.assetPoolPage - 1) * PAGE_SIZE;
  const pageRows = sortedRows.slice(start, start + PAGE_SIZE);

  const tableWrapper = document.createElement('div');
  tableWrapper.className = 'table-wrapper';
  const tableScroller = document.createElement('div');
  tableScroller.className = 'table-scroller';
  const table = document.createElement('table');
  table.className = 'table';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  const headers = [
    { key: '__rowId', label: 'Row ID' },
    { key: '__table', label: 'Raw Table' },
    ...columns.map((col) => ({ key: col, label: col }))
  ];

  headers.forEach((header) => {
    const th = document.createElement('th');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sort-button';
    button.dataset.sortKey = header.key;
    button.textContent = header.label;
    if (state.assetPoolSort.key === header.key) {
      const indicator = document.createElement('span');
      indicator.className = 'sort-indicator';
      indicator.textContent = state.assetPoolSort.direction === 'asc' ? '▲' : '▼';
      button.appendChild(indicator);
    }
    th.appendChild(button);
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  if (!pageRows.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = headers.length;
    cell.className = 'table-empty';
    cell.textContent = 'No rows available for the current filters.';
    row.appendChild(cell);
    tbody.appendChild(row);
  } else {
    pageRows.forEach((row) => {
      const tr = document.createElement('tr');
      const rowIdCell = document.createElement('td');
      rowIdCell.textContent = row.id;
      tr.appendChild(rowIdCell);

      const tableCell = document.createElement('td');
      tableCell.textContent = row.rawTableTitle || `Raw table ${row.rawTableId}`;
      tr.appendChild(tableCell);

      columns.forEach((column) => {
        const cell = document.createElement('td');
        const value = row.values?.[column];
        cell.textContent = value === null || value === undefined ? '' : String(value);
        tr.appendChild(cell);
      });
      tbody.appendChild(tr);
    });
  }
  table.appendChild(tbody);
  tableScroller.appendChild(table);
  tableWrapper.appendChild(tableScroller);

  const pagination = document.createElement('div');
  pagination.className = 'pagination';

  const info = document.createElement('span');
  info.className = 'pagination-info';
  info.textContent = `Showing ${Math.min(sortedRows.length, start + 1)}-${Math.min(
    sortedRows.length,
    start + pageRows.length
  )} of ${sortedRows.length}`;
  pagination.appendChild(info);

  const controls = document.createElement('div');
  controls.className = 'pagination-controls';
  const prev = document.createElement('button');
  prev.type = 'button';
  prev.textContent = 'Prev';
  prev.disabled = state.assetPoolPage === 1;
  prev.addEventListener('click', () => {
    state.assetPoolPage = Math.max(1, state.assetPoolPage - 1);
    renderAssetPool(root);
  });
  const next = document.createElement('button');
  next.type = 'button';
  next.textContent = 'Next';
  next.disabled = state.assetPoolPage === totalPages;
  next.addEventListener('click', () => {
    state.assetPoolPage = Math.min(totalPages, state.assetPoolPage + 1);
    renderAssetPool(root);
  });
  controls.appendChild(prev);
  controls.appendChild(next);
  pagination.appendChild(controls);

  container.innerHTML = '';
  container.appendChild(tableWrapper);
  container.appendChild(pagination);

  renderFieldManager(root);

  selectAll(table, '.sort-button').forEach((button) => {
    button.addEventListener('click', () => {
      const key = button.dataset.sortKey;
      if (state.assetPoolSort.key === key) {
        state.assetPoolSort.direction = state.assetPoolSort.direction === 'asc' ? 'desc' : 'asc';
      } else {
        state.assetPoolSort = { key, direction: 'asc' };
      }
      renderAssetPool(root);
    });
  });
}

function renderRawTable(root) {
  const missing = root.dataset.missing === 'true';
  if (missing) {
    return;
  }
  const rawTableId = Number(root.dataset.rawTableId || '0');
  if (!rawTableId) {
    return;
  }

  const metaBadge = select(root, '[data-raw-meta]');
  const tableContainer = select(root, '[data-raw-table]');
  const emptyCard = select(root, '[data-raw-empty]');
  const titleEl = select(root, '.page-title');

  fetchJson(`${API.rawTables}/${rawTableId}`)
    .then((data) => {
      state.currentRawDetail = data;
      const fieldStats = Array.isArray(data.assetPool?.fieldStats) ? data.assetPool.fieldStats : [];
      const statNames = fieldStats.map((stat) => stat.field);
      state.assetFieldSuggestions = Array.from(new Set([...statNames, ...state.assetFieldSuggestions]));
      if (metaBadge) {
        metaBadge.textContent = `${formatDate(data.table.uploadedAt)} · ${data.table.sourceFileName}`;
      }
      if (titleEl) {
        titleEl.textContent = data.table.title;
      }
      const hasRows = data.rows.length > 0;

      if (tableContainer) {
        tableContainer.hidden = !hasRows;
        tableContainer.setAttribute('aria-hidden', !hasRows ? 'true' : 'false');
        if (!hasRows) {
          tableContainer.innerHTML = '';
        }
      }

      if (emptyCard) {
        emptyCard.hidden = hasRows;
        emptyCard.setAttribute('aria-hidden', hasRows ? 'true' : 'false');
      }

      if (!hasRows) {
        return;
      }

      if (tableContainer) {
        tableContainer.innerHTML = '';
        const wrapper = document.createElement('div');
        wrapper.className = 'table-wrapper';
        const scroller = document.createElement('div');
        scroller.className = 'table-scroller';
        const table = document.createElement('table');
        table.className = 'table';
        const thead = document.createElement('thead');
        const headRow = document.createElement('tr');
        data.table.headers.forEach((header) => {
          const th = document.createElement('th');
          th.textContent = header;
          headRow.appendChild(th);
        });
        thead.appendChild(headRow);
        table.appendChild(thead);
        const tbody = document.createElement('tbody');
        data.rows.forEach((row) => {
          const tr = document.createElement('tr');
          data.table.headers.forEach((header) => {
            const td = document.createElement('td');
            const value = row.data?.[header];
            td.textContent = value === null || value === undefined ? '' : String(value);
            tr.appendChild(td);
          });
          tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        scroller.appendChild(table);
        wrapper.appendChild(scroller);
        tableContainer.innerHTML = '';
        tableContainer.appendChild(wrapper);
      }
    })
    .catch(() => {
      state.currentRawDetail = null;
      if (titleEl) {
        titleEl.textContent = 'Raw table unavailable';
      }
      if (metaBadge) {
        metaBadge.textContent = '';
      }
      if (tableContainer) {
        tableContainer.hidden = true;
        tableContainer.innerHTML = '';
      }
      if (emptyCard) {
        emptyCard.hidden = false;
      }
    });
}

function closeModal() {
  const modal = document.querySelector('[data-import-modal]');
  if (!modal) return;
  modal.hidden = true;
  modal.setAttribute('aria-hidden', 'true');
  state.modal.isOpen = false;
  state.modal.preview = null;
  state.modal.stageOneValues = null;
  modal.removeEventListener('keydown', trapFocus);
  const stage = modal.querySelector('[data-import-stage]');
  if (stage) {
    stage.innerHTML = '';
  }
}

function trapFocus(event) {
  if (event.key !== 'Tab') return;
  const modal = document.querySelector('[data-import-modal]');
  if (!modal) return;
  const focusable = modal.querySelectorAll(
    'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey) {
    if (document.activeElement === first) {
      event.preventDefault();
      last.focus();
    }
  } else if (document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function handleModalOverlay(event) {
  if (event.target === event.currentTarget) {
    closeModal();
  }
}

function openModal({ mode, origin }) {
  state.modal.mode = mode;
  state.modal.origin = origin;
  const modal = document.querySelector('[data-import-modal]');
  if (!modal) return;
  modal.hidden = false;
  modal.removeAttribute('aria-hidden');
  state.modal.isOpen = true;
  modal.addEventListener('keydown', trapFocus);
}

function renderStageOne() {
  const modal = document.querySelector('[data-import-modal]');
  const container = select(modal, '[data-import-stage]');
  if (!container) return;
  const values = state.modal.stageOneValues || {};

  const modalTitle = document.getElementById('import-modal-title');
  if (modalTitle) {
    modalTitle.textContent = 'Import raw table';
  }

  container.innerHTML = `
    <form class="form-grid" data-stage-one>
      <div class="form-field">
        <label for="import-file">Excel file (.xlsx)</label>
        <input id="import-file" name="file" type="file" accept=".xlsx" required />
        <p class="helper-text">We take the <strong>first worksheet</strong> automatically.</p>
        <p class="error-text" data-error="file" hidden></p>
      </div>
      <div class="form-field">
        <label for="import-title">Title</label>
        <input id="import-title" name="title" type="text" value="${values.title || ''}" required />
        <p class="error-text" data-error="title" hidden></p>
      </div>
      <label class="checkbox-field">
        <input name="duplicatePolicy" type="checkbox" ${values.duplicatePolicy === 'first' ? 'checked' : ''} />
        <span>
          On duplicate IDs, keep the <strong>first occurrence</strong>.<br />
          <span class="helper-text">If unchecked, duplicates cause an error.</span>
        </span>
      </label>
      <div class="form-field">
        <label for="id-column">Unique ID column name</label>
        <input id="id-column" name="idColumn" type="text" value="${values.idColumn || ''}" />
        <p class="helper-text">If <strong>not set</strong>, the system will generate an index.</p>
        <p class="error-text" data-error="idColumn" hidden></p>
      </div>
      <div class="modal-footer">
        <button class="button button--ghost" type="button" data-cancel>Cancel</button>
        <button class="button" type="submit">Next</button>
      </div>
    </form>
  `;

  const form = container.querySelector('[data-stage-one]');
  const cancel = form.querySelector('[data-cancel]');
  cancel.addEventListener('click', () => closeModal());
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    handleStageOneSubmit(new FormData(form));
  });
  const firstInput = form.querySelector('input');
  firstInput?.focus();
}

function buildMappingRow({ header, value, datalistId }) {
  const safeHeader = escapeHtml(header);
  const safeValue = escapeHtml(value || '');
  const attrHeader = String(header || '').replace(/"/g, '&quot;');
  return `
    <div class="mapping-row">
      <strong>${safeHeader}</strong>
      <input
        type="text"
        name="mapping"
        data-raw-header="${attrHeader}"
        value="${safeValue}"
        list="${datalistId}"
        placeholder="Start typing to map or create"
      />
    </div>
  `;
}

function renderStageTwo({ headers, pairs, allowBack = true, title }) {
  const modal = document.querySelector('[data-import-modal]');
  const container = select(modal, '[data-import-stage]');
  if (!container) return;
  const datalistId = 'asset-field-suggestions';
  const suggestions = Array.from(new Set([...(state.assetFieldSuggestions || [])]));
  const inputs = headers
    .map((header) => {
      const existing = pairs.find((pair) => pair.rawHeader === header);
      return buildMappingRow({ header, value: existing?.assetField || '', datalistId });
    })
    .join('');

  container.innerHTML = `
    <div class="mapping-tip">Map your file’s headers to Asset Pool fields. Only mapped columns appear in the Asset Pool.</div>
    <form class="form-grid" data-stage-two>
      <div class="mapping-list">
        ${inputs}
      </div>
      <div class="modal-footer">
        ${allowBack ? '<button class="button button--ghost" type="button" data-back>Back</button>' : ''}
        <button class="button button--ghost" type="button" data-cancel>Cancel</button>
        <button class="button" type="submit">${state.modal.mode === 'edit' ? 'Update mappings' : 'Import'}</button>
      </div>
      <p class="error-text" data-error="general" hidden></p>
    </form>
    <datalist id="${datalistId}">
      ${suggestions.map((item) => `<option value="${escapeHtml(item)}"></option>`).join('')}
    </datalist>
  `;

  const form = container.querySelector('[data-stage-two]');
  const cancel = form.querySelector('[data-cancel]');
  cancel.addEventListener('click', () => closeModal());
  const back = form.querySelector('[data-back]');
  if (back) {
    back.addEventListener('click', () => {
      renderStageOne();
    });
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    handleStageTwoSubmit(form);
  });
  const firstInput = form.querySelector('input[name="mapping"]');
  firstInput?.focus();
  if (title) {
    const modalTitle = document.getElementById('import-modal-title');
    if (modalTitle) {
      modalTitle.textContent = title;
    }
  }
}

function renderEditModal({ table, pairs }) {
  const modal = document.querySelector('[data-import-modal]');
  const container = select(modal, '[data-import-stage]');
  if (!container) return;

  const datalistId = 'asset-field-suggestions';
  const suggestions = Array.from(new Set([...(state.assetFieldSuggestions || [])]));
  const headers = Array.isArray(table.headers) ? table.headers : [];
  const inputs = headers
    .map((header) => {
      const existing = pairs.find((pair) => pair.rawHeader === header);
      return buildMappingRow({ header, value: existing?.assetField || '', datalistId });
    })
    .join('');

  const modalTitle = document.getElementById('import-modal-title');
  if (modalTitle) {
    modalTitle.textContent = `Edit ${table.title}`;
  }

  container.innerHTML = `
    <div class="tab-group" data-edit-tabs>
      <div class="tab-list" role="tablist">
        <button class="tab-button is-active" type="button" role="tab" aria-selected="true" data-tab="mapping">Mapping</button>
        <button class="tab-button" type="button" role="tab" aria-selected="false" data-tab="admin">Administration</button>
      </div>
      <div class="tab-panels">
        <section class="tab-panel" data-panel="mapping" role="tabpanel">
          <div class="mapping-tip">Map your file’s headers to Asset Pool fields. Only mapped columns appear in the Asset Pool.</div>
          <form class="form-grid" data-stage-two>
            <div class="mapping-list">
              ${inputs}
            </div>
            <div class="modal-footer">
              <button class="button button--ghost" type="button" data-cancel>Cancel</button>
              <button class="button" type="submit">Update mappings</button>
            </div>
            <p class="error-text" data-error="general" hidden></p>
          </form>
        </section>
        <section class="tab-panel" data-panel="admin" role="tabpanel" aria-hidden="true" hidden>
          <form class="form-grid" data-admin-form>
            <div class="form-field">
              <label for="raw-title">Name</label>
              <input id="raw-title" name="title" type="text" value="${escapeHtml(table.title)}" required />
              <p class="error-text" data-error="title" hidden></p>
            </div>
            <div class="form-field">
              <label for="raw-description">Description</label>
              <textarea id="raw-description" name="description" rows="4">${escapeHtml(table.description || '')}</textarea>
            </div>
            <p class="error-text" data-error="general" hidden></p>
            <div class="modal-footer">
              <button class="button" type="submit">Save changes</button>
            </div>
          </form>
          <div class="danger-zone">
            <h3>Delete table</h3>
            <p>Remove this raw table and all of its data from the Asset Pool.</p>
            <button class="button button--danger" type="button" data-delete-table>Delete table</button>
          </div>
        </section>
      </div>
    </div>
    <datalist id="${datalistId}">
      ${suggestions.map((item) => `<option value="${escapeHtml(item)}"></option>`).join('')}
    </datalist>
  `;

  const tabButtons = selectAll(container, '[data-tab]');
  const panels = selectAll(container, '[data-panel]');

  const focusTargets = {
    mapping: () => container.querySelector('[data-panel="mapping"] input[name="mapping"]'),
    admin: () => container.querySelector('[data-panel="admin"] input[name="title"]')
  };

  function activateTab(name) {
    tabButtons.forEach((button) => {
      const isActive = button.dataset.tab === name;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    panels.forEach((panel) => {
      const isActive = panel.dataset.panel === name;
      panel.hidden = !isActive;
      if (isActive) {
        panel.removeAttribute('aria-hidden');
      } else {
        panel.setAttribute('aria-hidden', 'true');
      }
    });
  }

  tabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const target = button.dataset.tab;
      activateTab(target);
      const focusTarget = focusTargets[target]?.();
      focusTarget?.focus();
    });
  });

  activateTab('mapping');

  const mappingForm = container.querySelector('[data-stage-two]');
  const cancel = mappingForm.querySelector('[data-cancel]');
  cancel.addEventListener('click', () => closeModal());
  mappingForm.addEventListener('submit', (event) => {
    event.preventDefault();
    handleStageTwoSubmit(mappingForm);
  });
  const firstInput = mappingForm.querySelector('input[name="mapping"]');
  firstInput?.focus();

  const adminForm = container.querySelector('[data-admin-form]');
  const adminTitleError = adminForm.querySelector('[data-error="title"]');
  const adminGeneralError = adminForm.querySelector('[data-error="general"]');

  adminForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (adminTitleError) {
      adminTitleError.hidden = true;
      adminTitleError.textContent = '';
    }
    if (adminGeneralError) {
      adminGeneralError.hidden = true;
      adminGeneralError.textContent = '';
    }

    adminForm.dataset.loading = 'true';

    const formData = new FormData(adminForm);
    const title = (formData.get('title') || '').trim();
    const description = (formData.get('description') || '').trim();

    if (!title) {
      if (adminTitleError) {
        adminTitleError.hidden = false;
        adminTitleError.textContent = 'Name is required.';
      }
      delete adminForm.dataset.loading;
      return;
    }

    try {
      const result = await fetchJson(`${API.rawTables}/${state.modal.rawTableId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description })
      });

      const updated = result.table || { id: state.modal.rawTableId, title, description };
      state.modal.tableTitle = updated.title;

      if (state.currentRawDetail) {
        state.currentRawDetail.table.title = updated.title;
        state.currentRawDetail.table.description = updated.description || '';
      }

      const root = document.querySelector('[data-app="asset-pool"]');
      if (modalTitle) {
        modalTitle.textContent = `Edit ${updated.title}`;
      }

      await refreshRawTables();
      await refreshAssetPool();

      if (root && root.dataset.view === 'raw') {
        const titleEl = select(root, '.page-title');
        if (titleEl) {
          titleEl.textContent = updated.title;
        }
      }

      showToast('Raw table details updated.');
    } catch (err) {
      if (err.payload?.fieldErrors?.title) {
        if (adminTitleError) {
          adminTitleError.hidden = false;
          adminTitleError.textContent = err.payload.fieldErrors.title;
        }
      } else if (adminGeneralError) {
        adminGeneralError.hidden = false;
        adminGeneralError.textContent = err.payload?.error || err.message;
      }
    } finally {
      delete adminForm.dataset.loading;
    }
  });

  const deleteButton = container.querySelector('[data-delete-table]');
  if (deleteButton) {
    deleteButton.addEventListener('click', async () => {
      if (!state.modal.rawTableId) {
        return;
      }
      const confirmed = window.confirm('Delete this raw table? This action cannot be undone.');
      if (!confirmed) {
        return;
      }
      deleteButton.disabled = true;
      const origin = state.modal.origin;
      const deletedTitle = table.title;
      try {
        await fetchJson(`${API.rawTables}/${state.modal.rawTableId}`, {
          method: 'DELETE'
        });

        closeModal();
        state.currentRawDetail = null;

        await refreshRawTables();
        await refreshAssetPool();

        const message = `Deleted ${deletedTitle}.`;

        if (origin === 'raw') {
          try {
            sessionStorage.setItem(TOAST_STORAGE_KEY, message);
          } catch (err) {
            // Storage might be unavailable; ignore.
          }
          const next = state.rawTables[0];
          if (next) {
            window.location.href = `/asset-pool/raw/${next.id}`;
          } else {
            window.location.href = '/asset-pool';
          }
          return;
        }

        showToast(message);
      } catch (err) {
        deleteButton.disabled = false;
        if (adminGeneralError) {
          adminGeneralError.hidden = false;
          adminGeneralError.textContent = err.payload?.error || err.message;
        }
      }
    });
  }
}

async function handleStageOneSubmit(formData) {
  const modal = document.querySelector('[data-import-modal]');
  const container = select(modal, '[data-import-stage]');
  const form = container.querySelector('[data-stage-one]');
  selectAll(form, '.error-text').forEach((el) => {
    el.hidden = true;
    el.textContent = '';
  });
  state.modal.stageOneValues = {
    title: formData.get('title'),
    idColumn: formData.get('idColumn'),
    duplicatePolicy: formData.get('duplicatePolicy') ? 'first' : 'error'
  };
  form.dataset.loading = 'true';

  if (!formData.get('duplicatePolicy')) {
    formData.set('duplicatePolicy', 'error');
  } else {
    formData.set('duplicatePolicy', 'first');
  }

  try {
    const preview = await fetchJson(`${API.rawTables}/preview`, {
      method: 'POST',
      body: formData
    });
    state.modal.preview = preview;
    state.assetFieldSuggestions = Array.from(
      new Set([...(preview.assetFieldSuggestions || []), ...state.assetFieldSuggestions])
    );
    renderStageTwo({
      headers: preview.headers,
      pairs: [],
      allowBack: true,
      title: `Map columns for ${preview.title}`
    });
  } catch (err) {
    const { payload } = err;
    if (payload?.fieldErrors) {
      Object.entries(payload.fieldErrors).forEach(([field, message]) => {
        const el = form.querySelector(`[data-error="${field}"]`);
        if (el) {
          el.hidden = false;
          el.textContent = message;
        }
      });
    } else if (payload?.error) {
      const general = form.querySelector('[data-error="file"]') || form.querySelector('.error-text');
      if (general) {
        general.hidden = false;
        general.textContent = payload.error;
      }
    }
  } finally {
    delete form.dataset.loading;
  }
}

async function handleStageTwoSubmit(form) {
  const inputs = selectAll(form, 'input[name="mapping"]');
  const mappings = inputs
    .map((input) => ({
      rawHeader: input.dataset.rawHeader,
      assetField: input.value.trim()
    }))
    .filter((entry) => entry.assetField);

  const errorEl = form.querySelector('[data-error="general"]');
  if (!mappings.length) {
    if (errorEl) {
      errorEl.hidden = false;
      errorEl.textContent = 'Please map at least one column before continuing.';
    }
    return;
  }

  form.dataset.loading = 'true';
  if (errorEl) {
    errorEl.hidden = true;
    errorEl.textContent = '';
  }

  try {
    if (state.modal.mode === 'edit') {
      await fetchJson(`${API.rawTables}/${state.modal.rawTableId}/mapping`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappings })
      });
      closeModal();
      showToast('Mappings updated. Asset Pool refreshed.');
      await refreshAssetPool();
      if (state.modal.origin === 'raw') {
        renderRawTable(document.querySelector('[data-app="asset-pool"]'));
      }
    } else {
      const preview = state.modal.preview;
      const result = await fetchJson(`${API.rawTables}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ previewId: preview.previewId, mappings })
      });
      closeModal();
      const message = `Imported ${preview.title}. Asset Pool updated.`;
      if (state.modal.origin === 'raw') {
        sessionStorage.setItem(TOAST_STORAGE_KEY, message);
        window.location.href = `/asset-pool/raw/${result.rawTableId}`;
        return;
      }
      showToast(message);
      await refreshRawTables();
      await refreshAssetPool();
    }
  } catch (err) {
    const message = err.payload?.error || err.message;
    if (errorEl) {
      errorEl.hidden = false;
      errorEl.textContent = message;
    }
  } finally {
    delete form.dataset.loading;
  }
}

async function refreshRawTables() {
  try {
    const data = await fetchJson(API.rawTables);
    state.rawTables = data;
    const root = document.querySelector('[data-app="asset-pool"]');
    if (root) {
      renderSidebar(root);
    }
  } catch (err) {
    console.error(err);
  }
}

async function refreshAssetPool() {
  try {
    const data = await fetchJson(API.assetPool);
    state.assetPool = data;
    const fieldStats = Array.isArray(data?.fieldStats) ? data.fieldStats : [];
    const statNames = fieldStats.map((stat) => stat.field);
    const statSet = new Set(statNames);
    const preserved = state.assetFieldSuggestions.filter((field) => statSet.has(field));
    state.assetFieldSuggestions = Array.from(new Set([...preserved, ...statNames]));
    state.assetPoolPage = 1;
    const root = document.querySelector('[data-app="asset-pool"]');
    if (root) {
      if (root.dataset.view === 'overview') {
        renderAssetPool(root);
      } else {
        renderFieldManager(root);
      }
    }
  } catch (err) {
    console.error(err);
  }
}

function setupImportButtons(root) {
  selectAll(root, '[data-open-import]').forEach((button) => {
    button.addEventListener('click', () => {
      state.modal.stageOneValues = null;
      state.modal.preview = null;
      state.modal.mode = 'import';
      state.modal.rawTableId = null;
      state.modal.tableTitle = '';
      state.modal.redirectId = null;
      openModal({ mode: 'import', origin: root.dataset.view });
      renderStageOne();
    });
  });
}

function setupCloseModal() {
  const modal = document.querySelector('[data-import-modal]');
  const closeButton = select(modal, '[data-close-modal]');
  closeButton?.addEventListener('click', () => closeModal());
  modal?.addEventListener('click', handleModalOverlay);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.modal.isOpen) {
      closeModal();
    }
  });
}

function setupEditMapping(root) {
  const button = select(root, '[data-edit-mapping]');
  if (!button) return;
  button.addEventListener('click', () => {
    if (!state.currentRawDetail) {
      return;
    }
    const { table, mapping } = state.currentRawDetail;
    state.modal.mode = 'edit';
    state.modal.rawTableId = table.id;
    state.modal.tableTitle = table.title;
    state.modal.preview = null;
    openModal({ mode: 'edit', origin: 'raw' });
    renderEditModal({
      table,
      pairs: mapping || []
    });
  });
}

let structureModalOpenCount = 0;

function createStructureModalController(modal) {
  let lastFocus = null;
  let isOpen = false;

  function focusInitial() {
    const focusTarget =
      select(modal, '[data-auto-focus]') || select(modal, 'input, select, textarea, button');
    focusTarget?.focus();
  }

  function open(trigger) {
    if (isOpen) {
      return;
    }
    lastFocus = trigger || document.activeElement;
    modal.hidden = false;
    modal.removeAttribute('aria-hidden');
    modal.setAttribute('tabindex', '-1');
    structureModalOpenCount += 1;
    if (structureModalOpenCount === 1) {
      document.body.style.overflow = 'hidden';
    }
    isOpen = true;
    focusInitial();
  }

  function close() {
    if (!isOpen) {
      return;
    }
    isOpen = false;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    structureModalOpenCount = Math.max(0, structureModalOpenCount - 1);
    if (structureModalOpenCount === 0) {
      document.body.style.overflow = '';
    }
    if (lastFocus && typeof lastFocus.focus === 'function') {
      lastFocus.focus();
    }
  }

  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      close();
    }
  });

  selectAll(modal, '[data-close-structure-modal]').forEach((button) => {
    button.addEventListener('click', () => close());
  });

  return {
    open,
    close,
    isOpen: () => isOpen
  };
}

function setupStructureModals(root) {
  const controllers = new Map();
  selectAll(document, '[data-structure-modal]').forEach((modal) => {
    const key = modal.dataset.structureModal;
    if (key) {
      controllers.set(key, createStructureModalController(modal));
    }
  });

  selectAll(root, '[data-open-structure-modal]').forEach((button) => {
    const key = button.dataset.openStructureModal;
    if (!key) {
      return;
    }
    const controller = controllers.get(key);
    if (!controller) {
      return;
    }
    button.addEventListener('click', () => controller.open(button));
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') {
      return;
    }
    const openController = Array.from(controllers.values()).find((controller) => controller.isOpen());
    openController?.close();
  });
}

function setupCreateCategoryForm(root) {
  const modal = document.querySelector('[data-structure-modal="category"]');
  const form = modal?.querySelector('form');
  const saveButton = modal?.querySelector('[data-save-category]');
  if (!modal || !form || !saveButton) {
    return;
  }

  const titleInput = form.querySelector('input[name="title"]');
  titleInput?.addEventListener('input', () => {
    titleInput.removeAttribute('aria-invalid');
  });

  let isSubmitting = false;

  saveButton.addEventListener('click', async () => {
    if (isSubmitting) {
      return;
    }

    const formData = new FormData(form);
    const payload = {};
    for (const [key, value] of formData.entries()) {
      payload[key] = typeof value === 'string' ? value.trim() : value;
    }

    const title = payload.title || '';
    if (!title) {
      if (titleInput) {
        titleInput.setAttribute('aria-invalid', 'true');
        titleInput.focus();
      }
      return;
    }

    payload.title = title;
    payload.name = payload.name || title;
    if (payload.owner && !payload.group_owner) {
      payload.group_owner = payload.owner;
    }

    isSubmitting = true;
    saveButton.disabled = true;
    saveButton.dataset.loading = 'true';

    try {
      await fetchJson(API.categories, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      window.location.assign('/asset-structure');
    } catch (error) {
      console.error('Failed to create category', error);
      alert('Failed to save category. Please try again.');
    } finally {
      isSubmitting = false;
      saveButton.disabled = false;
      delete saveButton.dataset.loading;
    }
  });
}

function setupCreateGroupForm(root) {
  const categoryId = Number(root?.dataset.categoryId || '');
  if (!Number.isFinite(categoryId) || categoryId <= 0) {
    return;
  }

  const modal = document.querySelector('[data-structure-modal="group"]');
  const form = modal?.querySelector('form');
  const saveButton = modal?.querySelector('[data-save-group]');
  if (!modal || !form || !saveButton) {
    return;
  }

  const titleInput = form.querySelector('input[name="title"]');
  titleInput?.addEventListener('input', () => {
    titleInput.removeAttribute('aria-invalid');
  });

  let isSubmitting = false;

  saveButton.addEventListener('click', async () => {
    if (isSubmitting) {
      return;
    }

    const formData = new FormData(form);
    const payload = {};
    for (const [key, value] of formData.entries()) {
      payload[key] = typeof value === 'string' ? value.trim() : value;
    }

    const title = payload.title || '';
    if (!title) {
      if (titleInput) {
        titleInput.setAttribute('aria-invalid', 'true');
        titleInput.focus();
      }
      return;
    }

    payload.title = title;

    isSubmitting = true;
    saveButton.disabled = true;
    saveButton.dataset.loading = 'true';

    try {
      const response = await fetchJson(API.groups, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const groupId = Number(response?.id);
      if (Number.isFinite(groupId) && groupId > 0) {
        await fetchJson(`${API.groups}/${groupId}/link-category`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category_id: categoryId })
        });
      }

      window.location.reload();
    } catch (error) {
      console.error('Failed to create group', error);
      alert('Failed to save group. Please try again.');
    } finally {
      isSubmitting = false;
      saveButton.disabled = false;
      delete saveButton.dataset.loading;
    }
  });
}

function initAssetStructureApp() {
  const root = document.querySelector('[data-app="asset-structure"]');
  if (!root) return;
  setupStructureModals(root);
  setupCreateCategoryForm(root);
  setupCreateGroupForm(root);
}

async function initAssetPoolApp() {
  const root = document.querySelector('[data-app="asset-pool"]');
  if (!root) return;

  consumePendingToast();
  setupImportButtons(root);
  setupFieldManager(root);
  setupCloseModal();
  renderSidebar(root);

  await refreshRawTables();
  await refreshAssetPool();

  if (root.dataset.view === 'overview') {
    renderAssetPool(root);
  } else if (root.dataset.view === 'raw') {
    setupEditMapping(root);
    renderRawTable(root);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initAssetPoolApp();
  initAssetStructureApp();
});
