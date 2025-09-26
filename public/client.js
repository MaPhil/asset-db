const API = {
  rawTables: '/api/v1/raw-tables',
  assetPool: '/api/v1/asset-pool',
  assetPoolFields: '/api/v1/asset-pool/fields',
  assetTypeField: '/api/v1/asset-pool/settings/asset-type-field',
  assetTypes: '/api/v1/asset-types',
  categories: '/api/v1/categories',
  groups: '/api/v1/groups',
  groupAssetTypes: (groupId) => `/api/v1/groups/${groupId}/asset-types`,
  groupAssetType: (groupId, assetTypeId) =>
    `/api/v1/groups/${groupId}/asset-types/${assetTypeId}`,
  groupAssetTypesAvailable: (groupId) =>
    `/api/v1/groups/${groupId}/asset-types/available`
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
    error: null,
    trigger: null
  },
  assetTypeFieldModal: {
    isOpen: false,
    isSaving: false,
    trigger: null,
    error: null
  },
  assetTypeDecisionModal: {
    isOpen: false,
    isSaving: false,
    activeButton: null,
    error: null
  },
  groupAssetTypeModal: {
    isOpen: false,
    isLoading: false,
    isSaving: false,
    trigger: null,
    options: [],
    error: null
  }
};

let structureModalOpenCount = 0;

function lockBodyScroll() {
  document.body.style.overflow = 'hidden';
}

function unlockBodyScrollIfIdle() {
  const anyModalOpen =
    state.modal.isOpen ||
    state.fieldManager.isOpen ||
    state.assetTypeFieldModal.isOpen ||
    state.assetTypeDecisionModal.isOpen ||
    state.groupAssetTypeModal.isOpen ||
    structureModalOpenCount > 0;
  if (!anyModalOpen) {
    document.body.style.overflow = '';
  }
}

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
    const error = new Error(payload.error || 'Anforderung fehlgeschlagen');
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
    empty.textContent = 'Noch keine Rohdatentabellen.';
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
  return `${count} ${count === 1 ? 'Eintrag' : 'Einträge'}`;
}

function renderFieldManager(root) {
  const modal = document.querySelector('[data-field-manager-modal]');
  const panel = select(modal, '[data-field-manager]');
  const trigger = select(root, '[data-open-field-manager]');
  if (!modal || !panel || !trigger) return;

  const list = select(panel, '[data-field-list]');
  const error = select(panel, '[data-field-error]');
  if (!list || !error) return;

  const fieldStats = Array.isArray(state.assetPool?.fieldStats) ? state.assetPool.fieldStats : [];
  list.innerHTML = '';

  if (!fieldStats.length) {
    const empty = document.createElement('p');
    empty.className = 'field-manager__empty';
    empty.textContent = 'Keine Zuordnungsfelder verfügbar.';
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
      remove.textContent = state.fieldManager.busyField === stat.field ? 'Wird entfernt…' : 'Entfernen';
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

  if (state.fieldManager.isOpen) {
    modal.hidden = false;
    modal.removeAttribute('aria-hidden');
  } else {
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
  }

  trigger.setAttribute('aria-expanded', state.fieldManager.isOpen ? 'true' : 'false');
}

function openFieldManager(root, trigger) {
  if (state.fieldManager.isOpen) {
    return;
  }

  state.fieldManager.isOpen = true;
  state.fieldManager.error = null;
  state.fieldManager.trigger = trigger || null;
  renderFieldManager(root);
  const modal = document.querySelector('[data-field-manager-modal]');
  const panel = select(modal, '[data-field-manager]');
  if (panel && typeof panel.focus === 'function') {
    panel.focus();
  }
  lockBodyScroll();
}

function closeFieldManager(root) {
  if (state.fieldManager.busyField) {
    return;
  }
  if (!state.fieldManager.isOpen) {
    return;
  }

  state.fieldManager.isOpen = false;
  state.fieldManager.error = null;
  renderFieldManager(root);

  const trigger = state.fieldManager.trigger;
  state.fieldManager.trigger = null;
  if (trigger && typeof trigger.focus === 'function') {
    trigger.focus();
  }

  unlockBodyScrollIfIdle();
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
      ? `Zuordnungsfeld „${field}“ wurde entfernt.`
      : `Keine Zuordnungen nutzten „${field}“.`;
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
  const modal = document.querySelector('[data-field-manager-modal]');
  const panel = select(modal, '[data-field-manager]');
  if (!trigger || !modal || !panel) return;

  if (!panel.hasAttribute('tabindex')) {
    panel.setAttribute('tabindex', '-1');
  }

  trigger.addEventListener('click', () => {
    if (state.fieldManager.isOpen) {
      closeFieldManager(root);
    } else {
      openFieldManager(root, trigger);
    }
  });

  const closeButtons = selectAll(modal, '[data-close-field-manager]');
  closeButtons.forEach((button) => {
    button.addEventListener('click', () => closeFieldManager(root));
  });

  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      closeFieldManager(root);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.fieldManager.isOpen) {
      closeFieldManager(root);
    }
  });
}

function populateAssetTypeFieldSelect(modal) {
  const selectEl = select(modal, '[data-asset-type-field-select]');
  const helper = select(modal, '[data-asset-type-field-helper]');
  const errorEl = select(modal, '[data-asset-type-field-error]');
  const saveButton = select(modal, '[data-save-asset-type-field]');
  if (!selectEl || !helper) {
    return;
  }

  const stats = Array.isArray(state.assetPool?.fieldStats) ? state.assetPool.fieldStats : [];
  const current = state.assetPool?.assetTypeField || '';
  const options = [];
  const seen = new Set();

  stats.forEach((stat) => {
    const field = stat?.field;
    if (!field) {
      return;
    }
    if (seen.has(field)) {
      return;
    }
    seen.add(field);
    options.push({ name: field, missing: false });
  });

  if (current && !seen.has(current)) {
    options.unshift({ name: current, missing: true });
  }

  selectEl.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Feld auswählen';
  selectEl.appendChild(placeholder);

  options.forEach((option) => {
    const opt = document.createElement('option');
    opt.value = option.name;
    opt.textContent = option.missing
      ? `${option.name} (no longer available)`
      : option.name;
    selectEl.appendChild(opt);
  });

  selectEl.value = current || '';
  selectEl.disabled = options.length === 0;

  helper.textContent = options.length
    ? 'Nur zugeordnete Felder mit Daten erscheinen in dieser Liste.'
    : 'Fügen Sie Zuordnungsfelder hinzu, um einen Asset-Typ auszuwählen.';

  if (errorEl) {
    if (state.assetTypeFieldModal.error) {
      errorEl.hidden = false;
      errorEl.textContent = state.assetTypeFieldModal.error;
    } else {
      errorEl.hidden = true;
      errorEl.textContent = '';
    }
  }

  if (saveButton) {
    saveButton.disabled = state.assetTypeFieldModal.isSaving;
  }
}

function openAssetTypeFieldModal(trigger) {
  const modal = document.querySelector('[data-asset-type-modal]');
  if (!modal || state.assetTypeFieldModal.isOpen) {
    return;
  }

  state.assetTypeFieldModal.isOpen = true;
  state.assetTypeFieldModal.trigger = trigger || null;
  state.assetTypeFieldModal.error = null;

  trigger?.setAttribute('aria-expanded', 'true');

  populateAssetTypeFieldSelect(modal);

  modal.hidden = false;
  modal.removeAttribute('aria-hidden');
  if (!modal.hasAttribute('tabindex')) {
    modal.setAttribute('tabindex', '-1');
  }
  modal.focus?.();

  if (!state.modal.isOpen) {
    lockBodyScroll();
  }
}

function closeAssetTypeFieldModal() {
  if (!state.assetTypeFieldModal.isOpen) {
    return;
  }

  const modal = document.querySelector('[data-asset-type-modal]');
  state.assetTypeFieldModal.isOpen = false;
  state.assetTypeFieldModal.isSaving = false;

  if (modal) {
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
  }

  const trigger = state.assetTypeFieldModal.trigger;
  if (trigger) {
    trigger.setAttribute('aria-expanded', 'false');
    if (typeof trigger.focus === 'function') {
      trigger.focus();
    }
  }

  state.assetTypeFieldModal.trigger = null;
  state.assetTypeFieldModal.error = null;

  if (!state.modal.isOpen) {
    unlockBodyScrollIfIdle();
  }
}

function setupAssetTypeFieldModal(root) {
  const trigger = select(root, '[data-open-asset-type-modal]');
  const modal = document.querySelector('[data-asset-type-modal]');
  if (!trigger || !modal) {
    return;
  }

  const saveButton = select(modal, '[data-save-asset-type-field]');
  const cancelButton = select(modal, '[data-cancel-asset-type-modal]');
  const closeButton = select(modal, '[data-close-asset-type-modal]');
  const selectEl = select(modal, '[data-asset-type-field-select]');
  const errorEl = select(modal, '[data-asset-type-field-error]');

  trigger.addEventListener('click', () => {
    if (state.assetTypeFieldModal.isOpen) {
      closeAssetTypeFieldModal();
    } else {
      openAssetTypeFieldModal(trigger);
    }
  });

  cancelButton?.addEventListener('click', () => closeAssetTypeFieldModal());
  closeButton?.addEventListener('click', () => closeAssetTypeFieldModal());

  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      closeAssetTypeFieldModal();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.assetTypeFieldModal.isOpen) {
      closeAssetTypeFieldModal();
    }
  });

  saveButton?.addEventListener('click', async () => {
    if (state.assetTypeFieldModal.isSaving) {
      return;
    }

    if (!selectEl) {
      return;
    }

    state.assetTypeFieldModal.isSaving = true;
    state.assetTypeFieldModal.error = null;
    if (errorEl) {
      errorEl.hidden = true;
      errorEl.textContent = '';
    }
    saveButton.disabled = true;

    const value = selectEl.disabled ? '' : selectEl.value;
    const payload = { field: value || null };

    try {
      const result = await fetchJson(API.assetTypeField, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      await refreshAssetPool();
      const field = result?.field;
      if (field) {
        showToast(`Feld für Asset-Typ auf „${field}“ gesetzt.`);
      } else {
        showToast('Feld für Asset-Typ gelöscht.');
      }
      closeAssetTypeFieldModal();
    } catch (error) {
      const message = error?.payload?.error || error?.message || 'Speichern des Felds für Asset-Typ fehlgeschlagen.';
      state.assetTypeFieldModal.error = message;
      if (errorEl) {
        errorEl.hidden = false;
        errorEl.textContent = message;
      }
    } finally {
      state.assetTypeFieldModal.isSaving = false;
      saveButton.disabled = false;
      if (state.assetTypeFieldModal.isOpen) {
        populateAssetTypeFieldSelect(modal);
      }
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
      <h2>Noch keine zugeordneten Zeilen</h2>
      <p>Ordnen Sie mindestens eine Spalte aus einer Rohdatentabelle zu, um den Asset-Pool zu füllen.</p>
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
    { key: '__rowId', label: 'Zeilen-ID' },
    { key: '__table', label: 'Rohdatentabelle' },
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
    cell.textContent = 'Für die aktuellen Filter sind keine Zeilen verfügbar.';
    row.appendChild(cell);
    tbody.appendChild(row);
  } else {
    pageRows.forEach((row) => {
      const tr = document.createElement('tr');
      const rowIdCell = document.createElement('td');
      rowIdCell.textContent = row.id;
      tr.appendChild(rowIdCell);

      const tableCell = document.createElement('td');
      tableCell.textContent = row.rawTableTitle || `Rohdatentabelle ${row.rawTableId}`;
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
  info.textContent = `Angezeigt: ${Math.min(sortedRows.length, start + 1)}-${Math.min(
    sortedRows.length,
    start + pageRows.length
  )} von ${sortedRows.length}`;
  pagination.appendChild(info);

  const controls = document.createElement('div');
  controls.className = 'pagination-controls';
  const prev = document.createElement('button');
  prev.type = 'button';
  prev.textContent = 'Zurück';
  prev.disabled = state.assetPoolPage === 1;
  prev.addEventListener('click', () => {
    state.assetPoolPage = Math.max(1, state.assetPoolPage - 1);
    renderAssetPool(root);
  });
  const next = document.createElement('button');
  next.type = 'button';
  next.textContent = 'Weiter';
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
        titleEl.textContent = 'Rohdatentabelle nicht verfügbar';
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
    modalTitle.textContent = 'Rohdatentabelle importieren';
  }

  container.innerHTML = `
    <form class="form-grid" data-stage-one>
      <div class="form-field">
        <label for="import-file">Excel-Datei (.xlsx)</label>
        <input id="import-file" name="file" type="file" accept=".xlsx" required />
        <p class="helper-text">Das <strong>erste Arbeitsblatt</strong> wird automatisch übernommen.</p>
        <p class="error-text" data-error="file" hidden></p>
      </div>
      <div class="form-field">
        <label for="import-title">Titel</label>
        <input id="import-title" name="title" type="text" value="${values.title || ''}" required />
        <p class="error-text" data-error="title" hidden></p>
      </div>
      <label class="checkbox-field">
        <input name="duplicatePolicy" type="checkbox" ${values.duplicatePolicy === 'first' ? 'checked' : ''} />
        <span>
          Bei doppelten IDs die <strong>erste Vorkommnis</strong> behalten.<br />
          <span class="helper-text">Wenn nicht aktiviert, führen Duplikate zu einem Fehler.</span>
        </span>
      </label>
      <div class="form-field">
        <label for="id-column">Spaltenname für eindeutige ID</label>
        <input id="id-column" name="idColumn" type="text" value="${values.idColumn || ''}" />
        <p class="helper-text">Wenn <strong>nicht angegeben</strong>, erstellt das System einen Index.</p>
        <p class="error-text" data-error="idColumn" hidden></p>
      </div>
      <div class="modal-footer">
        <button class="button button--ghost" type="button" data-cancel>Abbrechen</button>
        <button class="button" type="submit">Weiter</button>
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
        placeholder="Beginnen Sie zu tippen, um zuzuordnen oder zu erstellen"
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
    <div class="mapping-tip">Ordnen Sie die Kopfzeilen Ihrer Datei den Asset-Pool-Feldern zu. Nur zugeordnete Spalten erscheinen im Asset-Pool.</div>
    <form class="form-grid" data-stage-two>
      <div class="mapping-list">
        ${inputs}
      </div>
      <div class="modal-footer">
        ${allowBack ? '<button class="button button--ghost" type="button" data-back>Zurück</button>' : ''}
        <button class="button button--ghost" type="button" data-cancel>Abbrechen</button>
        <button class="button" type="submit">${state.modal.mode === 'edit' ? 'Zuordnungen aktualisieren' : 'Importieren'}</button>
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
              <button class="button button--ghost" type="button" data-cancel>Abbrechen</button>
              <button class="button" type="submit">Zuordnungen aktualisieren</button>
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
              <label for="raw-description">Beschreibung</label>
              <textarea id="raw-description" name="description" rows="4">${escapeHtml(table.description || '')}</textarea>
            </div>
            <p class="error-text" data-error="general" hidden></p>
            <div class="modal-footer">
              <button class="button" type="submit">Änderungen speichern</button>
            </div>
          </form>
          <div class="danger-zone">
            <h3>Tabelle löschen</h3>
            <p>Entfernen Sie diese Rohdatentabelle und alle zugehörigen Daten aus dem Asset-Pool.</p>
            <button class="button button--danger" type="button" data-delete-table>Tabelle löschen</button>
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
        adminTitleError.textContent = 'Name ist erforderlich.';
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
        modalTitle.textContent = `Bearbeiten: ${updated.title}`;
      }

      await refreshRawTables();
      await refreshAssetPool();

      if (root && root.dataset.view === 'raw') {
        const titleEl = select(root, '.page-title');
        if (titleEl) {
          titleEl.textContent = updated.title;
        }
      }

      showToast('Details der Rohdatentabelle aktualisiert.');
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
      const confirmed = window.confirm('Diese Rohdatentabelle löschen? Dieser Vorgang kann nicht rückgängig gemacht werden.');
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

        const message = `${deletedTitle} gelöscht.`;

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
      errorEl.textContent = 'Bitte ordnen Sie vor dem Fortfahren mindestens eine Spalte zu.';
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
      showToast('Zuordnungen aktualisiert. Asset-Pool aktualisiert.');
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
      const message = `${preview.title} importiert. Asset-Pool aktualisiert.`;
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
    lockBodyScroll();
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
    unlockBodyScrollIfIdle();
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
      console.error('Fehler beim Erstellen der Kategorie', error);
      alert('Kategorie konnte nicht gespeichert werden. Bitte erneut versuchen.');
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
      console.error('Fehler beim Erstellen der Gruppe', error);
      alert('Gruppe konnte nicht gespeichert werden. Bitte erneut versuchen.');
    } finally {
      isSubmitting = false;
      saveButton.disabled = false;
      delete saveButton.dataset.loading;
    }
  });
}

function setupAssetTypeDecisionModal(root) {
  const modal = document.querySelector('[data-asset-type-decision-modal]');
  if (!modal) {
    return;
  }

  const buttons = selectAll(root, '[data-asset-type-button]');
  if (!buttons.length) {
    return;
  }

  const titleEl = select(modal, '[data-asset-type-modal-title]');
  const selectEl = select(modal, '[data-asset-type-decision-select]');
  const commentInput = select(modal, '[data-asset-type-comment]');
  const errorEl = select(modal, '[data-asset-type-decision-error]');
  const saveButton = select(modal, '[data-save-asset-type-decision]');
  const cancelButton = select(modal, '[data-cancel-asset-type-decision]');
  const closeButton = select(modal, '[data-close-asset-type-decision]');
  const groupListEl = select(modal, '[data-asset-type-group-list]');
  const groupEmptyEl = select(modal, '[data-asset-type-group-empty]');
  const ignoreWarningEl = select(modal, '[data-asset-type-ignore-warning]');

  function readButtonGroups(button) {
    if (!button) {
      return [];
    }
    return selectAll(button, '[data-asset-type-group]').map((node) => ({
      id: Number(node.dataset.groupId || '') || null,
      title: node.dataset.groupTitle || '',
      url: node.dataset.groupUrl || ''
    }));
  }

  function renderGroupAssignments(groups) {
    const entries = Array.isArray(groups) ? groups : [];
    const hasGroups = entries.length > 0;

    if (groupListEl) {
      groupListEl.innerHTML = '';
      groupListEl.hidden = !hasGroups;
    }

    if (groupEmptyEl) {
      groupEmptyEl.hidden = hasGroups;
    }

    if (groupListEl && hasGroups) {
      const sortedEntries = [...entries].sort((a, b) =>
        (a?.title || '').localeCompare(b?.title || '', undefined, { numeric: true, sensitivity: 'base' })
      );
      sortedEntries.forEach((entry) => {
        const item = document.createElement('li');
        item.className = 'asset-type-groups__item';
        const title = entry?.title || (Number.isInteger(entry?.id) ? `Gruppe ${entry.id}` : 'Gruppe');
        if (entry?.url) {
          const link = document.createElement('a');
          link.href = entry.url;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.className = 'asset-type-groups__link';
          link.textContent = title;
          item.appendChild(link);
        } else {
          const text = document.createElement('span');
          text.className = 'asset-type-groups__text';
          text.textContent = title;
          item.appendChild(text);
        }
        groupListEl.appendChild(item);
      });
    }

    if (ignoreWarningEl) {
      ignoreWarningEl.hidden = !hasGroups;
    }

    if (selectEl) {
      const ignoreOption = selectEl.querySelector('option[value="ignore"]');
      if (ignoreOption) {
        ignoreOption.disabled = hasGroups;
      }
      if (hasGroups && selectEl.value === 'ignore') {
        selectEl.value = 'use';
      }
    }
  }

  function open(button) {
    const name = button?.dataset.assetTypeName || '';
    state.assetTypeDecisionModal.isOpen = true;
    state.assetTypeDecisionModal.isSaving = false;
    state.assetTypeDecisionModal.activeButton = button;
    state.assetTypeDecisionModal.error = null;

    if (titleEl) {
      titleEl.textContent = name ? `„${name}“ konfigurieren` : 'Asset-Typ konfigurieren';
    }
    if (selectEl) {
      selectEl.value = button?.dataset.assetTypeDecision || 'use';
    }
    if (commentInput) {
      commentInput.value = button?.dataset.assetTypeComment || '';
    }
    if (errorEl) {
      errorEl.hidden = true;
      errorEl.textContent = '';
    }

    renderGroupAssignments(readButtonGroups(button));

    modal.hidden = false;
    modal.removeAttribute('aria-hidden');
    if (!modal.hasAttribute('tabindex')) {
      modal.setAttribute('tabindex', '-1');
    }
    modal.focus?.();

    structureModalOpenCount += 1;
    lockBodyScroll();
  }

  function close() {
    if (!state.assetTypeDecisionModal.isOpen) {
      return;
    }

    state.assetTypeDecisionModal.isOpen = false;
    state.assetTypeDecisionModal.isSaving = false;

    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');

    structureModalOpenCount = Math.max(0, structureModalOpenCount - 1);
    unlockBodyScrollIfIdle();

    if (errorEl) {
      errorEl.hidden = true;
      errorEl.textContent = '';
    }

    renderGroupAssignments([]);

    const button = state.assetTypeDecisionModal.activeButton;
    state.assetTypeDecisionModal.activeButton = null;
    if (button && typeof button.focus === 'function') {
      button.focus();
    }
  }

  buttons.forEach((button) => {
    button.addEventListener('click', () => open(button));
  });

  cancelButton?.addEventListener('click', () => close());
  closeButton?.addEventListener('click', () => close());

  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      close();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.assetTypeDecisionModal.isOpen) {
      close();
    }
  });

  saveButton?.addEventListener('click', async () => {
    if (state.assetTypeDecisionModal.isSaving) {
      return;
    }

    const button = state.assetTypeDecisionModal.activeButton;
    if (!button) {
      return;
    }

    const name = button.dataset.assetTypeName || '';
    if (!name) {
      return;
    }

    const decision = selectEl ? selectEl.value || 'use' : 'use';
    const comment = commentInput ? commentInput.value.trim() : '';

    state.assetTypeDecisionModal.isSaving = true;
    state.assetTypeDecisionModal.error = null;
    if (errorEl) {
      errorEl.hidden = true;
      errorEl.textContent = '';
    }
    saveButton.disabled = true;

    try {
      const response = await fetchJson(`${API.assetTypes}/${encodeURIComponent(name)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, comment })
      });

      const nextDecision = response?.decision || decision;
      const nextComment = response?.comment ?? comment;

      button.dataset.assetTypeDecision = nextDecision;
      button.dataset.assetTypeComment = nextComment;
      button.setAttribute('data-asset-type-decision', nextDecision);

      const statusEl = button.querySelector('[data-asset-type-status]');
      if (statusEl) {
        statusEl.textContent = nextDecision === 'ignore' ? 'Ignorieren' : 'Verwenden';
        statusEl.dataset.status = nextDecision;
      }

      close();
    } catch (error) {
      const message = error?.payload?.error || error?.message || 'Entscheidung zum Asset-Typ konnte nicht gespeichert werden.';
      state.assetTypeDecisionModal.error = message;
      if (errorEl) {
        errorEl.hidden = false;
        errorEl.textContent = message;
      }
    } finally {
      state.assetTypeDecisionModal.isSaving = false;
      saveButton.disabled = false;
    }
  });
}

function appendGroupAssetTypePill(root, entry) {
  const list = select(root, '[data-group-asset-type-list]');
  const emptyEl = select(root, '[data-group-asset-type-empty]');
  if (!list) {
    return;
  }

  const item = document.createElement('li');
  item.className = 'group-asset-type-list__item';
  item.dataset.groupAssetTypeItem = 'true';
  const assignmentId = Number(entry?.id);
  const hasAssignmentId = Number.isInteger(assignmentId) && assignmentId > 0;
  if (hasAssignmentId) {
    item.dataset.groupAssetTypeId = String(assignmentId);
  }
  const assetTypeName = entry?.name ?? '';
  item.dataset.groupAssetTypeName = String(assetTypeName);
  if (entry?.isLegacy) {
    item.dataset.groupAssetTypeLegacy = 'true';
  }

  const pill = document.createElement('div');
  pill.className = `group-asset-type-pill${entry?.isLegacy ? ' group-asset-type-pill--legacy' : ''}`;

  const header = document.createElement('div');
  header.className = 'group-asset-type-pill__header';

  const nameEl = document.createElement('span');
  nameEl.className = 'group-asset-type-pill__name';
  nameEl.textContent = assetTypeName;
  header.appendChild(nameEl);

  const actionsEl = document.createElement('div');
  actionsEl.className = 'group-asset-type-pill__actions';

  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'icon-button group-asset-type-pill__remove';
  removeButton.textContent = '×';
  const labelName = assetTypeName || 'dieser Asset-Typ';
  removeButton.setAttribute(
    'aria-label',
    `Asset-Typ ${labelName} aus dieser Gruppe entfernen`
  );
  removeButton.dataset.groupAssetTypeName = String(assetTypeName);
  if (hasAssignmentId) {
    removeButton.dataset.removeGroupAssetType = String(assignmentId);
  } else {
    removeButton.disabled = true;
    removeButton.setAttribute('aria-disabled', 'true');
    removeButton.title = 'Aktualisieren Sie die Gruppeninformationen, um diesen Asset-Typ zu entfernen.';
  }
  actionsEl.appendChild(removeButton);
  header.appendChild(actionsEl);

  pill.appendChild(header);

  const metaEl = document.createElement('span');
  metaEl.className = 'group-asset-type-pill__meta';
  const count = Number(entry?.count);
  if (Number.isFinite(count) && count > 0) {
    metaEl.textContent = `${count} ${count === 1 ? 'Asset' : 'Assets'}`;
  } else {
    metaEl.textContent = 'Noch keine Einträge im Asset-Pool';
  }
  pill.appendChild(metaEl);

  if (entry?.isLegacy) {
    const tagEl = document.createElement('span');
    tagEl.className = 'group-asset-type-pill__tag';
    tagEl.textContent = 'Aus Gruppendetails';
    pill.appendChild(tagEl);
  }

  item.appendChild(pill);
  list.appendChild(item);

  list.hidden = false;
  if (emptyEl) {
    emptyEl.hidden = true;
  }

  if (root?.dataset) {
    const available = Number(root.dataset.availableGroupAssetTypes || '0');
    if (Number.isFinite(available) && available > 0) {
      root.dataset.availableGroupAssetTypes = String(Math.max(0, available - 1));
    }
  }
}

function setupGroupAssetTypeList(root) {
  const list = select(root, '[data-group-asset-type-list]');
  if (!list) {
    return;
  }

  const emptyEl = select(root, '[data-group-asset-type-empty]');
  const groupId = Number(root?.dataset?.groupId || '');
  if (!Number.isInteger(groupId) || groupId <= 0) {
    return;
  }

  list.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-remove-group-asset-type]');
    if (!button || !list.contains(button)) {
      return;
    }

    const assignmentId = Number(button.dataset.removeGroupAssetType || '');
    if (!Number.isInteger(assignmentId) || assignmentId <= 0) {
      return;
    }

    if (button.dataset.loading === 'true') {
      return;
    }

    button.dataset.loading = 'true';
    button.disabled = true;

    const item = button.closest('[data-group-asset-type-item]');
    const assetTypeName =
      button.dataset.groupAssetTypeName || item?.dataset.groupAssetTypeName || 'dieser Asset-Typ';
    const groupName = root?.dataset?.groupName || 'dieser Gruppe';

    try {
      await fetchJson(API.groupAssetType(groupId, assignmentId), { method: 'DELETE' });

      item?.remove();

      const remainingItems = list.querySelectorAll('[data-group-asset-type-item]').length;
      if (remainingItems === 0) {
        list.hidden = true;
        if (emptyEl) {
          emptyEl.hidden = false;
        }
      }

      if (root?.dataset) {
        const available = Number(root.dataset.availableGroupAssetTypes || '0');
        const next = Number.isFinite(available) ? available + 1 : 1;
        root.dataset.availableGroupAssetTypes = String(next);
      }

      showToast(`Asset-Typ „${assetTypeName}“ wurde aus ${groupName} entfernt.`);
    } catch (error) {
      const message =
        error?.payload?.error || error?.message || 'Asset-Typ konnte nicht aus dieser Gruppe entfernt werden.';
      showToast(message);
      button.disabled = false;
    } finally {
      delete button.dataset.loading;
    }
  });
}

function setupGroupAssetTypeModal(root) {
  const groupId = Number(root?.dataset.groupId || '');
  if (!Number.isFinite(groupId) || groupId <= 0) {
    return;
  }

  const trigger = select(root, '[data-open-group-asset-type-modal]');
  const modal = document.querySelector('[data-group-asset-type-modal]');
  if (!trigger || !modal) {
    return;
  }

  const optionsList = select(modal, '[data-group-asset-type-options]');
  const loadingEl = select(modal, '[data-group-asset-type-loading]');
  const emptyEl = select(modal, '[data-group-asset-type-modal-empty]');
  const errorEl = select(modal, '[data-group-asset-type-error]');
  const closeButtons = selectAll(modal, '[data-close-group-asset-type-modal]');

  function resetModalState() {
    if (optionsList) {
      optionsList.innerHTML = '';
    }
    if (emptyEl) {
      emptyEl.hidden = true;
    }
    if (errorEl) {
      errorEl.hidden = true;
      errorEl.textContent = '';
    }
  }

  function close(focusTrigger = true) {
    if (!state.groupAssetTypeModal.isOpen) {
      return;
    }

    state.groupAssetTypeModal.isOpen = false;
    state.groupAssetTypeModal.isLoading = false;
    state.groupAssetTypeModal.isSaving = false;
    state.groupAssetTypeModal.error = null;
    state.groupAssetTypeModal.options = [];

    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');

    structureModalOpenCount = Math.max(0, structureModalOpenCount - 1);
    unlockBodyScrollIfIdle();

    if (loadingEl) {
      loadingEl.hidden = true;
    }

    resetModalState();

    trigger.setAttribute('aria-expanded', 'false');
    state.groupAssetTypeModal.trigger = null;

    if (focusTrigger && typeof trigger.focus === 'function') {
      trigger.focus();
    }
  }

  function renderOptions(entries) {
    if (!optionsList) {
      return;
    }

    optionsList.innerHTML = '';
    entries.forEach((entry) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'group-asset-type-modal__button';

      const nameEl = document.createElement('span');
      nameEl.className = 'group-asset-type-modal__name';
      nameEl.textContent = entry?.name || '';

      const metaEl = document.createElement('span');
      metaEl.className = 'group-asset-type-modal__meta';
      const count = Number(entry?.count);
      if (Number.isFinite(count) && count > 0) {
        metaEl.textContent = `${count} ${count === 1 ? 'Asset' : 'Assets'}`;
      } else {
        metaEl.textContent = 'Noch keine Einträge im Asset-Pool';
      }

      button.appendChild(nameEl);
      button.appendChild(metaEl);

      button.addEventListener('click', async () => {
        if (state.groupAssetTypeModal.isSaving) {
          return;
        }

        state.groupAssetTypeModal.isSaving = true;
        state.groupAssetTypeModal.error = null;
        if (errorEl) {
          errorEl.hidden = true;
          errorEl.textContent = '';
        }

        selectAll(optionsList, 'button').forEach((btn) => {
          btn.disabled = true;
        });

        try {
          const payload = await fetchJson(API.groupAssetTypes(groupId), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: entry?.name || '' })
          });

          appendGroupAssetTypePill(root, {
            name: payload?.name || entry?.name || '',
            count: payload?.count ?? entry?.count ?? 0
          });

          const groupName = root?.dataset?.groupName || 'dieser Gruppe';
          showToast(`Asset-Typ „${payload?.name || entry?.name || ''}“ wurde ${groupName} hinzugefügt.`);
          close();
        } catch (error) {
          const message =
            error?.payload?.error || error?.message || 'Asset-Typ konnte dieser Gruppe nicht hinzugefügt werden.';
          state.groupAssetTypeModal.error = message;
          if (errorEl) {
            errorEl.hidden = false;
            errorEl.textContent = message;
          }
          selectAll(optionsList, 'button').forEach((btn) => {
            btn.disabled = false;
          });
        } finally {
          state.groupAssetTypeModal.isSaving = false;
        }
      });

      item.appendChild(button);
      optionsList.appendChild(item);
    });
  }

  async function loadOptions() {
    state.groupAssetTypeModal.isLoading = true;
    state.groupAssetTypeModal.error = null;
    if (loadingEl) {
      loadingEl.hidden = false;
    }
    resetModalState();

    try {
      const response = await fetchJson(API.groupAssetTypesAvailable(groupId));
      const entries = Array.isArray(response?.entries) ? response.entries : [];
      state.groupAssetTypeModal.options = entries;

      if (!entries.length) {
        if (emptyEl) {
          emptyEl.hidden = false;
        }
      } else {
        renderOptions(entries);
      }
    } catch (error) {
      const message =
        error?.payload?.error || error?.message || 'Verfügbare Asset-Typen konnten nicht geladen werden.';
      state.groupAssetTypeModal.error = message;
      if (errorEl) {
        errorEl.hidden = false;
        errorEl.textContent = message;
      }
    } finally {
      state.groupAssetTypeModal.isLoading = false;
      if (loadingEl) {
        loadingEl.hidden = true;
      }
    }
  }

  function open() {
    if (state.groupAssetTypeModal.isOpen) {
      return;
    }

    state.groupAssetTypeModal.isOpen = true;
    state.groupAssetTypeModal.trigger = trigger;
    state.groupAssetTypeModal.error = null;
    state.groupAssetTypeModal.options = [];

    trigger.setAttribute('aria-expanded', 'true');

    modal.hidden = false;
    modal.removeAttribute('aria-hidden');
    if (!modal.hasAttribute('tabindex')) {
      modal.setAttribute('tabindex', '-1');
    }
    modal.focus?.();

    structureModalOpenCount += 1;
    lockBodyScroll();

    loadOptions();
  }

  trigger.addEventListener('click', () => open());
  closeButtons.forEach((button) => {
    button.addEventListener('click', () => close());
  });

  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      close();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.groupAssetTypeModal.isOpen) {
      close();
    }
  });
}

function initAssetStructureApp() {
  const root = document.querySelector('[data-app="asset-structure"]');
  if (!root) return;
  setupStructureModals(root);
  setupCreateCategoryForm(root);
  setupCreateGroupForm(root);
  setupAssetTypeDecisionModal(root);
  setupGroupAssetTypeList(root);
  setupGroupAssetTypeModal(root);
}

async function initAssetPoolApp() {
  const root = document.querySelector('[data-app="asset-pool"]');
  if (!root) return;

  consumePendingToast();
  setupImportButtons(root);
  setupFieldManager(root);
  setupAssetTypeFieldModal(root);
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
