const API = {
  rawTables: '/api/v1/raw-tables',
  assetPool: '/api/v1/asset-pool',
  assetPoolFields: '/api/v1/asset-pool/fields',
  assetPoolFieldEditable: (field) =>
    `/api/v1/asset-pool/fields/${encodeURIComponent(field)}/editable`,
  assetPoolFieldValue: (rowId, field) =>
    `/api/v1/asset-pool/rows/${encodeURIComponent(rowId)}/fields/${encodeURIComponent(field)}`,
  assetTypeField: '/api/v1/asset-pool/settings/asset-type-field',
  assetTypes: '/api/v1/asset-types',
  categories: '/api/v1/categories',
  assetCategories: '/api/v1/asset-categories',
  groups: '/api/v1/groups',
  groupAssetTypes: (groupId) => `/api/v1/groups/${groupId}/asset-types`,
  groupAssetType: (groupId, assetTypeId) =>
    `/api/v1/groups/${groupId}/asset-types/${assetTypeId}`,
  groupAssetTypesAvailable: (groupId) =>
    `/api/v1/groups/${groupId}/asset-types/available`,
  measures: '/api/v1/measures',
  measuresUpload: '/api/v1/measures/upload'
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
    busyAction: null,
    error: null,
    trigger: null,
    isAdding: false,
    newFieldValue: ''
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
  },
  measures: {
    isUploadOpen: false
  }
};

const measuresState = {
  entries: [],
  filters: { topic: '', subTopic: '', category: '' },
  options: { topics: [], subTopics: [], categories: [] },
  version: null,
  isLoading: false,
  error: null,
  isUploading: false
};

const assetCategoriesState = {
  categories: [],
  assetSubCategories: [],
  isCreating: false,
  modal: {
    categoryId: null,
    selection: new Set(),
    isSaving: false,
    trigger: null
  }
};

const MEASURE_FILTER_KEYS = ['topic', 'subTopic', 'category'];

function normaliseMeasureFilterValue(value) {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  return String(value).trim();
}

function applyMeasuresFiltersFromQuery() {
  const params = new URLSearchParams(window.location.search);
  MEASURE_FILTER_KEYS.forEach((key) => {
    if (!params.has(key)) {
      return;
    }
    const value = normaliseMeasureFilterValue(params.get(key));
    measuresState.filters[key] = value;
  });
}

function syncMeasuresQueryParams() {
  const params = new URLSearchParams();
  MEASURE_FILTER_KEYS.forEach((key) => {
    const value = normaliseMeasureFilterValue(measuresState.filters[key]);
    if (value) {
      params.set(key, value);
    }
  });
  const query = params.toString();
  const url = query ? `${window.location.pathname}?${query}` : window.location.pathname;
  window.history.replaceState({}, '', url);
}

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
    state.measures.isUploadOpen ||
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

function readNonNegativeInteger(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    return 0;
  }
  return Math.floor(number);
}

function getGroupAssetTypeCount(root) {
  if (!root?.dataset) {
    return 0;
  }
  return readNonNegativeInteger(root.dataset.groupAssetTypeCount);
}

function syncDeleteGroupButtonState(root) {
  const button = select(root, '[data-delete-group]');
  if (!button) {
    return;
  }

  const shouldDisable = getGroupAssetTypeCount(root) > 0;
  button.disabled = shouldDisable;
  if (shouldDisable) {
    button.setAttribute('aria-disabled', 'true');
    if (button.dataset.disabledTitle) {
      button.title = button.dataset.disabledTitle;
    }
  } else {
    button.removeAttribute('aria-disabled');
    if (button.dataset.disabledTitle && button.title === button.dataset.disabledTitle) {
      button.removeAttribute('title');
    }
  }
}

function setGroupAssetTypeCount(root, count) {
  if (!root?.dataset) {
    return;
  }
  const safeCount = readNonNegativeInteger(count);
  root.dataset.groupAssetTypeCount = String(safeCount);
  syncDeleteGroupButtonState(root);
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
  const addInput = select(panel, '[data-field-input]');
  const addButton = select(panel, '[data-add-field]');
  if (!list || !error) return;

  const fieldStats = Array.isArray(state.assetPool?.fieldStats) ? state.assetPool.fieldStats : [];
  const fieldSettings = state.assetPool?.fieldSettings || {};
  const isBusy = state.fieldManager.busyField !== null;
  list.innerHTML = '';

  if (!fieldStats.length) {
    const empty = document.createElement('p');
    empty.className = 'field-manager__empty';
    empty.textContent = 'Keine Felder verfügbar.';
    list.appendChild(empty);
  } else {
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

      const config = fieldSettings[stat.field] || {};
      const isEditable = !!config.editable;
      const isToggleTarget =
        isBusy && state.fieldManager.busyField === stat.field && state.fieldManager.busyAction === 'toggle';
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'button button--ghost field-manager__editable';
      toggle.textContent = isToggleTarget ? 'Aktualisieren…' : 'Editable';
      toggle.disabled = isBusy || state.fieldManager.isAdding;
      toggle.setAttribute('aria-pressed', isEditable ? 'true' : 'false');
      toggle.classList.toggle('is-active', isEditable);
      toggle.addEventListener('click', () =>
        handleToggleFieldEditable(stat.field, !isEditable, root)
      );
      meta.appendChild(toggle);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'button button--ghost field-manager__remove';
      const isRemoving =
        isBusy && state.fieldManager.busyField === stat.field && state.fieldManager.busyAction === 'remove';
      remove.textContent = isRemoving ? 'Wird entfernt…' : 'Entfernen';
      remove.disabled = isBusy || state.fieldManager.isAdding;
      remove.addEventListener('click', () => handleRemoveField(stat.field, root));
      meta.appendChild(remove);

      item.appendChild(meta);
      list.appendChild(item);
    });
  }

  if (addInput) {
    addInput.value = state.fieldManager.newFieldValue || '';
    addInput.disabled = state.fieldManager.isAdding;
  }

  if (addButton) {
    const trimmedValue = (state.fieldManager.newFieldValue || '').trim();
    addButton.disabled =
      state.fieldManager.isAdding || isBusy || trimmedValue.length === 0;
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
  state.fieldManager.busyField = null;
  state.fieldManager.busyAction = null;
  state.fieldManager.isAdding = false;
  state.fieldManager.newFieldValue = '';
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
  state.fieldManager.busyAction = 'remove';
  renderFieldManager(root);

  try {
    const result = await fetchJson(`${API.assetPoolFields}/${encodeURIComponent(field)}`, {
      method: 'DELETE'
    });
    await Promise.all([refreshAssetPool(), refreshRawTables()]);
    const message = result?.removed
      ? `Feld „${field}“ wurde entfernt.`
      : `Keine Zuordnungen nutzten „${field}“.`;
    showToast(message);
    state.fieldManager.busyField = null;
    state.fieldManager.busyAction = null;
    renderFieldManager(root);
  } catch (err) {
    state.fieldManager.error = err.payload?.error || err.message;
    state.fieldManager.busyField = null;
    state.fieldManager.busyAction = null;
    renderFieldManager(root);
  }
}

async function handleAddField(root) {
  const modal = document.querySelector('[data-field-manager-modal]');
  const panel = select(modal, '[data-field-manager]');
  const input = select(panel, '[data-field-input]');
  const rawValue = input ? input.value : state.fieldManager.newFieldValue;
  const field = (rawValue || '').trim();
  if (!field || state.fieldManager.isAdding) {
    return;
  }

  state.fieldManager.error = null;
  state.fieldManager.isAdding = true;
  state.fieldManager.newFieldValue = field;
  renderFieldManager(root);

  try {
    await fetchJson(API.assetPoolFields, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ field })
    });
    state.fieldManager.isAdding = false;
    state.fieldManager.newFieldValue = '';
    if (input) {
      input.value = '';
    }
    showToast(`Feld „${field}“ wurde hinzugefügt.`);
    renderFieldManager(root);
    await refreshAssetPool();
  } catch (err) {
    state.fieldManager.error = err.payload?.error || err.message;
    state.fieldManager.isAdding = false;
    renderFieldManager(root);
  }
}

async function handleToggleFieldEditable(field, nextEditable, root) {
  if (!field) return;
  state.fieldManager.error = null;
  state.fieldManager.busyField = field;
  state.fieldManager.busyAction = 'toggle';
  renderFieldManager(root);

  try {
    await fetchJson(API.assetPoolFieldEditable(field), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ editable: nextEditable })
    });
    state.fieldManager.busyField = null;
    state.fieldManager.busyAction = null;
    renderFieldManager(root);
    await refreshAssetPool();
    const message = nextEditable
      ? `Feld „${field}“ ist jetzt bearbeitbar.`
      : `Feld „${field}“ ist nicht mehr bearbeitbar.`;
    showToast(message);
  } catch (err) {
    state.fieldManager.error = err.payload?.error || err.message;
    state.fieldManager.busyField = null;
    state.fieldManager.busyAction = null;
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

  const addInput = select(panel, '[data-field-input]');
  const addButton = select(panel, '[data-add-field]');
  if (addInput) {
    addInput.addEventListener('input', (event) => {
      state.fieldManager.newFieldValue = event.target.value;
      if (addButton) {
        const trimmed = event.target.value.trim();
        addButton.disabled =
          state.fieldManager.isAdding || state.fieldManager.busyField !== null || trimmed.length === 0;
      }
    });
    addInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        handleAddField(root);
      }
    });
  }

  if (addButton) {
    addButton.addEventListener('click', () => handleAddField(root));
  }
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
    : 'Fügen Sie Felder hinzu, um einen Asset-Typ auszuwählen.';

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
  const fieldSettings = view?.fieldSettings || {};

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
        const config = fieldSettings[column] || {};
        if (config.editable) {
          const wrapper = document.createElement('div');
          wrapper.className = 'editable-cell';

          const input = document.createElement('input');
          input.type = 'text';
          input.className = 'editable-cell__input';
          input.value = value === null || value === undefined ? '' : String(value);
          input.placeholder = 'Wert eingeben';

          const save = document.createElement('button');
          save.type = 'button';
          save.className = 'button button--ghost editable-cell__button';
          save.textContent = 'Speichern';
          save.addEventListener('click', () =>
            handleEditableCellSave(row.id, column, input, save)
          );
          input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              handleEditableCellSave(row.id, column, input, save);
            }
          });

          wrapper.appendChild(input);
          wrapper.appendChild(save);
          cell.appendChild(wrapper);
        } else {
          cell.textContent = value === null || value === undefined ? '' : String(value);
        }
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

async function handleEditableCellSave(rowId, field, input, button) {
  if (!rowId || !field || !input || !button) {
    return;
  }

  const value = input.value;
  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = 'Speichern…';

  try {
    await fetchJson(API.assetPoolFieldValue(rowId, field), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value })
    });
    await refreshAssetPool();
    showToast('Wert gespeichert.');
  } catch (err) {
    const message = err.payload?.error || err.message;
    showToast(message);
    if (button.isConnected) {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  }
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
  const assetSubCategoryId = Number(root?.dataset.assetSubCategoryId || '');
  if (!Number.isFinite(assetSubCategoryId) || assetSubCategoryId <= 0) {
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
          body: JSON.stringify({ category_id: assetSubCategoryId })
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

function setupDeleteGroupButton(root) {
  const button = select(root, '[data-delete-group]');
  if (!button) {
    return;
  }

  const groupId = Number(root?.dataset?.groupId || '');
  if (!Number.isInteger(groupId) || groupId <= 0) {
    button.disabled = true;
    button.setAttribute('aria-disabled', 'true');
    return;
  }

  syncDeleteGroupButtonState(root);

  button.addEventListener('click', async () => {
    if (button.disabled) {
      return;
    }

    const confirmMessage =
      button.dataset.confirm ||
      'Diese Gruppe löschen? Dieser Vorgang kann nicht rückgängig gemacht werden.';
    if (!window.confirm(confirmMessage)) {
      return;
    }

    button.disabled = true;
    button.dataset.loading = 'true';

    try {
      await fetchJson(`${API.groups}/${groupId}`, { method: 'DELETE' });
      const assetSubCategoryId = Number(root?.dataset?.assetSubCategoryId || '');
      const topicId = root?.dataset?.topicId || '';
      const subTopicId = root?.dataset?.subTopicId || '';

      if (
        Number.isInteger(assetSubCategoryId) &&
        assetSubCategoryId > 0 &&
        typeof topicId === 'string' &&
        topicId &&
        typeof subTopicId === 'string' &&
        subTopicId
      ) {
        window.location.assign(`/asset-structure/${topicId}/${subTopicId}/${assetSubCategoryId}`);
      } else if (typeof topicId === 'string' && topicId) {
        window.location.assign(`/asset-structure/${topicId}`);
      } else {
        window.location.assign('/asset-structure');
      }
    } catch (error) {
      const message =
        error?.payload?.error || error?.message || 'Gruppe konnte nicht gelöscht werden.';
      showToast(message);
      syncDeleteGroupButtonState(root);
    } finally {
      delete button.dataset.loading;
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

  const totalItems = list.querySelectorAll('[data-group-asset-type-item]').length;
  setGroupAssetTypeCount(root, totalItems);

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
      setGroupAssetTypeCount(root, remainingItems);
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

const measureCellReaders = [
  (entry) => joinMeasureList(entry?.topics),
  (entry) => joinMeasureList(entry?.subTopics),
  (entry) => joinMeasureList(entry?.categories),
  (entry) => safeMeasureValue(entry?.identifier),
  (entry) => safeMeasureValue(entry?.confidentiality?.low),
  (entry) => safeMeasureValue(entry?.confidentiality?.medium),
  (entry) => safeMeasureValue(entry?.confidentiality?.high),
  (entry) => safeMeasureValue(entry?.confidentiality?.veryHigh),
  (entry) => safeMeasureValue(entry?.integrity?.low),
  (entry) => safeMeasureValue(entry?.integrity?.medium),
  (entry) => safeMeasureValue(entry?.integrity?.high),
  (entry) => safeMeasureValue(entry?.integrity?.veryHigh),
  (entry) => safeMeasureValue(entry?.availability?.low),
  (entry) => safeMeasureValue(entry?.availability?.medium),
  (entry) => safeMeasureValue(entry?.availability?.high),
  (entry) => safeMeasureValue(entry?.availability?.veryHigh),
  (entry) => safeMeasureValue(entry?.requirements),
  (entry) => safeMeasureValue(entry?.explanation),
  (entry) => safeMeasureValue(entry?.documentation),
  (entry) => safeMeasureValue(entry?.standardAnswer)
];

function joinMeasureList(values) {
  if (!Array.isArray(values)) {
    return '';
  }
  return values
    .map((value) => safeMeasureValue(value))
    .filter((value) => value.length > 0)
    .join(', ');
}

function safeMeasureValue(value) {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  return String(value).trim();
}

function createMeasureRow(entry) {
  const row = document.createElement('tr');
  measureCellReaders.forEach((reader, index) => {
    const cell = document.createElement('td');
    cell.className = 'measure-table__cell';
    if (index <= 2 || index >= 16) {
      cell.classList.add('measure-table__cell--wrap');
    }
    cell.textContent = safeMeasureValue(reader(entry));
    row.appendChild(cell);
  });
  return row;
}

function syncMeasureSelect(selectEl, options, selectedValue) {
  if (!selectEl) {
    return;
  }

  const value = selectedValue != null ? String(selectedValue) : '';
  const entries = Array.isArray(options) ? options : [];
  const fragment = document.createDocumentFragment();
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = 'Alle';
  fragment.appendChild(defaultOption);

  entries.forEach((option) => {
    const opt = document.createElement('option');
    opt.value = option?.id != null ? String(option.id) : '';
    opt.textContent = option?.title || '';
    fragment.appendChild(opt);
  });

  selectEl.innerHTML = '';
  selectEl.appendChild(fragment);
  selectEl.value = value;
  if (selectEl.value !== value) {
    selectEl.value = '';
  }
  selectEl.disabled = measuresState.isLoading;
}

function renderMeasuresFilters(root) {
  const topicSelect = select(root, '[data-measure-filter="topic"]');
  const subTopicSelect = select(root, '[data-measure-filter="subTopic"]');
  const categorySelect = select(root, '[data-measure-filter="category"]');
  syncMeasureSelect(topicSelect, measuresState.options.topics, measuresState.filters.topic);
  syncMeasureSelect(subTopicSelect, measuresState.options.subTopics, measuresState.filters.subTopic);
  syncMeasureSelect(categorySelect, measuresState.options.categories, measuresState.filters.category);

  const resetButton = select(root, '[data-measure-reset]');
  if (resetButton) {
    const hasFilters =
      Boolean(measuresState.filters.topic) ||
      Boolean(measuresState.filters.subTopic) ||
      Boolean(measuresState.filters.category);
    resetButton.disabled = measuresState.isLoading || !hasFilters;
  }
}

function formatMeasureDateTime(value) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const datePart = date.toLocaleDateString('de-DE');
  const timePart = date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  return `${datePart} ${timePart}`;
}

function renderMeasuresMeta(root) {
  const metaEl = select(root, '[data-measure-meta]');
  if (!metaEl) {
    return;
  }

  if (measuresState.isLoading) {
    metaEl.textContent = 'Maßnahmen werden geladen …';
    return;
  }

  if (measuresState.error) {
    metaEl.textContent = measuresState.error;
    return;
  }

  const version = measuresState.version;
  if (!version || !version.versionDate) {
    metaEl.textContent = 'Es wurde noch keine Maßnahmen-Version importiert.';
    return;
  }

  const parts = [];
  const formattedDate = formatMeasureDateTime(version.versionDate);
  if (formattedDate) {
    parts.push(`Version vom ${formattedDate}`);
  }

  let measureCount = Number(version.measureCount);
  if (!Number.isFinite(measureCount)) {
    measureCount = Array.isArray(measuresState.entries) ? measuresState.entries.length : 0;
  }
  if (Number.isFinite(measureCount)) {
    parts.push(`${measureCount} Maßnahme${measureCount === 1 ? '' : 'n'}`);
  }

  const changeCount = Number(version.changeCount);
  if (Number.isFinite(changeCount)) {
    parts.push(`Änderungen: ${changeCount}`);
  }

  if (version.sourceFilename) {
    parts.push(`Datei: ${version.sourceFilename}`);
  }

  metaEl.textContent = parts.join(' • ');
}

function renderMeasuresTable(root) {
  const container = select(root, '[data-measure-table-container]');
  const tbody = select(root, '[data-measure-table-body]');
  const loadingEl = select(root, '[data-measure-loading]');
  const errorEl = select(root, '[data-measure-error]');
  const emptyEl = select(root, '[data-measure-empty]');

  if (loadingEl) {
    loadingEl.hidden = !measuresState.isLoading;
  }

  if (errorEl) {
    if (measuresState.error) {
      errorEl.hidden = false;
      errorEl.textContent = measuresState.error;
    } else {
      errorEl.hidden = true;
      errorEl.textContent = '';
    }
  }

  if (measuresState.isLoading) {
    if (container) {
      container.hidden = true;
    }
    if (emptyEl) {
      emptyEl.hidden = true;
    }
    if (tbody) {
      tbody.innerHTML = '';
    }
    return;
  }

  if (measuresState.error) {
    if (container) {
      container.hidden = true;
    }
    if (emptyEl) {
      emptyEl.hidden = true;
    }
    if (tbody) {
      tbody.innerHTML = '';
    }
    return;
  }

  const entries = Array.isArray(measuresState.entries) ? measuresState.entries : [];

  if (!entries.length) {
    if (container) {
      container.hidden = true;
    }
    if (emptyEl) {
      emptyEl.hidden = false;
    }
    if (tbody) {
      tbody.innerHTML = '';
    }
    return;
  }

  if (container) {
    container.hidden = false;
  }
  if (emptyEl) {
    emptyEl.hidden = true;
  }
  if (tbody) {
    tbody.innerHTML = '';
    entries.forEach((entry) => {
      tbody.appendChild(createMeasureRow(entry));
    });
  }
}

function renderMeasuresView(root) {
  renderMeasuresMeta(root);
  renderMeasuresFilters(root);
  renderMeasuresTable(root);
}

async function refreshMeasures(root) {
  const previousVersion = measuresState.version;
  measuresState.isLoading = true;
  measuresState.error = null;
  renderMeasuresView(root);

  const params = new URLSearchParams();
  if (measuresState.filters.topic) {
    params.set('topic', measuresState.filters.topic);
  }
  if (measuresState.filters.subTopic) {
    params.set('subTopic', measuresState.filters.subTopic);
  }
  if (measuresState.filters.category) {
    params.set('category', measuresState.filters.category);
  }

  const query = params.toString();
  const url = query ? `${API.measures}?${query}` : API.measures;

  try {
    const payload = await fetchJson(url);
    measuresState.entries = Array.isArray(payload?.measures) ? payload.measures : [];
    measuresState.options = {
      topics: Array.isArray(payload?.filters?.topics) ? payload.filters.topics : [],
      subTopics: Array.isArray(payload?.filters?.subTopics) ? payload.filters.subTopics : [],
      categories: Array.isArray(payload?.filters?.categories) ? payload.filters.categories : []
    };
    measuresState.version = payload?.version || null;
  } catch (error) {
    measuresState.entries = [];
    measuresState.options = { topics: [], subTopics: [], categories: [] };
    measuresState.version = previousVersion;
    measuresState.error = error?.payload?.error || error.message;
  } finally {
    measuresState.isLoading = false;
    renderMeasuresView(root);
  }
}

function setupMeasureFilters(root) {
  selectAll(root, '[data-measure-filter]').forEach((selectEl) => {
    selectEl.addEventListener('change', () => {
      const key = selectEl.dataset.measureFilter;
      if (!key) {
        return;
      }
      measuresState.filters[key] = selectEl.value;
      syncMeasuresQueryParams();
      refreshMeasures(root).catch((error) => {
        measuresState.error = error?.message || 'Maßnahmen konnten nicht geladen werden.';
        renderMeasuresView(root);
      });
    });
  });

  const resetButton = select(root, '[data-measure-reset]');
  if (resetButton) {
    resetButton.addEventListener('click', () => {
      measuresState.filters = { topic: '', subTopic: '', category: '' };
      syncMeasuresQueryParams();
      refreshMeasures(root).catch((error) => {
        measuresState.error = error?.message || 'Maßnahmen konnten nicht geladen werden.';
        renderMeasuresView(root);
      });
    });
  }
}

function setupMeasureUpload(root) {
  const modal = select(root, '[data-measure-upload-modal]');
  const form = modal ? select(modal, '[data-measure-upload-form]') : null;
  const trigger = select(root, '[data-measure-upload-trigger]');
  if (!modal || !form || !trigger) {
    return;
  }

  const fileInput = select(form, '#measure-upload-file');
  const errorEl = select(form, '[data-measure-upload-error]');
  const submitButton = select(form, '[data-measure-upload-submit]');

  function resetForm() {
    form.reset();
    delete form.dataset.loading;
    submitButton?.removeAttribute('disabled');
    if (errorEl) {
      errorEl.hidden = true;
      errorEl.textContent = '';
    }
    measuresState.isUploading = false;
  }

  function open() {
    if (state.measures.isUploadOpen) {
      return;
    }
    state.measures.isUploadOpen = true;
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    lockBodyScroll();
    fileInput?.focus();
  }

  function close() {
    if (!state.measures.isUploadOpen) {
      return;
    }
    state.measures.isUploadOpen = false;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    resetForm();
    unlockBodyScrollIfIdle();
  }

  trigger.addEventListener('click', () => open());
  selectAll(root, '[data-close-measure-upload]').forEach((button) => {
    button.addEventListener('click', () => close());
  });
  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      close();
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.measures.isUploadOpen) {
      close();
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (measuresState.isUploading) {
      return;
    }

    if (!fileInput?.files?.length) {
      if (errorEl) {
        errorEl.hidden = false;
        errorEl.textContent = 'Bitte wählen Sie eine Datei aus.';
      }
      return;
    }

    measuresState.isUploading = true;
    submitButton?.setAttribute('disabled', 'disabled');
    form.dataset.loading = 'true';
    if (errorEl) {
      errorEl.hidden = true;
      errorEl.textContent = '';
    }

    const formData = new FormData(form);
    try {
      await fetchJson(API.measuresUpload, { method: 'POST', body: formData });
      close();
      showToast('Maßnahmen wurden erfolgreich importiert.');
      await refreshMeasures(root);
    } catch (error) {
      const message = error?.payload?.error || error.message;
      if (errorEl) {
        errorEl.hidden = false;
        errorEl.textContent = message;
      }
    } finally {
      measuresState.isUploading = false;
      if (state.measures.isUploadOpen) {
        submitButton?.removeAttribute('disabled');
        delete form.dataset.loading;
      }
    }
  });
}

function initMeasuresApp() {
  const root = document.querySelector('[data-app="measures"]');
  if (!root) {
    return;
  }

  applyMeasuresFiltersFromQuery();
  syncMeasuresQueryParams();
  setupMeasureFilters(root);
  setupMeasureUpload(root);
  renderMeasuresView(root);
  refreshMeasures(root).catch((error) => {
    measuresState.error = error?.message || 'Maßnahmen konnten nicht geladen werden.';
    renderMeasuresView(root);
  });
}

function applyAssetCategoryOverview(overview) {
  const normaliseCategory = (category) => {
    const id = Number(category?.id);
    if (!Number.isInteger(id) || id <= 0) {
      return null;
    }
    const name = typeof category?.name === 'string' && category.name.trim()
      ? category.name.trim()
      : `Asset-Kategorie ${id}`;
    const decision = category?.decision === 'ignore' ? 'ignore' : 'use';
    const comment = typeof category?.comment === 'string' ? category.comment : '';
    const assetSubCategories = Array.isArray(category?.assetSubCategories)
      ? category.assetSubCategories
          .map((entry) => {
            const subId = Number(entry?.id);
            if (!Number.isInteger(subId) || subId <= 0) {
              return null;
            }
            return {
              id: subId,
              title:
                typeof entry?.title === 'string' && entry.title.trim()
                  ? entry.title.trim()
                  : `AssetUnterKategorie ${subId}`,
              topicTitle: typeof entry?.topicTitle === 'string' ? entry.topicTitle : '',
              subTopicTitle:
                typeof entry?.subTopicTitle === 'string' ? entry.subTopicTitle : ''
            };
          })
          .filter(Boolean)
      : [];
    const count = Number(category?.assetSubCategoryCount);
    return {
      id,
      name,
      decision,
      comment,
      assetSubCategoryCount: Number.isFinite(count) && count >= 0 ? count : assetSubCategories.length,
      assetSubCategories
    };
  };

  const normaliseAssetSubCategory = (entry) => {
    const id = Number(entry?.id);
    if (!Number.isInteger(id) || id <= 0) {
      return null;
    }
    const assignedCategoryId = Number(entry?.assignedCategoryId);
    return {
      id,
      title:
        typeof entry?.title === 'string' && entry.title.trim()
          ? entry.title.trim()
          : `AssetUnterKategorie ${id}`,
      topicTitle: typeof entry?.topicTitle === 'string' ? entry.topicTitle : '',
      subTopicTitle: typeof entry?.subTopicTitle === 'string' ? entry.subTopicTitle : '',
      assignedCategoryId:
        Number.isInteger(assignedCategoryId) && assignedCategoryId > 0 ? assignedCategoryId : null,
      assignedCategoryName:
        typeof entry?.assignedCategoryName === 'string' ? entry.assignedCategoryName : ''
    };
  };

  const categories = Array.isArray(overview?.categories)
    ? overview.categories.map(normaliseCategory).filter(Boolean)
    : [];
  const assetSubCategories = Array.isArray(overview?.assetSubCategories)
    ? overview.assetSubCategories.map(normaliseAssetSubCategory).filter(Boolean)
    : [];

  assetCategoriesState.categories = categories;
  assetCategoriesState.assetSubCategories = assetSubCategories;
}

function updateAssetCategorySummary(root) {
  const summaryEl = select(root, '[data-asset-category-summary]');
  if (!summaryEl) {
    return;
  }
  const categoryCount = assetCategoriesState.categories.length;
  const assetSubCategoryCount = assetCategoriesState.assetSubCategories.length;
  summaryEl.textContent = `${categoryCount} Kategorien, ${assetSubCategoryCount} verfügbare AssetUnterKategorien.`;
}

function renderAssetCategoryTable(root) {
  const tbody = select(root, '[data-asset-category-table-body]');
  const emptyEl = select(root, '[data-asset-category-empty]');
  if (!tbody) {
    return;
  }

  tbody.innerHTML = '';
  const categories = assetCategoriesState.categories;
  if (!categories.length) {
    if (emptyEl) {
      emptyEl.hidden = false;
    }
    return;
  }

  if (emptyEl) {
    emptyEl.hidden = true;
  }

  categories.forEach((category) => {
    const row = document.createElement('tr');
    row.className = 'asset-category-table-row';
    row.dataset.assetCategoryRow = 'true';
    row.dataset.assetCategoryId = String(category.id);
    row.dataset.assetCategoryName = category.name || '';
    row.dataset.assetCategoryDecision = category.decision || 'use';
    row.dataset.assetCategoryComment = category.comment || '';
    row.tabIndex = 0;

    const nameCell = document.createElement('td');
    nameCell.textContent = category.name || `Asset-Kategorie ${category.id}`;
    row.appendChild(nameCell);

    const countCell = document.createElement('td');
    const count = Number(category?.assetSubCategoryCount);
    countCell.textContent = Number.isFinite(count) && count >= 0 ? String(count) : '0';
    row.appendChild(countCell);

    const statusCell = document.createElement('td');
    const decision = category.decision === 'ignore' ? 'ignore' : 'use';
    statusCell.textContent = decision === 'ignore' ? 'Ignorieren' : 'Verwenden';
    statusCell.dataset.status = decision;
    row.appendChild(statusCell);

    tbody.appendChild(row);
  });
}

function renderAssetCategoryOptions(modal) {
  if (!modal) {
    return;
  }

  const listEl = select(modal, '[data-asset-category-sub-category-list]');
  if (!listEl) {
    return;
  }

  listEl.innerHTML = '';
  const { categoryId, selection } = assetCategoriesState.modal;
  if (!Number.isInteger(categoryId) || categoryId <= 0) {
    return;
  }

  const entries = assetCategoriesState.assetSubCategories;
  if (!entries.length) {
    const emptyEl = document.createElement('p');
    emptyEl.className = 'helper-text';
    emptyEl.textContent = 'Keine AssetUnterKategorien verfügbar.';
    listEl.appendChild(emptyEl);
    return;
  }

  entries.forEach((entry) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'asset-category-sub-category-pill';
    const isSelected = selection.has(entry.id);
    const assignedElsewhere = entry.assignedCategoryId && entry.assignedCategoryId !== categoryId;
    if (isSelected) {
      button.classList.add('asset-category-sub-category-pill--selected');
    }
    if (assignedElsewhere) {
      button.classList.add('asset-category-sub-category-pill--assigned-other');
    }

    button.dataset.assetSubCategoryId = String(entry.id);

    const nameEl = document.createElement('span');
    nameEl.className = 'asset-category-sub-category-pill__name';
    nameEl.textContent = entry.title;
    button.appendChild(nameEl);

    const metaParts = [];
    if (entry.topicTitle) {
      metaParts.push(entry.topicTitle);
    }
    if (entry.subTopicTitle) {
      metaParts.push(entry.subTopicTitle);
    }
    if (metaParts.length) {
      const metaEl = document.createElement('span');
      metaEl.className = 'asset-category-sub-category-pill__meta';
      metaEl.textContent = metaParts.join(' • ');
      button.appendChild(metaEl);
    }

    const statusEl = document.createElement('span');
    statusEl.className = 'asset-category-sub-category-pill__status';
    if (isSelected && assignedElsewhere) {
      statusEl.textContent = entry.assignedCategoryName
        ? `Wird von ${entry.assignedCategoryName} verschoben`
        : 'Wird neu zugeordnet';
    } else if (isSelected) {
      statusEl.textContent = 'Dieser Kategorie zugeordnet';
    } else if (assignedElsewhere) {
      statusEl.textContent = entry.assignedCategoryName
        ? `Zugeordnet zu ${entry.assignedCategoryName}`
        : 'Bereits zugeordnet';
    } else {
      statusEl.textContent = 'Nicht zugeordnet';
    }
    button.appendChild(statusEl);

    button.addEventListener('click', () => {
      const currentlySelected = selection.has(entry.id);
      if (currentlySelected) {
        selection.delete(entry.id);
      } else {
        selection.add(entry.id);
      }
      renderAssetCategoryOptions(modal);
    });

    listEl.appendChild(button);
  });
}

function createAssetCategoryModalController(root) {
  const modal = document.querySelector('[data-asset-category-modal]');
  if (!modal) {
    return null;
  }

  modal.setAttribute('aria-hidden', 'true');

  const titleEl = select(modal, '[data-asset-category-modal-title]');
  const decisionSelect = select(modal, '[data-asset-category-decision]');
  const commentInput = select(modal, '[data-asset-category-comment]');
  const errorEl = select(modal, '[data-asset-category-modal-error]');
  const saveButton = select(modal, '[data-save-asset-category]');
  const cancelButton = select(modal, '[data-cancel-asset-category]');
  const closeButton = select(modal, '[data-close-asset-category-modal]');
  const deleteButton = select(modal, '[data-delete-asset-category]');

  function close() {
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    assetCategoriesState.modal.categoryId = null;
    assetCategoriesState.modal.selection = new Set();
    assetCategoriesState.modal.isSaving = false;
    const trigger = assetCategoriesState.modal.trigger;
    assetCategoriesState.modal.trigger = null;
    if (trigger && typeof trigger.focus === 'function') {
      trigger.focus();
    }
  }

  function open(trigger, categoryId) {
    const category = assetCategoriesState.categories.find((entry) => entry.id === categoryId);
    if (!category) {
      return;
    }

    assetCategoriesState.modal.categoryId = categoryId;
    assetCategoriesState.modal.selection = new Set(
      Array.isArray(category.assetSubCategories)
        ? category.assetSubCategories.map((entry) => entry.id)
        : []
    );
    assetCategoriesState.modal.isSaving = false;
    assetCategoriesState.modal.trigger = trigger || null;

    if (titleEl) {
      titleEl.textContent = category.name || `Asset-Kategorie ${categoryId}`;
    }
    if (decisionSelect) {
      decisionSelect.value = category.decision === 'ignore' ? 'ignore' : 'use';
    }
    if (commentInput) {
      commentInput.value = category.comment || '';
    }
    if (errorEl) {
      errorEl.hidden = true;
      errorEl.textContent = '';
    }
    if (deleteButton) {
      deleteButton.disabled = false;
      delete deleteButton.dataset.loading;
    }

    renderAssetCategoryOptions(modal);

    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    modal.setAttribute('tabindex', '-1');
    modal.focus();
    if (decisionSelect) {
      decisionSelect.focus();
    }
  }

  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      close();
    }
  });

  if (cancelButton) {
    cancelButton.addEventListener('click', () => close());
  }

  if (closeButton) {
    closeButton.addEventListener('click', () => close());
  }

  if (deleteButton) {
    deleteButton.addEventListener('click', async () => {
      const categoryId = assetCategoriesState.modal.categoryId;
      if (!Number.isInteger(categoryId) || categoryId <= 0) {
        return;
      }

      const category = assetCategoriesState.categories.find((entry) => entry.id === categoryId);
      const name = category?.name || `Asset-Kategorie ${categoryId}`;
      const confirmMessage =
        `Asset-Kategorie „${name}“ löschen? Dieser Vorgang kann nicht rückgängig gemacht werden.`;

      if (!window.confirm(confirmMessage)) {
        return;
      }

      deleteButton.disabled = true;
      deleteButton.dataset.loading = 'true';

      try {
        const overview = await fetchJson(`${API.assetCategories}/${categoryId}`, { method: 'DELETE' });
        applyAssetCategoryOverview(overview);
        renderAssetCategoryTable(root);
        updateAssetCategorySummary(root);
        close();
        showToast('Asset-Kategorie gelöscht.');
      } catch (error) {
        const message =
          error?.payload?.error || error.message || 'Asset-Kategorie konnte nicht gelöscht werden.';
        showToast(message);
      } finally {
        delete deleteButton.dataset.loading;
        deleteButton.disabled = false;
      }
    });
  }

  if (saveButton) {
    saveButton.addEventListener('click', async () => {
      if (assetCategoriesState.modal.isSaving) {
        return;
      }

      const categoryId = assetCategoriesState.modal.categoryId;
      if (!Number.isInteger(categoryId) || categoryId <= 0) {
        return;
      }

      const decision = decisionSelect?.value === 'ignore' ? 'ignore' : 'use';
      const comment = commentInput?.value?.trim() ?? '';
      const assetSubCategoryIds = Array.from(assetCategoriesState.modal.selection);

      assetCategoriesState.modal.isSaving = true;
      saveButton.disabled = true;
      saveButton.dataset.loading = 'true';
      if (errorEl) {
        errorEl.hidden = true;
        errorEl.textContent = '';
      }

      try {
        const overview = await fetchJson(`${API.assetCategories}/${categoryId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ decision, comment, assetSubCategoryIds })
        });
        applyAssetCategoryOverview(overview);
        renderAssetCategoryTable(root);
        updateAssetCategorySummary(root);
        close();
        showToast('Asset-Kategorie aktualisiert.');
      } catch (error) {
        const message = error?.payload?.error || error.message || 'Asset-Kategorie konnte nicht gespeichert werden.';
        if (errorEl) {
          errorEl.hidden = false;
          errorEl.textContent = message;
        }
      } finally {
        assetCategoriesState.modal.isSaving = false;
        saveButton.disabled = false;
        delete saveButton.dataset.loading;
      }
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modal.getAttribute('aria-hidden') === 'false') {
      close();
    }
  });

  return { open, close, modal };
}

function setupAssetCategoryTableInteractions(root, controller) {
  const tbody = select(root, '[data-asset-category-table-body]');
  if (!tbody || !controller) {
    return;
  }

  const handleOpen = (trigger) => {
    const categoryId = Number(trigger?.dataset?.assetCategoryId || '');
    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      return;
    }
    controller.open(trigger, categoryId);
  };

  tbody.addEventListener('click', (event) => {
    const row = event.target.closest('[data-asset-category-row]');
    if (!row) {
      return;
    }
    event.preventDefault();
    handleOpen(row);
  });

  tbody.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    const row = event.target.closest('[data-asset-category-row]');
    if (!row) {
      return;
    }
    event.preventDefault();
    handleOpen(row);
  });
}

function setupAssetCategoryCreateForm(root) {
  const trigger = select(root, '[data-open-create-asset-category]');
  const modal = document.querySelector('[data-asset-category-create-modal]');
  const form = modal ? select(modal, '[data-asset-category-create]') : null;
  if (!trigger || !modal || !form) {
    return;
  }

  modal.setAttribute('aria-hidden', 'true');

  const input = select(form, '[data-asset-category-name-input]');
  const errorEl = select(form, '[data-asset-category-create-error]');
  const submitButton = select(form, '[data-create-asset-category]');
  const closeButton = select(form, '[data-close-create-asset-category]');
  const cancelButton = select(form, '[data-cancel-create-asset-category]');

  let lastFocus = null;

  const resetError = () => {
    if (errorEl) {
      errorEl.hidden = true;
      errorEl.textContent = '';
    }
  };

  const open = (origin) => {
    if (assetCategoriesState.isCreating) {
      return;
    }
    lastFocus = origin || document.activeElement;
    resetError();
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    modal.setAttribute('tabindex', '-1');
    modal.focus();
    input?.focus();
  };

  const close = ({ force = false } = {}) => {
    if (!force && assetCategoriesState.isCreating) {
      return;
    }
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    if (submitButton) {
      submitButton.disabled = false;
      delete submitButton.dataset.loading;
    }
    const focusTarget = lastFocus;
    lastFocus = null;
    if (focusTarget && typeof focusTarget.focus === 'function') {
      focusTarget.focus();
    }
  };

  trigger.addEventListener('click', () => open(trigger));

  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      close();
    }
  });

  closeButton?.addEventListener('click', () => close());
  cancelButton?.addEventListener('click', () => close());

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modal.getAttribute('aria-hidden') === 'false') {
      close();
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (assetCategoriesState.isCreating) {
      return;
    }

    const name = input?.value?.trim() ?? '';
    if (!name) {
      if (errorEl) {
        errorEl.hidden = false;
        errorEl.textContent = 'Bitte geben Sie einen Namen für die Asset-Kategorie an.';
      }
      input?.focus();
      return;
    }

    resetError();

    assetCategoriesState.isCreating = true;
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.dataset.loading = 'true';
    }

    try {
      const overview = await fetchJson(API.assetCategories, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      applyAssetCategoryOverview(overview);
      renderAssetCategoryTable(root);
      updateAssetCategorySummary(root);
      if (input) {
        input.value = '';
      }
      close({ force: true });
      showToast('Asset-Kategorie erstellt.');
    } catch (error) {
      const message = error?.payload?.error || error.message || 'Asset-Kategorie konnte nicht erstellt werden.';
      if (errorEl) {
        errorEl.hidden = false;
        errorEl.textContent = message;
      }
      input?.focus();
    } finally {
      assetCategoriesState.isCreating = false;
      if (submitButton) {
        submitButton.disabled = false;
        delete submitButton.dataset.loading;
      }
    }
  });
}

function initAssetCategoriesView(root) {
  const script = document.querySelector('[data-asset-category-state]');
  if (script) {
    try {
      const data = JSON.parse(script.textContent || '{}');
      applyAssetCategoryOverview(data);
    } catch (error) {
      applyAssetCategoryOverview({ categories: [], assetSubCategories: [] });
    }
  } else {
    applyAssetCategoryOverview({ categories: [], assetSubCategories: [] });
  }

  renderAssetCategoryTable(root);
  updateAssetCategorySummary(root);
  const modalController = createAssetCategoryModalController(root);
  setupAssetCategoryTableInteractions(root, modalController);
  setupAssetCategoryCreateForm(root);
}

function initAssetStructureApp() {
  const root = document.querySelector('[data-app="asset-structure"]');
  if (!root) return;
  if (root.dataset.view === 'asset-categories') {
    initAssetCategoriesView(root);
    return;
  }
  setupStructureModals(root);
  setupCreateCategoryForm(root);
  setupCreateGroupForm(root);
  setupDeleteGroupButton(root);
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
  initMeasuresApp();
});
