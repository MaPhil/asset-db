const API = {
  rawTables: '/api/v1/raw-tables',
  assetPool: '/api/v1/asset-pool'
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
  }
};

function select(root, selector) {
  return root ? root.querySelector(selector) : null;
}

function selectAll(root, selector) {
  return root ? Array.from(root.querySelectorAll(selector)) : [];
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

  if (!columns.length || !rows.length) {
    state.assetPoolPage = 1;
    container.innerHTML = '';
    const placeholder = document.createElement('div');
    placeholder.className = 'card card--empty';
    placeholder.innerHTML = `
      <h2>No mapped columns yet</h2>
      <p>Map at least one column from a raw table to see data in the Asset Pool.</p>
    `;
    container.appendChild(placeholder);
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
  tableWrapper.appendChild(table);

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
      state.assetFieldSuggestions = Array.from(
        new Set([...(data.assetPool?.columns || []), ...state.assetFieldSuggestions])
      );
      if (metaBadge) {
        metaBadge.textContent = `${formatDate(data.table.uploadedAt)} · ${data.table.sourceFileName}`;
      }
      if (titleEl) {
        titleEl.textContent = data.table.title;
      }
      if (!data.rows.length) {
        if (tableContainer) {
          tableContainer.hidden = true;
          tableContainer.innerHTML = '';
        }
        if (emptyCard) {
          emptyCard.hidden = false;
        }
        return;
      }

      if (emptyCard) {
        emptyCard.hidden = true;
      }
      if (tableContainer) {
        tableContainer.hidden = false;
        const wrapper = document.createElement('div');
        wrapper.className = 'table-wrapper';
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
        wrapper.appendChild(table);
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
  return `
    <div class="mapping-row">
      <strong>${header}</strong>
      <input
        type="text"
        name="mapping"
        data-raw-header="${header.replace(/"/g, '&quot;')}"
        value="${value || ''}"
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
      ${suggestions.map((item) => `<option value="${item}"></option>`).join('')}
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
    state.assetFieldSuggestions = Array.from(new Set([...(data?.columns || []), ...state.assetFieldSuggestions]));
    state.assetPoolPage = 1;
    const root = document.querySelector('[data-app="asset-pool"]');
    if (root && root.dataset.view === 'overview') {
      renderAssetPool(root);
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
    renderStageTwo({
      headers: table.headers,
      pairs: mapping || [],
      allowBack: false,
      title: `Edit mappings for ${table.title}`
    });
  });
}

async function initAssetPoolApp() {
  const root = document.querySelector('[data-app="asset-pool"]');
  if (!root) return;

  consumePendingToast();
  setupImportButtons(root);
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
});
