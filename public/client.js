const API = {
  rawTables: '/api/v1/raw-tables',
  assetPool: '/api/v1/asset-pool',
  assetPoolFields: '/api/v1/asset-pool/fields',
  assetPoolFieldEditable: (field) =>
    `/api/v1/asset-pool/fields/${encodeURIComponent(field)}/editable`,
  assetPoolFieldValue: (rowId, field) =>
    `/api/v1/asset-pool/rows/${encodeURIComponent(rowId)}/fields/${encodeURIComponent(field)}`,
  assetSubCategories: '/api/v1/asset-sub-categories',
  assetSubCategory: (slug) => `/api/v1/asset-sub-categories/${encodeURIComponent(slug)}`,
  manipulators: '/api/v1/manipulators',
  manipulator: (id) => `/api/v1/manipulators/${encodeURIComponent(id)}`,
  categories: '/api/v1/categories',
  groups: '/api/v1/groups',
  groupAssetSelectors: (groupSlug) =>
    `/api/v1/groups/${encodeURIComponent(groupSlug)}/asset-selectors`,
  groupAssetSelector: (groupSlug, selectorId) =>
    `/api/v1/groups/${encodeURIComponent(groupSlug)}/asset-selectors/${selectorId}`,
  groupAssetSelectorAssets: (groupSlug, selectorId) =>
    `/api/v1/groups/${encodeURIComponent(groupSlug)}/asset-selectors/${selectorId}/assets`,
  measures: '/api/v1/measures',
  measuresUpload: '/api/v1/measures/upload',
  reportsCoverage: '/api/v1/reports/abdeckung'
};

const PAGE_SIZE = 25;
const RAW_TABLE_DEFAULT_PAGE_SIZE = 50;
const TOAST_STORAGE_KEY = 'assetPoolToast';

const state = {
  rawTables: [],
  assetPool: null,
  assetPoolSort: { key: null, direction: 'asc' },
  assetPoolPage: 1,
  assetPoolView: 'overview',
  assetFieldSuggestions: [],
  currentRawDetail: null,
  rawTablePage: 1,
  rawTablePageSize: RAW_TABLE_DEFAULT_PAGE_SIZE,
  currentRawTableId: null,
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
  manipulators: {
    entries: [],
    fields: [],
    isLoading: false,
    hasLoaded: false,
    error: null,
    modal: {
      isOpen: false,
      isSaving: false,
      trigger: null,
      error: null,
      mode: 'create',
      manipulatorId: null,
      data: {
        mode: 'all',
        rules: []
      },
      modal: null
    }
  },
  groupSelector: {
    selectors: [],
    fields: [],
    isLoading: false,
    error: null,
    editor: {
      isOpen: false,
      isSaving: false,
      mode: 'create',
      selectorId: null,
      error: null,
      data: null,
      modal: null,
      trigger: null
    },
    viewer: {
      isOpen: false,
      isLoading: false,
      selectorId: null,
      error: null,
      title: '',
      columns: [],
      rows: [],
      modal: null,
      trigger: null
    }
  },
  measures: {
    isUploadOpen: false
  },
  reports: {
    report: null,
    isCalculating: false,
    error: null
  }
};

const measuresState = {
  entries: [],
  headers: [],
  filters: { topic: '', subTopic: '', category: '' },
  options: { topics: [], subTopics: [], categories: [] },
  version: null,
  isLoading: false,
  error: null,
  isUploading: false
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
    state.manipulators?.modal?.isOpen ||
    state.groupSelector?.editor?.isOpen ||
    state.groupSelector?.viewer?.isOpen ||
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

function getGroupSelectorCount(root) {
  if (!root?.dataset) {
    return 0;
  }
  return readNonNegativeInteger(root.dataset.groupSelectorCount);
}

function syncDeleteGroupButtonState(root) {
  const button = select(root, '[data-delete-group]');
  if (!button) {
    return;
  }

  const shouldDisable = getGroupSelectorCount(root) > 0;
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

function setGroupSelectorCount(root, count) {
  if (!root?.dataset) {
    return;
  }
  const safeCount = readNonNegativeInteger(count);
  root.dataset.groupSelectorCount = String(safeCount);
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

function showToast(message, { type } = {}) {
  const container = document.querySelector('.toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  if (type === 'error') {
    toast.classList.add('toast--error');
  }
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

  const activeId = root.dataset.rawTableId || '';
  const view = root.dataset.view;

  state.rawTables.forEach((table) => {
    const link = document.createElement('a');
    link.href = `/asset-pool/raw/${table.id}`;
    link.className = 'sidebar-link';
    link.textContent = table.title;
    if (table.archived) {
      link.textContent += ' (archiviert)';
    }
    if (view === 'raw' && String(table.id) === String(activeId)) {
      link.dataset.active = 'true';
    }
    list.appendChild(link);
  });
}

const MANIPULATOR_OPERATORS = [
  { value: 'equals', label: 'gleich' },
  { value: 'not_equals', label: 'ungleich' },
  { value: 'regex', label: 'Regex (Übereinstimmung)' },
  { value: 'greater', label: 'größer als' },
  { value: 'less', label: 'kleiner als' }
];

let manipulatorRuleCounter = 0;

function createManipulatorRule(initial = {}) {
  manipulatorRuleCounter += 1;
  const operators = new Set(MANIPULATOR_OPERATORS.map((option) => option.value));
  const operator = operators.has(initial.operator) ? initial.operator : 'equals';
  return {
    id: `manipulator-rule-${manipulatorRuleCounter}`,
    field: typeof initial.field === 'string' ? initial.field : '',
    operator,
    value: typeof initial.value === 'string' ? initial.value : initial.value ?? ''
  };
}

function sortManipulators(entries) {
  return entries.slice().sort((a, b) => {
    const aTitle = (a?.title || '').toLowerCase();
    const bTitle = (b?.title || '').toLowerCase();
    return aTitle.localeCompare(bTitle, undefined, { sensitivity: 'base', numeric: true });
  });
}

function syncAssetPoolNavigation(root) {
  const currentView = state.assetPoolView;
  selectAll(root, '[data-sidebar-link]').forEach((link) => {
    const target = link.dataset.sidebarLink;
    if (!target) {
      return;
    }
    const isActive = target === currentView;
    link.classList.toggle('sidebar-link--active', isActive);
    if (isActive) {
      link.setAttribute('aria-current', 'page');
    } else {
      link.removeAttribute('aria-current');
    }
  });
}

function setAssetPoolView(root, view) {
  if (!root) {
    return;
  }

  const allowedViews = new Set(['overview', 'manipulators', 'raw']);
  const nextView = allowedViews.has(view) ? view : 'overview';
  state.assetPoolView = nextView;
  root.dataset.view = nextView;

  selectAll(root, '[data-asset-pool-panel]').forEach((panel) => {
    const panelView = panel.dataset.assetPoolPanel;
    if (!panelView) {
      return;
    }
    const isActive = panelView === nextView;
    panel.hidden = !isActive;
  });

  syncAssetPoolNavigation(root);

  if (nextView === 'overview') {
    renderAssetPool(root);
  } else if (nextView === 'manipulators') {
    renderManipulatorView(root);
    if (!state.manipulators.hasLoaded && !state.manipulators.isLoading) {
      refreshManipulators(root);
    }
  }
}

function renderManipulatorTable(entries, root) {
  const wrapper = document.createElement('div');
  wrapper.className = 'table-wrapper';
  const scroller = document.createElement('div');
  scroller.className = 'table-scroller';
  const table = document.createElement('table');
  table.className = 'table';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  const headers = ['Titel', 'Beschreibung', 'Feldname', 'Wert', 'Assets', 'Aktualisiert'];
  headers.forEach((label) => {
    const th = document.createElement('th');
    th.textContent = label;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  entries.forEach((entry) => {
    const row = document.createElement('tr');
    row.classList.add('table-row', 'table-row--interactive');
    row.tabIndex = 0;
    row.setAttribute('role', 'button');
    row.dataset.manipulatorId = entry?.id;
    if (entry?.title) {
      row.setAttribute('aria-label', `Manipulator „${entry.title}” bearbeiten`);
    }

    const titleCell = document.createElement('td');
    titleCell.textContent = entry?.title || 'Manipulator ohne Titel';
    row.appendChild(titleCell);

    const descriptionCell = document.createElement('td');
    descriptionCell.textContent = entry?.description || '';
    row.appendChild(descriptionCell);

    const fieldCell = document.createElement('td');
    fieldCell.textContent = entry?.fieldName || '';
    row.appendChild(fieldCell);

    const valueCell = document.createElement('td');
    valueCell.textContent = entry?.fieldValue ?? '';
    row.appendChild(valueCell);

    const assetsCell = document.createElement('td');
    assetsCell.textContent = formatAssetCount(entry?.assetCount);
    row.appendChild(assetsCell);

    const updatedCell = document.createElement('td');
    updatedCell.textContent = formatDate(entry?.updatedAt || entry?.createdAt);
    row.appendChild(updatedCell);

    const handleOpen = () => {
      openManipulatorModal(root, row, entry);
    };

    row.addEventListener('click', handleOpen);
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleOpen();
      }
    });

    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  scroller.appendChild(table);
  wrapper.appendChild(scroller);
  return wrapper;
}

function renderManipulatorView(root) {
  const panel = select(root, '[data-asset-pool-panel="manipulators"]');
  if (!panel) {
    return;
  }

  const loadingEl = select(panel, '[data-manipulator-loading]');
  const errorEl = select(panel, '[data-manipulator-error]');
  const emptyCard = select(panel, '[data-manipulator-empty]');
  const tableContainer = select(panel, '[data-manipulator-table]');

  if (loadingEl) {
    loadingEl.hidden = !state.manipulators.isLoading;
  }

  if (errorEl) {
    if (state.manipulators.error) {
      errorEl.hidden = false;
      errorEl.textContent = state.manipulators.error;
    } else {
      errorEl.hidden = true;
      errorEl.textContent = '';
    }
  }

  if (tableContainer) {
    tableContainer.hidden = true;
    tableContainer.innerHTML = '';
  }

  if (emptyCard) {
    emptyCard.hidden = true;
  }

  if (state.manipulators.isLoading || state.manipulators.error) {
    return;
  }

  const entries = Array.isArray(state.manipulators.entries) ? state.manipulators.entries : [];
  if (!entries.length) {
    if (emptyCard) {
      emptyCard.hidden = false;
    }
    return;
  }

  if (tableContainer) {
    const table = renderManipulatorTable(entries, root);
    tableContainer.appendChild(table);
    tableContainer.hidden = false;
  }
}

function clearManipulatorFormError() {
  const modal = state.manipulators.modal.modal;
  if (!modal) {
    return;
  }
  const errorEl = select(modal, '[data-manipulator-form-error]');
  if (errorEl) {
    errorEl.hidden = true;
    errorEl.textContent = '';
  }
}

function setManipulatorFormError(message) {
  const modal = state.manipulators.modal.modal;
  if (!modal) {
    return;
  }
  const errorEl = select(modal, '[data-manipulator-form-error]');
  if (errorEl) {
    errorEl.hidden = false;
    errorEl.textContent = message;
  }
}

function renderManipulatorModal() {
  const modalState = state.manipulators.modal;
  const modal = modalState.modal;
  if (!modal) {
    return;
  }

  const fields = Array.isArray(state.manipulators.fields) ? state.manipulators.fields : [];
  const data = modalState.data || { mode: 'all', rules: [] };

  const mode = data.mode === 'any' ? 'any' : 'all';
  data.mode = mode;

  const titleEl = select(modal, '[data-manipulator-modal-title]');
  if (titleEl) {
    titleEl.textContent = modalState.mode === 'edit' ? 'Manipulator bearbeiten' : 'Manipulator erstellen';
  }

  const modeSelect = select(modal, '[data-manipulator-mode]');
  if (modeSelect) {
    modeSelect.value = mode;
    modeSelect.disabled = fields.length === 0;
    modeSelect.onchange = () => {
      data.mode = modeSelect.value === 'any' ? 'any' : 'all';
    };
  }

  const addButton = select(modal, '[data-add-manipulator-rule]');
  if (addButton) {
    addButton.disabled = fields.length === 0;
    addButton.onclick = () => {
      const defaultField = fields[0] || '';
      data.rules = Array.isArray(data.rules) ? data.rules.slice() : [];
      data.rules.push(createManipulatorRule({ field: defaultField }));
      renderManipulatorModal();
    };
  }

  const saveButton = select(modal, '[data-save-manipulator]');
  if (saveButton && !modalState.isSaving) {
    saveButton.disabled = fields.length === 0;
    saveButton.textContent = modalState.mode === 'edit' ? 'Speichern' : 'Erstellen';
    if (fields.length === 0) {
      delete saveButton.dataset.loading;
    }
  }

  const noFieldsMessage = select(modal, '[data-manipulator-no-fields]');
  if (noFieldsMessage) {
    noFieldsMessage.hidden = fields.length > 0;
  }

  const rulesContainer = select(modal, '[data-manipulator-rules]');
  if (!rulesContainer) {
    return;
  }

  rulesContainer.innerHTML = '';

  if (fields.length === 0) {
    modalState.data.rules = [];
    return;
  }

  const rules = Array.isArray(data.rules) ? data.rules : [];
  rules.forEach((rule) => {
    if (!fields.includes(rule.field)) {
      rule.field = fields[0] || '';
    }
  });

  if (!rules.length) {
    data.rules = [createManipulatorRule({ field: fields[0] || '' })];
  }

  const activeRules = Array.isArray(data.rules) ? data.rules : [];

  activeRules.forEach((rule, index) => {
    const row = document.createElement('div');
    row.className = 'selector-rule';
    row.dataset.manipulatorRuleId = rule.id;

    const fieldWrapper = document.createElement('div');
    fieldWrapper.className = 'selector-rule__field-wrapper';

    const fieldSelect = document.createElement('select');
    fieldSelect.className = 'selector-rule__field';
    fields.forEach((field) => {
      const option = document.createElement('option');
      option.value = field;
      option.textContent = field || 'Feld auswählen';
      if (field === rule.field) {
        option.selected = true;
      }
      fieldSelect.appendChild(option);
    });
    fieldSelect.addEventListener('change', () => {
      rule.field = fieldSelect.value;
      clearManipulatorFormError();
    });
    fieldWrapper.appendChild(fieldSelect);

    const operatorSelect = document.createElement('select');
    operatorSelect.className = 'selector-rule__operator';
    const hasManipulatorOperator = MANIPULATOR_OPERATORS.some((option) => option.value === rule.operator);
    if (!hasManipulatorOperator) {
      rule.operator = 'equals';
    }
    MANIPULATOR_OPERATORS.forEach((option) => {
      const optionEl = document.createElement('option');
      optionEl.value = option.value;
      optionEl.textContent = option.label;
      if (option.value === rule.operator) {
        optionEl.selected = true;
      }
      operatorSelect.appendChild(optionEl);
    });

    const valueInput = document.createElement('input');
    valueInput.type = 'text';
    valueInput.className = 'selector-rule__value';
    valueInput.autocomplete = 'off';
    valueInput.value = rule.value ?? '';

    const updatePlaceholder = () => {
      if (operatorSelect.value === 'regex') {
        valueInput.placeholder = 'Regex-Muster';
      } else if (operatorSelect.value === 'greater' || operatorSelect.value === 'less') {
        valueInput.placeholder = 'Numerischer Wert';
      } else {
        valueInput.placeholder = 'Wert';
      }
    };

    updatePlaceholder();

    operatorSelect.addEventListener('change', () => {
      rule.operator = operatorSelect.value;
      updatePlaceholder();
    });

    valueInput.addEventListener('input', () => {
      rule.value = valueInput.value;
    });

    fieldWrapper.appendChild(operatorSelect);
    fieldWrapper.appendChild(valueInput);
    row.appendChild(fieldWrapper);

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'icon-button selector-rule__remove';
    removeButton.innerHTML = '&times;';
    removeButton.setAttribute('aria-label', 'Regel entfernen');
    removeButton.addEventListener('click', () => {
      modalState.data.rules = activeRules.filter((entry) => entry.id !== rule.id);
      renderManipulatorModal();
    });

    if (activeRules.length > 1) {
      row.appendChild(removeButton);
    } else {
      removeButton.disabled = true;
      removeButton.setAttribute('aria-hidden', 'true');
    }

    rulesContainer.appendChild(row);
  });
}

function openManipulatorModal(root, trigger, entry = null) {
  const modalState = state.manipulators.modal;
  if (!modalState.modal) {
    modalState.modal = document.querySelector('[data-manipulator-modal]');
  }
  const modal = modalState.modal;
  if (!modal || modalState.isOpen) {
    return;
  }

  modalState.isOpen = true;
  modalState.isSaving = false;
  modalState.trigger = trigger || null;
  modalState.error = null;
  modalState.mode = entry ? 'edit' : 'create';
  modalState.manipulatorId = entry?.id ?? null;

  const form = select(modal, '[data-manipulator-form]');
  form?.reset();

  const titleInput = select(modal, '[data-manipulator-title]');
  const descriptionInput = select(modal, '[data-manipulator-description]');
  const fieldNameInput = select(modal, '[data-manipulator-field-name]');
  const fieldValueInput = select(modal, '[data-manipulator-field-value]');
  if (entry) {
    if (titleInput) {
      titleInput.value = entry.title || '';
    }
    if (descriptionInput) {
      descriptionInput.value = entry.description || '';
    }
    if (fieldNameInput) {
      fieldNameInput.value = entry.fieldName || '';
    }
    if (fieldValueInput) {
      fieldValueInput.value = entry.fieldValue ?? '';
    }
  } else {
    if (titleInput) {
      titleInput.value = '';
    }
    if (descriptionInput) {
      descriptionInput.value = '';
    }
    if (fieldNameInput) {
      fieldNameInput.value = '';
    }
    if (fieldValueInput) {
      fieldValueInput.value = '';
    }
  }

  const fields = Array.isArray(state.manipulators.fields) ? state.manipulators.fields : [];
  if (entry?.definition) {
    const definition = entry.definition;
    const mode = definition?.mode === 'any' ? 'any' : 'all';
    const rules = [];
    const collectRules = (node) => {
      if (!node || typeof node !== 'object') {
        return;
      }
      if (node.type === 'rule') {
        rules.push(createManipulatorRule(node));
        return;
      }
      const children = Array.isArray(node.children) ? node.children : [];
      children.forEach((child) => collectRules(child));
    };
    collectRules(definition);
    modalState.data = { mode, rules };
  } else {
    modalState.data = {
      mode: 'all',
      rules: fields.length ? [createManipulatorRule({ field: fields[0] || '' })] : []
    };
  }

  clearManipulatorFormError();
  renderManipulatorModal();

  modal.hidden = false;
  modal.setAttribute('aria-hidden', 'false');
  if (!modal.hasAttribute('tabindex')) {
    modal.setAttribute('tabindex', '-1');
  }
  modal.focus?.();
  lockBodyScroll();
  titleInput?.focus();
}

function closeManipulatorModal({ focusTrigger = true } = {}) {
  const modalState = state.manipulators.modal;
  const modal = modalState.modal;
  if (!modal || !modalState.isOpen) {
    return;
  }

  const saveButton = select(modal, '[data-save-manipulator]');
  if (saveButton) {
    saveButton.disabled = false;
    delete saveButton.dataset.loading;
  }

  const form = select(modal, '[data-manipulator-form]');
  form?.reset();

  modal.hidden = true;
  modal.setAttribute('aria-hidden', 'true');

  modalState.isOpen = false;
  modalState.isSaving = false;
  modalState.error = null;
  modalState.mode = 'create';
  modalState.manipulatorId = null;
  modalState.data = { mode: 'all', rules: [] };

  clearManipulatorFormError();
  unlockBodyScrollIfIdle();

  const trigger = modalState.trigger;
  modalState.trigger = null;
  if (focusTrigger && trigger && typeof trigger.focus === 'function') {
    trigger.focus();
  }
}

async function handleManipulatorFormSubmit(root, event) {
  event.preventDefault();
  const modalState = state.manipulators.modal;
  const modal = modalState.modal;
  if (!modal || modalState.isSaving) {
    return;
  }

  clearManipulatorFormError();

  const titleInput = select(modal, '[data-manipulator-title]');
  const descriptionInput = select(modal, '[data-manipulator-description]');
  const fieldNameInput = select(modal, '[data-manipulator-field-name]');
  const fieldValueInput = select(modal, '[data-manipulator-field-value]');
  const saveButton = select(modal, '[data-save-manipulator]');

  const title = titleInput?.value.trim() || '';
  if (!title) {
    setManipulatorFormError('Titel ist erforderlich.');
    titleInput?.focus();
    return;
  }

  const fieldName = fieldNameInput?.value.trim() || '';
  if (!fieldName) {
    setManipulatorFormError('Feldname ist erforderlich.');
    fieldNameInput?.focus();
    return;
  }

  const rawFieldValue = fieldValueInput?.value;
  const hasFieldValue = typeof rawFieldValue === 'string' ? rawFieldValue.trim().length > 0 : false;
  if (!hasFieldValue) {
    setManipulatorFormError('Feldwert ist erforderlich.');
    fieldValueInput?.focus();
    return;
  }
  const fieldValue = typeof rawFieldValue === 'string' ? rawFieldValue : String(rawFieldValue ?? '');

  const fields = Array.isArray(state.manipulators.fields) ? state.manipulators.fields : [];
  if (!fields.length) {
    setManipulatorFormError('Fügen Sie Asset-Pool-Felder hinzu, bevor Sie einen Manipulator erstellen.');
    return;
  }

  const rawRules = Array.isArray(modalState.data.rules) ? modalState.data.rules : [];
  const normalisedRules = rawRules
    .map((rule) => {
      const field = typeof rule.field === 'string' ? rule.field.trim() : '';
      const operator = MANIPULATOR_OPERATORS.some((option) => option.value === rule.operator)
        ? rule.operator
        : 'equals';
      const value = typeof rule.value === 'string' ? rule.value.trim() : String(rule.value ?? '').trim();
      return { field, operator, value };
    })
    .filter((rule) => rule.field && rule.value);

  if (!normalisedRules.length) {
    setManipulatorFormError('Fügen Sie mindestens eine Regel mit Feld und Wert hinzu.');
    return;
  }

  const payload = {
    title,
    description: descriptionInput?.value.trim() || '',
    fieldName,
    fieldValue,
    definition: {
      type: 'group',
      mode: modalState.data.mode === 'any' ? 'any' : 'all',
      children: normalisedRules.map((rule) => ({
        type: 'rule',
        field: rule.field,
        operator: rule.operator,
        value: rule.value
      }))
    }
  };

  modalState.isSaving = true;
  if (saveButton) {
    saveButton.disabled = true;
    saveButton.dataset.loading = 'true';
  }

  try {
    const isEdit = modalState.mode === 'edit' && modalState.manipulatorId !== null;
    const url = isEdit ? API.manipulator(modalState.manipulatorId) : API.manipulators;
    const entry = await fetchJson(url, {
      method: isEdit ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const entries = Array.isArray(state.manipulators.entries)
      ? state.manipulators.entries.slice()
      : [];
    const existingIndex = entries.findIndex((item) => item?.id === entry?.id);
    if (existingIndex === -1) {
      entries.push(entry);
    } else {
      entries[existingIndex] = entry;
    }
    state.manipulators.entries = sortManipulators(entries);
    state.manipulators.error = null;
    state.manipulators.hasLoaded = true;
    renderManipulatorView(root);
    closeManipulatorModal();
    await refreshAssetPool();
    await refreshManipulators(root);
    showToast(isEdit ? 'Manipulator aktualisiert.' : 'Manipulator erstellt.');
  } catch (error) {
    const message =
      error?.payload?.error ||
      error?.message ||
      (modalState.mode === 'edit'
        ? 'Manipulator konnte nicht aktualisiert werden.'
        : 'Manipulator konnte nicht erstellt werden.');
    setManipulatorFormError(message);
  } finally {
    modalState.isSaving = false;
    if (saveButton) {
      saveButton.disabled = false;
      delete saveButton.dataset.loading;
      if (!fields.length) {
        saveButton.disabled = true;
      }
    }
  }
}

async function refreshManipulators(root = document.querySelector('[data-app="asset-pool"]')) {
  state.manipulators.isLoading = true;
  if (root && state.assetPoolView === 'manipulators') {
    renderManipulatorView(root);
  }

  try {
    const data = await fetchJson(API.manipulators);
    const entries = Array.isArray(data?.manipulators) ? data.manipulators : [];
    state.manipulators.entries = sortManipulators(entries);
    state.manipulators.fields = Array.isArray(data?.fieldOptions) ? data.fieldOptions : [];
    state.manipulators.error = null;
    state.manipulators.hasLoaded = true;
  } catch (error) {
    state.manipulators.error =
      error?.payload?.error || error?.message || 'Manipulatoren konnten nicht geladen werden.';
  } finally {
    state.manipulators.isLoading = false;
    if (root && state.assetPoolView === 'manipulators') {
      renderManipulatorView(root);
    }
    if (state.manipulators.modal.isOpen) {
      renderManipulatorModal();
    }
  }
}

function setupManipulatorInterface(root) {
  const modalState = state.manipulators.modal;
  modalState.modal = document.querySelector('[data-manipulator-modal]');
  const modal = modalState.modal;

  const trigger = select(root, '[data-open-manipulator-modal]');
  if (trigger) {
    trigger.addEventListener('click', () => openManipulatorModal(root, trigger));
  }

  if (modal) {
    selectAll(modal, '[data-close-manipulator-modal]').forEach((button) => {
      button.addEventListener('click', () => closeManipulatorModal());
    });

    modal.addEventListener('click', (event) => {
      if (event.target === modal) {
        closeManipulatorModal({ focusTrigger: false });
      }
    });

    const form = select(modal, '[data-manipulator-form]');
    form?.addEventListener('submit', (event) => handleManipulatorFormSubmit(root, event));
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.manipulators.modal.isOpen) {
      closeManipulatorModal();
    }
  });
}

function setupAssetPoolNavigation(root) {
  selectAll(root, '[data-sidebar-link]').forEach((link) => {
    const target = link.dataset.sidebarLink;
    if (!target) {
      return;
    }
    link.addEventListener('click', (event) => {
      event.preventDefault();
      setAssetPoolView(root, target);
    });
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
    const aValue = key === 'id' ? a.id : a[key];
    const bValue = key === 'id' ? b.id : b[key];

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

  const view = state.assetPool;
  const rows = Array.isArray(view?.rows) ? view.rows : [];
  const fieldStats = Array.isArray(view?.fieldStats) ? view.fieldStats : [];
  const fieldSettings = view?.fieldSettings || {};
  const columns = Array.isArray(view?.columns) && view.columns.length
    ? view.columns
    : fieldStats.map((stat) => stat.field);

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

  const headers = columns.map((col) => ({ key: col, label: col }));
  const editableFields = new Set(columns.filter((key) => fieldSettings?.[key]?.editable));

  const tableWrapper = document.createElement('div');
  tableWrapper.className = 'table-wrapper';
  const tableScroller = document.createElement('div');
  tableScroller.className = 'table-scroller';
  const table = document.createElement('table');
  table.className = 'table';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
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
      headers.forEach((header) => {
        const cell = document.createElement('td');
        const value = row[header.key];
        if (editableFields.has(header.key)) {
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
          save.addEventListener('click', () => handleEditableCellSave(row.id, header.key, input, save));
          input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              handleEditableCellSave(row.id, header.key, input, save);
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

function setElementHidden(element, hidden) {
  if (!element) {
    return;
  }
  element.hidden = hidden;
  element.setAttribute('aria-hidden', hidden ? 'true' : 'false');
}

function renderRawTablePagination(root, pagination) {
  const container = select(root, '[data-raw-pagination]');
  if (!container) {
    return;
  }
  if (
    !pagination ||
    !Number.isInteger(pagination.page) ||
    !Number.isInteger(pagination.pageSize) ||
    !Number.isInteger(pagination.totalRows) ||
    !Number.isInteger(pagination.totalPages) ||
    pagination.totalRows <= 0
  ) {
    setElementHidden(container, true);
    container.innerHTML = '';
    return;
  }

  const page = pagination.page;
  const pageSize = pagination.pageSize;
  const totalRows = pagination.totalRows;
  const totalPages = pagination.totalPages;
  const startIndex = Math.max(0, (page - 1) * pageSize);
  const displayStart = totalRows ? startIndex + 1 : 0;
  const displayEnd = totalRows ? Math.min(totalRows, startIndex + pageSize) : 0;

  container.innerHTML = '';
  setElementHidden(container, false);

  const info = document.createElement('span');
  info.className = 'pagination-info';
  info.textContent = `Angezeigt: ${displayStart}-${displayEnd} von ${totalRows}`;

  const controls = document.createElement('div');
  controls.className = 'pagination-controls';

  const prev = document.createElement('button');
  prev.type = 'button';
  prev.textContent = 'Zurück';
  prev.disabled = page <= 1;
  prev.addEventListener('click', () => {
    if (page <= 1) {
      return;
    }
    state.rawTablePage = Math.max(1, page - 1);
    renderRawTable(root);
  });

  const next = document.createElement('button');
  next.type = 'button';
  next.textContent = 'Weiter';
  next.disabled = page >= totalPages;
  next.addEventListener('click', () => {
    if (page >= totalPages) {
      return;
    }
    state.rawTablePage = Math.min(totalPages, page + 1);
    renderRawTable(root);
  });

  controls.appendChild(prev);
  controls.appendChild(next);

  container.appendChild(info);
  container.appendChild(controls);
}

function renderRawTable(root) {
  if (!root) {
    return;
  }

  const rawTableId = (root.dataset.rawTableId || '').trim();
  if (!rawTableId) {
    return;
  }

  if (state.currentRawTableId !== rawTableId) {
    state.currentRawTableId = rawTableId;
    state.rawTablePage = 1;
    state.rawTablePageSize = RAW_TABLE_DEFAULT_PAGE_SIZE;
  }

  const metaBadge = select(root, '[data-raw-meta]');
  const tableContainer = select(root, '[data-raw-table]');
  const emptyCard = select(root, '[data-raw-empty]');
  const titleEl = select(root, '.page-title');
  const archiveButton = select(root, '[data-archive-raw]');
  const heading = select(root, '[data-raw-heading]');
  const missingBlock = select(root, '[data-raw-missing]');
  const notFoundCard = select(root, '[data-raw-not-found]');
  const contentWrapper = select(root, '[data-raw-content]');
  const actionBar = select(root, '[data-raw-actions]');
  const paginationContainer = select(root, '[data-raw-pagination]');

  const showPresentState = () => {
    setElementHidden(heading, false);
    setElementHidden(actionBar, false);
    setElementHidden(contentWrapper, false);
    setElementHidden(missingBlock, true);
    setElementHidden(notFoundCard, true);
  };

  const showMissingState = (message) => {
    setElementHidden(heading, true);
    setElementHidden(actionBar, true);
    setElementHidden(contentWrapper, true);
    setElementHidden(missingBlock, false);
    setElementHidden(notFoundCard, false);
    setElementHidden(paginationContainer, true);
    if (metaBadge) {
      metaBadge.textContent = '';
    }
    if (tableContainer) {
      tableContainer.innerHTML = '';
    }
    if (emptyCard) {
      setElementHidden(emptyCard, true);
    }
    if (titleEl && message) {
      titleEl.textContent = message;
    }
  };

  showPresentState();

  const params = new URLSearchParams();
  params.set('page', state.rawTablePage);
  params.set('pageSize', state.rawTablePageSize);

  fetchJson(`${API.rawTables}/${encodeURIComponent(rawTableId)}?${params.toString()}`)
    .then((data) => {
      showPresentState();
      state.currentRawDetail = data;
      state.rawTablePage = data.pagination?.page ?? state.rawTablePage;
      state.rawTablePageSize = data.pagination?.pageSize ?? state.rawTablePageSize;

      const fieldStats = Array.isArray(data.assetPool?.fieldStats) ? data.assetPool.fieldStats : [];
      const statNames = fieldStats.map((stat) => stat.field);
      state.assetFieldSuggestions = Array.from(new Set([...statNames, ...state.assetFieldSuggestions]));
      if (metaBadge) {
        const archivedLabel = data.table.archived ? ' · Archiviert' : '';
        const sourceLabel = data.table.sourceFileName ? ` · ${data.table.sourceFileName}` : '';
        metaBadge.textContent = `${formatDate(data.table.uploadedAt)}${sourceLabel}${archivedLabel}`;
      }
      if (titleEl) {
        titleEl.textContent = data.table.title;
      }
      if (archiveButton) {
        const archived = data.table.archived === true;
        archiveButton.hidden = archived;
        archiveButton.disabled = archived;
        archiveButton.setAttribute('aria-hidden', archived ? 'true' : 'false');
      }

      const hasRows = Array.isArray(data.rows) && data.rows.length > 0;

      if (tableContainer) {
        setElementHidden(tableContainer, !hasRows);
        if (!hasRows) {
          tableContainer.innerHTML = '';
        }
      }

      if (emptyCard) {
        setElementHidden(emptyCard, hasRows);
      }

      if (!hasRows) {
        renderRawTablePagination(root, data.pagination);
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
        tableContainer.appendChild(wrapper);
      }

      renderRawTablePagination(root, data.pagination);
    })
    .catch((err) => {
      state.currentRawDetail = null;
      renderRawTablePagination(root, null);
      showMissingState('Rohdatentabelle nicht gefunden');
      const message = err?.payload?.error || err?.message;
      showToast(message || 'Rohdatentabelle konnte nicht geladen werden.');
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
          const next = state.rawTables.find((entry) => !entry.archived) || state.rawTables[0];
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
    const suggestionSource = Array.isArray(data?.suggestions) ? data.suggestions : [];
    const statNames = fieldStats.map((stat) => stat.field);
    const statSet = new Set(statNames);
    const preserved = state.assetFieldSuggestions.filter((field) => statSet.has(field));
    state.assetFieldSuggestions = Array.from(new Set([...preserved, ...statNames, ...suggestionSource]));
    const root = document.querySelector('[data-app="asset-pool"]');
    if (root) {
      if (state.assetPoolView === 'overview') {
        renderAssetPool(root);
      } else if (state.assetPoolView === 'manipulators') {
        renderManipulatorView(root);
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

function setupArchiveRaw(root) {
  const button = select(root, '[data-archive-raw]');
  if (!button) return;

  button.addEventListener('click', async () => {
    const rawTableId = state.currentRawDetail?.table?.id || root.dataset.rawTableId;
    if (!rawTableId) {
      return;
    }

    const confirmed = window.confirm('Diese Rohdatentabelle archivieren? Zugeordnete Assets werden ebenfalls archiviert.');
    if (!confirmed) {
      return;
    }

    button.disabled = true;
    button.dataset.loading = 'true';

    try {
      await fetchJson(`${API.rawTables}/${rawTableId}/archive`, { method: 'POST' });
      await refreshRawTables();
      await refreshAssetPool();
      renderRawTable(root);
      showToast('Rohdatentabelle archiviert.');
    } catch (error) {
      const message = error?.payload?.error || error?.message || 'Archivierung der Rohdatentabelle fehlgeschlagen.';
      showToast(message);
    } finally {
      delete button.dataset.loading;
      button.disabled = false;
    }
  });
}

function setupCreateGroupForm(root) {
  const assetSubCategorySlug = typeof root?.dataset?.assetSubCategorySlug === 'string'
    ? root.dataset.assetSubCategorySlug.trim()
    : '';
  if (!assetSubCategorySlug) {
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
    payload.asset_sub_category_slug = assetSubCategorySlug;
    payload.category_slugs = [assetSubCategorySlug];

    isSubmitting = true;
    saveButton.disabled = true;
    saveButton.dataset.loading = 'true';

    try {
      await fetchJson(API.groups, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
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

    const groupSlug = typeof root?.dataset?.groupSlug === 'string' ? root.dataset.groupSlug.trim() : '';
    if (!groupSlug) {
      showToast('Gruppe konnte nicht gelöscht werden.', { type: 'error' });
      return;
    }

    button.disabled = true;
    button.dataset.loading = 'true';

    try {
      await fetchJson(`${API.groups}/${encodeURIComponent(groupSlug)}`, { method: 'DELETE' });
      const assetSubCategorySlug = root?.dataset?.assetSubCategorySlug || '';
      const topicId = root?.dataset?.topicId || '';
      const subTopicId = root?.dataset?.subTopicId || '';

      if (
        typeof topicId === 'string' &&
        topicId &&
        typeof subTopicId === 'string' &&
        subTopicId &&
        assetSubCategorySlug
      ) {
        window.location.assign(`/asset-structure/${topicId}/${subTopicId}/${assetSubCategorySlug}`);
      } else if (typeof topicId === 'string' && topicId) {
        window.location.assign(`/asset-structure/${topicId}`);
      } else {
        window.location.assign('/asset-structure');
      }
    } catch (error) {
      const message =
        error?.payload?.error || error?.message || 'Gruppe konnte nicht gelöscht werden.';
      showToast(message, { type: 'error' });
      syncDeleteGroupButtonState(root);
    } finally {
      delete button.dataset.loading;
    }
  });
}

function setupAssetSubCategoryDetails(root) {
  if (!root) {
    return;
  }

  const slug = typeof root.dataset?.assetSubCategorySlug === 'string'
    ? root.dataset.assetSubCategorySlug.trim()
    : '';
  if (!slug) {
    return;
  }

  const form = select(root, '[data-asset-sub-category-form]');
  const saveButton = select(root, '[data-save-asset-sub-category]');
  if (!form || !saveButton) {
    return;
  }

  const readFieldValue = (name, { trim = true } = {}) => {
    const field = form.querySelector(`[name="${name}"]`);
    if (!field) {
      return '';
    }
    const value = field.value ?? '';
    if (typeof value !== 'string') {
      return '';
    }
    return trim ? value.trim() : value;
  };

  let isSubmitting = false;

  saveButton.addEventListener('click', async () => {
    if (isSubmitting) {
      return;
    }

    const ownerValue = readFieldValue('owner');
    const payload = {
      owner: ownerValue,
      group_owner: ownerValue,
      integrity: readFieldValue('integrity'),
      availability: readFieldValue('availability'),
      confidentiality: readFieldValue('confidentiality'),
      description: readFieldValue('description', { trim: false })
    };

    isSubmitting = true;
    saveButton.disabled = true;
    saveButton.dataset.loading = 'true';

    try {
      await fetchJson(API.assetSubCategory(slug), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      alert('AssetUnterKategorie wurde gespeichert.');
    } catch (error) {
      const message =
        error?.payload?.error || error?.message || 'AssetUnterKategorie konnte nicht gespeichert werden.';
      alert(message);
    } finally {
      isSubmitting = false;
      saveButton.disabled = false;
      delete saveButton.dataset.loading;
    }
  });
}

async function setupGroupDetails(root) {
  if (!root) {
    return;
  }

  try {
    const form = select(root, '[data-group-details-form]');
    const saveButton = select(root, '[data-save-group-details]');
    if (!form || !saveButton) {
      return;
    }

    const feedbackEl = select(root, '[data-group-details-feedback]');
    const titleInput = select(form, '#group-name');
    const descriptionInput = select(form, '#group-description');
    const confidentialitySelect = select(form, '#group-confidentiality');
    const integritySelect = select(form, '#group-integrity');
    const availabilitySelect = select(form, '#group-availability');

    const groupSlug =
      typeof root?.dataset?.groupSlug === 'string' ? root.dataset.groupSlug.trim() : '';
    if (!groupSlug) {
      return;
    }

    function setFeedback(message) {
      if (!feedbackEl) {
        return;
      }
      if (message) {
        feedbackEl.hidden = false;
        feedbackEl.textContent = message;
      } else {
        feedbackEl.hidden = true;
        feedbackEl.textContent = '';
      }
    }

    function clearFeedback() {
      setFeedback('');
    }

    let isSaving = false;
    saveButton.addEventListener('click', async () => {
      if (isSaving) {
        return;
      }
      isSaving = true;
      saveButton.disabled = true;
      saveButton.dataset.loading = 'true';
      clearFeedback();

      const payload = {
        title: titleInput?.value?.trim() ?? '',
        description: descriptionInput?.value?.trim() ?? '',
        confidentiality: confidentialitySelect?.value ?? '',
        integrity: integritySelect?.value ?? '',
        availability: availabilitySelect?.value ?? ''
      };

      try {
        await fetchJson(`${API.groups}/${encodeURIComponent(groupSlug)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        showToast('Gruppendetails gespeichert.');
      } catch (error) {
        const message =
          error?.payload?.error || error?.message || 'Gruppendetails konnten nicht gespeichert werden.';
        setFeedback(message);
        showToast(message, { type: 'error' });
      } finally {
        isSaving = false;
        saveButton.disabled = false;
        delete saveButton.dataset.loading;
      }
    });
  } catch (error) {
    console.error('Fehler beim Einrichten der Gruppendetails', error);
  }
}
let selectorNodeSequence = 0;

function nextSelectorNodeId(prefix) {
  selectorNodeSequence += 1;
  return `${prefix}-${selectorNodeSequence}`;
}

function createSelectorRule(initial = {}) {
  const fields = Array.isArray(state.groupSelector.fields) ? state.groupSelector.fields : [];
  const defaultField = fields.length ? fields[0] : '';
  return {
    id: nextSelectorNodeId('rule'),
    type: 'rule',
    field: initial.field || defaultField,
    operator: initial.operator || 'equals',
    value: initial.value !== undefined && initial.value !== null ? String(initial.value) : ''
  };
}

function createSelectorGroup(initial = {}) {
  const group = {
    id: nextSelectorNodeId('group'),
    type: 'group',
    mode: initial.mode === 'any' ? 'any' : 'all',
    children: []
  };
  const children = Array.isArray(initial.children) ? initial.children : [];
  children.forEach((child) => {
    if (child && typeof child === 'object') {
      if (child.type === 'group' || Array.isArray(child.children)) {
        group.children.push(createSelectorGroup(child));
      } else {
        group.children.push(createSelectorRule(child));
      }
    }
  });
  return group;
}

function hydrateSelectorTree(definition) {
  const source = definition && typeof definition === 'object' ? definition : { mode: 'all', children: [] };
  selectorNodeSequence = 0;
  return createSelectorGroup(source);
}

const ALLOWED_SELECTOR_OPERATORS = ['equals', 'not_equals', 'regex', 'greater', 'less'];

function serialiseSelectorNode(node) {
  if (!node || typeof node !== 'object') {
    return null;
  }
  if (node.type === 'rule') {
    const field = (node.field || '').trim();
    if (!field) {
      return null;
    }
    const operator = ALLOWED_SELECTOR_OPERATORS.includes(node.operator) ? node.operator : 'equals';
    const value = node.value !== undefined && node.value !== null ? String(node.value) : '';
    return {
      type: 'rule',
      field,
      operator,
      value
    };
  }
  const children = [];
  (Array.isArray(node.children) ? node.children : []).forEach((child) => {
    const serialised = serialiseSelectorNode(child);
    if (serialised) {
      children.push(serialised);
    }
  });
  return {
    type: 'group',
    mode: node.mode === 'any' ? 'any' : 'all',
    children
  };
}

function sortSelectorEntries(entries) {
  return (Array.isArray(entries) ? entries : [])
    .slice()
    .sort((a, b) => {
      const left = (a?.name || '').toString();
      const right = (b?.name || '').toString();
      return left.localeCompare(right, undefined, { sensitivity: 'base', numeric: true });
    });
}

function formatAssetCount(count) {
  const number = Number(count);
  if (!Number.isFinite(number) || number <= 0) {
    return 'No assets';
  }
  return `${number} ${number === 1 ? 'Asset' : 'Assets'}`;
}

function readInitialGroupSelectorState() {
  const script = document.querySelector('[data-group-selector-state]');
  if (!script) {
    return { selectors: [], fieldOptions: [] };
  }
  try {
    const payload = JSON.parse(script.textContent || '{}');
    return payload && typeof payload === 'object' ? payload : { selectors: [], fieldOptions: [] };
  } catch (error) {
    return { selectors: [], fieldOptions: [] };
  }
}

function applyGroupSelectorOverview(root, overview) {
  const selectors = Array.isArray(overview?.selectors) ? overview.selectors : [];
  const fields = Array.isArray(overview?.fieldOptions) ? overview.fieldOptions : [];
  state.groupSelector.selectors = sortSelectorEntries(selectors);
  state.groupSelector.fields = fields;
  state.groupSelector.isLoading = false;
  state.groupSelector.error = null;
  renderGroupSelectorList(root);
}

function renderGroupSelectorList(root) {
  const list = select(root, '[data-group-selector-list]');
  if (!list) {
    return;
  }
  const emptyEl = select(root, '[data-group-selector-empty]');
  const loadingEl = select(root, '[data-group-selector-loading]');
  const errorEl = select(root, '[data-group-selector-error]');

  if (loadingEl) {
    loadingEl.hidden = !state.groupSelector.isLoading;
  }

  if (errorEl) {
    if (state.groupSelector.error) {
      errorEl.hidden = false;
      errorEl.textContent = state.groupSelector.error;
    } else {
      errorEl.hidden = true;
      errorEl.textContent = '';
    }
  }

  if (state.groupSelector.isLoading) {
    list.hidden = true;
    if (emptyEl) {
      emptyEl.hidden = true;
    }
    return;
  }

  const selectors = Array.isArray(state.groupSelector.selectors) ? state.groupSelector.selectors : [];
  list.innerHTML = '';

  if (!selectors.length) {
    list.hidden = true;
    if (emptyEl) {
      emptyEl.hidden = false;
    }
  } else {
    list.hidden = false;
    if (emptyEl) {
      emptyEl.hidden = true;
    }
    selectors.forEach((entry) => {
      list.appendChild(createSelectorListItem(root, entry));
    });
  }

  setGroupSelectorCount(root, selectors.length);
}

function createSelectorListItem(root, entry) {
  const item = document.createElement('li');
  item.className = 'asset-selector-list__item';
  if (entry?.id !== undefined && entry?.id !== null) {
    item.dataset.groupSelectorId = String(entry.id);
  }

  const card = document.createElement('div');
  card.className = 'asset-selector';

  const header = document.createElement('div');
  header.className = 'asset-selector__header';

  const info = document.createElement('div');
  info.className = 'asset-selector__info';

  const title = document.createElement('h3');
  title.className = 'asset-selector__title';
  title.textContent = entry?.name || 'Untitled Asset Selector';
  info.appendChild(title);

  if (entry?.description) {
    const description = document.createElement('p');
    description.className = 'asset-selector__description';
    description.textContent = entry.description;
    info.appendChild(description);
  }

  header.appendChild(info);

  const meta = document.createElement('div');
  meta.className = 'asset-selector__meta';

  const countEl = document.createElement('span');
  countEl.className = 'asset-selector__count';
  countEl.textContent = formatAssetCount(entry?.assetCount);
  meta.appendChild(countEl);

  const actions = document.createElement('div');
  actions.className = 'asset-selector__actions';

  const showButton = document.createElement('button');
  showButton.type = 'button';
  showButton.className = 'button button--ghost';
  showButton.textContent = 'Show Assets';
  showButton.addEventListener('click', () => openGroupSelectorAssetsModal(root, entry, showButton));
  actions.appendChild(showButton);

  const editButton = document.createElement('button');
  editButton.type = 'button';
  editButton.className = 'button button--ghost';
  editButton.textContent = 'Edit';
  editButton.addEventListener('click', () =>
    openGroupSelectorEditor(root, { mode: 'edit', entry, trigger: editButton })
  );
  actions.appendChild(editButton);

  meta.appendChild(actions);
  header.appendChild(meta);
  card.appendChild(header);
  item.appendChild(card);
  return item;
}

function resetSelectorFormError(modal) {
  const errorEl = select(modal, '[data-group-selector-form-error]');
  if (errorEl) {
    errorEl.hidden = true;
    errorEl.textContent = '';
  }
}

function renderSelectorBuilder(modal) {
  const container = select(modal, '[data-selector-root]');
  if (!container) {
    return;
  }
  let rootNode = state.groupSelector.editor.data;
  if (!rootNode || rootNode.type !== 'group') {
    rootNode = hydrateSelectorTree();
    state.groupSelector.editor.data = rootNode;
  }
  container.innerHTML = '';

  const fields = Array.isArray(state.groupSelector.fields) ? state.groupSelector.fields : [];

  function findParentGroup(group, nodeId) {
    if (!group || group.type !== 'group') {
      return null;
    }
    for (const child of group.children) {
      if (child.id === nodeId) {
        return group;
      }
      if (child.type === 'group') {
        const match = findParentGroup(child, nodeId);
        if (match) {
          return match;
        }
      }
    }
    return null;
  }

  function buildRule(node, parentGroup) {
    const row = document.createElement('div');
    row.className = 'selector-rule';
    row.dataset.selectorNodeId = node.id;

    const fieldWrapper = document.createElement('div');
    fieldWrapper.className = 'selector-rule__field-wrapper';

    const fieldSelect = document.createElement('select');
    fieldSelect.className = 'selector-rule__field';

    const uniqueFields = new Set(fields);
    if (node.field && !uniqueFields.has(node.field)) {
      uniqueFields.add(node.field);
    }

    Array.from(uniqueFields).forEach((field) => {
      const option = document.createElement('option');
      option.value = field;
      option.textContent = field || 'Select field';
      if (field === node.field) {
        option.selected = true;
      }
      fieldSelect.appendChild(option);
    });

    fieldSelect.addEventListener('change', () => {
      node.field = fieldSelect.value;
    });
    fieldWrapper.appendChild(fieldSelect);

    const operatorSelect = document.createElement('select');
    operatorSelect.className = 'selector-rule__operator';
    const operatorOptions = [
      { value: 'equals', label: 'equals' },
      { value: 'not_equals', label: 'does not equal' },
      { value: 'regex', label: 'regex (matches)' },
      { value: 'greater', label: 'greater than' },
      { value: 'less', label: 'less than' }
    ];
    if (!operatorOptions.some((option) => option.value === node.operator)) {
      node.operator = 'equals';
    }
    operatorOptions.forEach((option) => {
      const optionEl = document.createElement('option');
      optionEl.value = option.value;
      optionEl.textContent = option.label;
      if (option.value === node.operator) {
        optionEl.selected = true;
      }
      operatorSelect.appendChild(optionEl);
    });

    const valueInput = document.createElement('input');
    valueInput.type = 'text';
    valueInput.className = 'selector-rule__value';
    valueInput.autocomplete = 'off';
    valueInput.value = node.value ?? '';

    const updatePlaceholder = () => {
      if (operatorSelect.value === 'regex') {
        valueInput.placeholder = 'Regex pattern';
      } else if (operatorSelect.value === 'greater' || operatorSelect.value === 'less') {
        valueInput.placeholder = 'Numeric value';
      } else {
        valueInput.placeholder = 'Value';
      }
    };

    updatePlaceholder();

    operatorSelect.addEventListener('change', () => {
      node.operator = operatorSelect.value;
      updatePlaceholder();
    });

    valueInput.addEventListener('input', () => {
      node.value = valueInput.value;
    });

    fieldWrapper.appendChild(operatorSelect);
    fieldWrapper.appendChild(valueInput);
    row.appendChild(fieldWrapper);

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'icon-button selector-rule__remove';
    removeButton.innerHTML = '&times;';
    removeButton.setAttribute('aria-label', 'Remove rule');
    removeButton.addEventListener('click', () => {
      parentGroup.children = parentGroup.children.filter((child) => child.id !== node.id);
      renderSelectorBuilder(modal);
    });
    row.appendChild(removeButton);

    return row;
  }

  function buildGroup(node, { isRoot = false } = {}) {
    const wrapper = document.createElement('div');
    wrapper.className = `selector-group__container${isRoot ? ' selector-group__container--root' : ''}`;
    wrapper.dataset.selectorNodeId = node.id;

    const header = document.createElement('div');
    header.className = 'selector-group__header';

    const label = document.createElement('label');
    label.className = 'selector-group__matches-label';
    label.textContent = 'Matches';

    const selectEl = document.createElement('select');
    selectEl.className = 'selector-group__matches';
    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = 'ALL (AND)';
    if (node.mode !== 'any') {
      allOption.selected = true;
    }
    selectEl.appendChild(allOption);

    const anyOption = document.createElement('option');
    anyOption.value = 'any';
    anyOption.textContent = 'ANY (OR)';
    if (node.mode === 'any') {
      anyOption.selected = true;
    }
    selectEl.appendChild(anyOption);

    selectEl.addEventListener('change', () => {
      node.mode = selectEl.value === 'any' ? 'any' : 'all';
    });

    label.appendChild(selectEl);
    header.appendChild(label);

    if (!isRoot) {
      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'icon-button selector-group__remove';
      removeButton.innerHTML = '&times;';
      removeButton.setAttribute('aria-label', 'Remove group');
      removeButton.addEventListener('click', () => {
        const parent = findParentGroup(state.groupSelector.editor.data, node.id);
        if (!parent) {
          return;
        }
        parent.children = parent.children.filter((child) => child.id !== node.id);
        renderSelectorBuilder(modal);
      });
      header.appendChild(removeButton);
    }

    wrapper.appendChild(header);

    const childrenContainer = document.createElement('div');
    childrenContainer.className = 'selector-group__children';
    (Array.isArray(node.children) ? node.children : []).forEach((child) => {
      if (child.type === 'group') {
        childrenContainer.appendChild(buildGroup(child));
      } else {
        childrenContainer.appendChild(buildRule(child, node));
      }
    });
    wrapper.appendChild(childrenContainer);

    const actions = document.createElement('div');
    actions.className = 'selector-group__actions';

    const addRuleButton = document.createElement('button');
    addRuleButton.type = 'button';
    addRuleButton.className = 'button button--ghost selector-group__action';
    addRuleButton.textContent = 'Add rule';
    addRuleButton.addEventListener('click', () => {
      node.children.push(createSelectorRule({}));
      renderSelectorBuilder(modal);
    });
    actions.appendChild(addRuleButton);

    const addGroupButton = document.createElement('button');
    addGroupButton.type = 'button';
    addGroupButton.className = 'button button--ghost selector-group__action';
    addGroupButton.textContent = 'Add group';
    addGroupButton.addEventListener('click', () => {
      node.children.push(createSelectorGroup({ mode: 'all', children: [] }));
      renderSelectorBuilder(modal);
    });
    actions.appendChild(addGroupButton);

    wrapper.appendChild(actions);

    return wrapper;
  }

  container.appendChild(buildGroup(rootNode, { isRoot: true }));
}

function openGroupSelectorEditor(root, { mode, entry, trigger } = {}) {
  const modal = state.groupSelector.editor.modal;
  if (!modal || state.groupSelector.editor.isOpen) {
    return;
  }

  state.groupSelector.editor.mode = mode === 'edit' ? 'edit' : 'create';
  state.groupSelector.editor.selectorId = entry?.id ?? null;
  state.groupSelector.editor.isOpen = true;
  state.groupSelector.editor.isSaving = false;
  state.groupSelector.editor.trigger = trigger || null;
  state.groupSelector.editor.error = null;

  const titleEl = modal.querySelector('#group-selector-modal-title');
  if (titleEl) {
    titleEl.textContent = state.groupSelector.editor.mode === 'edit'
      ? 'Edit Asset Selector'
      : 'Create Asset Selector';
  }

  const nameInput = select(modal, '[data-group-selector-name]');
  const descriptionInput = select(modal, '[data-group-selector-description]');
  if (nameInput) {
    nameInput.value = entry?.name || '';
  }
  if (descriptionInput) {
    descriptionInput.value = entry?.description || '';
  }

  state.groupSelector.editor.data = hydrateSelectorTree(entry?.definition);
  renderSelectorBuilder(modal);
  resetSelectorFormError(modal);

  const saveButton = select(modal, '[data-save-group-selector]');
  if (saveButton) {
    saveButton.disabled = false;
    delete saveButton.dataset.loading;
  }

  modal.hidden = false;
  modal.setAttribute('aria-hidden', 'false');
  if (!modal.hasAttribute('tabindex')) {
    modal.setAttribute('tabindex', '-1');
  }
  modal.focus?.();
  structureModalOpenCount += 1;
  lockBodyScroll();
  nameInput?.focus();
}

function closeGroupSelectorEditor(root, { focusTrigger = true } = {}) {
  const modal = state.groupSelector.editor.modal;
  if (!modal || !state.groupSelector.editor.isOpen) {
    return;
  }

  const saveButton = select(modal, '[data-save-group-selector]');
  if (saveButton) {
    saveButton.disabled = false;
    delete saveButton.dataset.loading;
  }

  resetSelectorFormError(modal);
  const form = select(modal, '[data-group-selector-form]');
  form?.reset();

  modal.hidden = true;
  modal.setAttribute('aria-hidden', 'true');
  state.groupSelector.editor.isOpen = false;
  state.groupSelector.editor.isSaving = false;
  state.groupSelector.editor.selectorId = null;
  state.groupSelector.editor.data = null;

  structureModalOpenCount = Math.max(0, structureModalOpenCount - 1);
  unlockBodyScrollIfIdle();

  const trigger = state.groupSelector.editor.trigger;
  state.groupSelector.editor.trigger = null;
  if (focusTrigger && trigger && typeof trigger.focus === 'function') {
    trigger.focus();
  }
}

function getGroupSlug(root) {
  const slug = typeof root?.dataset?.groupSlug === 'string' ? root.dataset.groupSlug.trim() : '';
  return slug;
}

async function handleSelectorFormSubmit(root, event) {
  event.preventDefault();
  if (state.groupSelector.editor.isSaving) {
    return;
  }

  const modal = state.groupSelector.editor.modal;
  if (!modal) {
    return;
  }

  const nameInput = select(modal, '[data-group-selector-name]');
  const descriptionInput = select(modal, '[data-group-selector-description]');
  const errorEl = select(modal, '[data-group-selector-form-error]');
  const saveButton = select(modal, '[data-save-group-selector]');

  const name = nameInput?.value?.trim() ?? '';
  if (!name) {
    if (errorEl) {
      errorEl.hidden = false;
      errorEl.textContent = 'Please provide a title for the asset selector.';
    }
    nameInput?.focus();
    return;
  }

  const definition = serialiseSelectorNode(state.groupSelector.editor.data) || {
    type: 'group',
    mode: 'all',
    children: []
  };

  const payload = {
    name,
    description: descriptionInput?.value?.trim() ?? '',
    definition
  };

  state.groupSelector.editor.isSaving = true;
  state.groupSelector.editor.error = null;
  if (errorEl) {
    errorEl.hidden = true;
    errorEl.textContent = '';
  }
  if (saveButton) {
    saveButton.disabled = true;
    saveButton.dataset.loading = 'true';
  }

  const groupSlug = getGroupSlug(root);
  if (!groupSlug) {
    return;
  }

  const method = state.groupSelector.editor.mode === 'edit' ? 'PUT' : 'POST';
  const url = state.groupSelector.editor.mode === 'edit'
    ? API.groupAssetSelector(groupSlug, state.groupSelector.editor.selectorId)
    : API.groupAssetSelectors(groupSlug);

  try {
    const response = await fetchJson(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const selectors = Array.isArray(state.groupSelector.selectors)
      ? state.groupSelector.selectors.slice()
      : [];

    if (state.groupSelector.editor.mode === 'edit') {
      const index = selectors.findIndex((item) => item?.id === response?.id);
      if (index === -1) {
        selectors.push(response);
      } else {
        selectors[index] = response;
      }
      showToast('Asset selector updated.');
    } else {
      selectors.push(response);
      showToast('Asset selector created.');
    }

    state.groupSelector.selectors = sortSelectorEntries(selectors);
    renderGroupSelectorList(root);
    closeGroupSelectorEditor(root);
  } catch (error) {
    const message =
      error?.payload?.error || error?.message || 'Asset selector could not be saved.';
    state.groupSelector.editor.error = message;
    if (errorEl) {
      errorEl.hidden = false;
      errorEl.textContent = message;
    }
  } finally {
    state.groupSelector.editor.isSaving = false;
    if (saveButton) {
      saveButton.disabled = false;
      delete saveButton.dataset.loading;
    }
  }
}

function formatSelectorCellValue(value) {
  if (value === undefined || value === null || value === '') {
    return '—';
  }
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  if (typeof value === 'object') {
    return Object.values(value)
      .map((entry) => (entry === undefined || entry === null ? '' : String(entry)))
      .filter((entry) => entry)
      .join(', ') || '—';
  }
  return String(value);
}

function renderSelectorAssetsContent() {
  const modal = state.groupSelector.viewer.modal;
  if (!modal) {
    return;
  }
  const loadingEl = select(modal, '[data-group-selector-assets-loading]');
  const errorEl = select(modal, '[data-group-selector-assets-error]');
  const tableContainer = select(modal, '[data-group-selector-assets-table]');

  if (loadingEl) {
    loadingEl.hidden = !state.groupSelector.viewer.isLoading;
  }
  if (errorEl) {
    if (state.groupSelector.viewer.error) {
      errorEl.hidden = false;
      errorEl.textContent = state.groupSelector.viewer.error;
    } else {
      errorEl.hidden = true;
      errorEl.textContent = '';
    }
  }
  if (!tableContainer) {
    return;
  }

  if (state.groupSelector.viewer.isLoading || state.groupSelector.viewer.error) {
    tableContainer.hidden = true;
    tableContainer.innerHTML = '';
    return;
  }

  const rows = Array.isArray(state.groupSelector.viewer.rows) ? state.groupSelector.viewer.rows : [];
  const columns = Array.isArray(state.groupSelector.viewer.columns)
    ? state.groupSelector.viewer.columns
    : [];

  tableContainer.hidden = false;
  tableContainer.innerHTML = '';

  if (!rows.length) {
    const emptyState = document.createElement('p');
    emptyState.className = 'empty-state';
    emptyState.textContent = 'No assets were found for this selector.';
    tableContainer.appendChild(emptyState);
    return;
  }

  const table = document.createElement('table');
  table.className = 'selector-assets-table';

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  const headers = [
    { key: '__id', label: 'Asset-ID' },
    { key: '__source', label: 'Quelle' },
    ...columns.map((field) => ({ key: field, label: field }))
  ];

  headers.forEach((col) => {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = col.label;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  rows.forEach((row) => {
    const tr = document.createElement('tr');
    headers.forEach((col) => {
      const td = document.createElement('td');
      let value = '';
      if (col.key === '__id') {
        value = row?.id;
      } else if (col.key === '__source') {
        value = row?.rawTableTitle || '';
      } else {
        const assetValue = row?.values?.[col.key];
        value = assetValue !== undefined ? assetValue : row?.[col.key];
      }
      td.textContent = formatSelectorCellValue(value);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  tableContainer.appendChild(table);
}

async function openGroupSelectorAssetsModal(root, entry, trigger) {
  const modal = state.groupSelector.viewer.modal;
  if (!modal || state.groupSelector.viewer.isOpen) {
    return;
  }

  state.groupSelector.viewer.isOpen = true;
  state.groupSelector.viewer.selectorId = entry?.id ?? null;
  state.groupSelector.viewer.isLoading = true;
  state.groupSelector.viewer.error = null;
  state.groupSelector.viewer.columns = [];
  state.groupSelector.viewer.rows = [];
  state.groupSelector.viewer.trigger = trigger || null;

  const titleEl = modal.querySelector('#group-selector-assets-title');
  if (titleEl) {
    titleEl.textContent = entry?.name ? `Assets for “${entry.name}”` : 'Show Assets';
  }

  renderSelectorAssetsContent();

  modal.hidden = false;
  modal.setAttribute('aria-hidden', 'false');
  if (!modal.hasAttribute('tabindex')) {
    modal.setAttribute('tabindex', '-1');
  }
  modal.focus?.();
  structureModalOpenCount += 1;
  lockBodyScroll();

  const groupSlug = getGroupSlug(root);
  if (!groupSlug || !entry?.id) {
    state.groupSelector.viewer.isLoading = false;
    state.groupSelector.viewer.error = 'Asset selector could not be loaded.';
    renderSelectorAssetsContent();
    return;
  }

  try {
    const response = await fetchJson(API.groupAssetSelectorAssets(groupSlug, entry.id));
    state.groupSelector.viewer.columns = Array.isArray(response?.columns) ? response.columns : [];
    state.groupSelector.viewer.rows = Array.isArray(response?.rows) ? response.rows : [];
  } catch (error) {
    state.groupSelector.viewer.error =
      error?.payload?.error || error?.message || 'Assets could not be loaded.';
  } finally {
    state.groupSelector.viewer.isLoading = false;
    renderSelectorAssetsContent();
  }
}

function closeGroupSelectorAssetsModal({ restoreFocus = true } = {}) {
  const modal = state.groupSelector.viewer.modal;
  if (!modal || !state.groupSelector.viewer.isOpen) {
    return;
  }
  modal.hidden = true;
  modal.setAttribute('aria-hidden', 'true');
  state.groupSelector.viewer.isOpen = false;
  state.groupSelector.viewer.isLoading = false;
  state.groupSelector.viewer.selectorId = null;
  state.groupSelector.viewer.error = null;
  state.groupSelector.viewer.columns = [];
  state.groupSelector.viewer.rows = [];
  renderSelectorAssetsContent();

  structureModalOpenCount = Math.max(0, structureModalOpenCount - 1);
  unlockBodyScrollIfIdle();

  const trigger = state.groupSelector.viewer.trigger;
  state.groupSelector.viewer.trigger = null;
  if (restoreFocus && trigger && typeof trigger.focus === 'function') {
    trigger.focus();
  }
}

function setupGroupSelectorEditor(root) {
  const modal = state.groupSelector.editor.modal;
  if (!modal) {
    return;
  }
  const form = select(modal, '[data-group-selector-form]');
  const closeButtons = selectAll(modal, '[data-close-group-selector-modal]');

  form?.addEventListener('submit', (event) => handleSelectorFormSubmit(root, event));

  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      closeGroupSelectorEditor(root);
    }
  });

  closeButtons.forEach((button) => {
    button.addEventListener('click', () => closeGroupSelectorEditor(root));
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.groupSelector.editor.isOpen) {
      event.preventDefault();
      closeGroupSelectorEditor(root);
    }
  });
}

function setupGroupSelectorAssetsModal(root) {
  const modal = state.groupSelector.viewer.modal;
  if (!modal) {
    return;
  }
  const closeButtons = selectAll(modal, '[data-close-group-selector-assets-modal]');

  closeButtons.forEach((button) => {
    button.addEventListener('click', () => closeGroupSelectorAssetsModal());
  });

  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      closeGroupSelectorAssetsModal();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.groupSelector.viewer.isOpen) {
      event.preventDefault();
      closeGroupSelectorAssetsModal();
    }
  });
}

function setupGroupSelectorInterface(root) {
  if (!root) {
    return;
  }

  state.groupSelector.editor.modal = document.querySelector('[data-group-selector-modal]');
  state.groupSelector.viewer.modal = document.querySelector('[data-group-selector-assets-modal]');

  const overview = readInitialGroupSelectorState();
  applyGroupSelectorOverview(root, overview);

  const trigger = select(root, '[data-open-group-selector-modal]');
  if (trigger) {
    trigger.addEventListener('click', () => openGroupSelectorEditor(root, { mode: 'create', trigger }));
  }

  setupGroupSelectorEditor(root);
  setupGroupSelectorAssetsModal(root);
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

function getMeasureHeaders() {
  const configured = Array.isArray(measuresState.headers)
    ? measuresState.headers.filter((header) => typeof header === 'string' && header.trim())
    : [];
  if (configured.length) {
    return configured;
  }
  const entries = Array.isArray(measuresState.entries) ? measuresState.entries : [];
  const dynamic = new Set();
  entries.forEach((entry) => {
    Object.keys(entry || {}).forEach((key) => {
      if (key !== 'id') {
        dynamic.add(key);
      }
    });
  });
  return Array.from(dynamic);
}

function createMeasureRow(entry, headers) {
  const row = document.createElement('tr');
  headers.forEach((headerKey) => {
    const cell = document.createElement('td');
    cell.className = 'measure-table__cell measure-table__cell--wrap';
    if (headerKey === 'id') {
      cell.textContent = safeMeasureValue(entry.id);
    } else {
      cell.textContent = safeMeasureValue(entry?.[headerKey]);
    }
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
  if (!version || !version.uploadedAt) {
    metaEl.textContent = 'Es wurde noch keine Maßnahmen-Version importiert.';
    return;
  }

  const parts = [];
  const formattedDate = formatMeasureDateTime(version.uploadedAt);
  if (formattedDate) {
    parts.push(`Version vom ${formattedDate}`);
  }

  const measureCount = Number.isFinite(Number(version.measureCount))
    ? Number(version.measureCount)
    : Array.isArray(measuresState.entries)
      ? measuresState.entries.length
      : 0;
  parts.push(`${measureCount} Maßnahme${measureCount === 1 ? '' : 'n'}`);

  if (version.sourceFileName) {
    parts.push(`Datei: ${version.sourceFileName}`);
  }

  if (version.uploadId) {
    parts.push(`Upload-ID: ${version.uploadId}`);
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
  const headers = ['id', ...getMeasureHeaders()];
  const table = container ? container.querySelector('table') : null;
  const tableHead = table ? table.querySelector('thead') : null;
  if (tableHead) {
    const headRow = document.createElement('tr');
    headers.forEach((header) => {
      const th = document.createElement('th');
      th.textContent = header === 'id' ? 'Hash' : header;
      headRow.appendChild(th);
    });
    tableHead.innerHTML = '';
    tableHead.appendChild(headRow);
  }
  if (tbody) {
    tbody.innerHTML = '';
    entries.forEach((entry) => {
      tbody.appendChild(createMeasureRow(entry, headers));
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
    measuresState.headers = Array.isArray(payload?.headers) ? payload.headers : [];
    measuresState.options = {
      topics: Array.isArray(payload?.filters?.topics) ? payload.filters.topics : [],
      subTopics: Array.isArray(payload?.filters?.subTopics) ? payload.filters.subTopics : [],
      categories: Array.isArray(payload?.filters?.categories) ? payload.filters.categories : []
    };
    measuresState.version = payload?.version || null;
  } catch (error) {
    measuresState.entries = [];
    measuresState.headers = [];
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

function initAssetStructureApp() {
  const root = document.querySelector('[data-app="asset-structure"]');
  if (!root) return;
  setupStructureModals(root);
  setupCreateCategoryForm(root);
  setupCreateGroupForm(root);
  setupDeleteGroupButton(root);
  setupGroupSelectorInterface(root);
  setupAssetSubCategoryDetails(root);
  setupGroupDetails(root);
}

async function initAssetPoolApp() {
  const root = document.querySelector('[data-app="asset-pool"]');
  if (!root) return;

  state.assetPoolView = root.dataset.view === 'manipulators'
    ? 'manipulators'
    : root.dataset.view === 'raw'
    ? 'raw'
    : 'overview';

  consumePendingToast();
  setupImportButtons(root);
  setupFieldManager(root);
  setupCloseModal();
  renderSidebar(root);
  setupAssetPoolNavigation(root);
  setupManipulatorInterface(root);
  syncAssetPoolNavigation(root);

  await refreshRawTables();
  await refreshAssetPool();
  refreshManipulators(root);

  if (state.assetPoolView === 'overview') {
    renderAssetPool(root);
  } else if (state.assetPoolView === 'manipulators') {
    renderManipulatorView(root);
  } else if (state.assetPoolView === 'raw') {
    setupEditMapping(root);
    setupArchiveRaw(root);
    renderRawTable(root);
  }
}

const REPORT_DEFAULT_DATA = {
  groups: [],
  totalAssets: 0,
  unmatchedCount: 0,
  generatedAt: null
};

function normalizeReportData(payload) {
  const base = payload && typeof payload === 'object' ? payload : {};
  const groups = Array.isArray(base.groups) ? base.groups : [];
  const normalizedGroups = groups
    .map((group) => {
      const slug = typeof group?.slug === 'string' ? group.slug : '';
      const title =
        typeof group?.title === 'string'
          ? group.title
          : typeof group?.name === 'string'
            ? group.name
            : slug || 'Unbekannte Gruppe';
      const assetCount = Number.isInteger(group?.assetCount) ? group.assetCount : 0;
      return { slug, title, assetCount };
    })
    .sort((a, b) => {
      const left = (a.title || '').toLowerCase();
      const right = (b.title || '').toLowerCase();
      return left.localeCompare(right, 'de', { sensitivity: 'base', numeric: true });
    });

  return {
    groups: normalizedGroups,
    totalAssets: Number.isInteger(base.totalAssets) ? base.totalAssets : 0,
    unmatchedCount: Number.isInteger(base.unmatchedCount) ? base.unmatchedCount : 0,
    generatedAt: typeof base.generatedAt === 'string' ? base.generatedAt : null
  };
}

function getInitialReportData(root) {
  const script = select(root, '[data-report-state]');
  if (!script) {
    return null;
  }
  try {
    return JSON.parse(script.textContent || '');
  } catch (err) {
    return null;
  }
}

function formatReportDate(value) {
  if (!value) {
    return '';
  }
  try {
    return new Intl.DateTimeFormat('de-DE', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(value));
  } catch (err) {
    return value;
  }
}

function renderReportsView(root) {
  const report = state.reports.report ? state.reports.report : REPORT_DEFAULT_DATA;
  const hasGroups = Array.isArray(report.groups) && report.groups.length > 0;
  const tableBody = select(root, '[data-report-groups]');
  if (tableBody) {
    tableBody.innerHTML = hasGroups
      ? report.groups
          .map(
            (group) => `
              <tr>
                <td>
                  <div class="reports-table-group">
                    <strong>${escapeHtml(group.title)}</strong>
                    <p class="helper-text">${escapeHtml(group.slug)}</p>
                  </div>
                </td>
                <td>${escapeHtml(String(group.assetCount ?? 0))}</td>
              </tr>
            `
          )
          .join('')
      : '';
  }

  const tableContainer = select(root, '[data-report-table]');
  if (tableContainer) {
    tableContainer.hidden = !hasGroups;
  }

  const emptyCard = select(root, '[data-report-empty]');
  if (emptyCard) {
    emptyCard.hidden = hasGroups;
  }

  const unmatchedEl = select(root, '[data-report-unmatched]');
  if (unmatchedEl) {
    unmatchedEl.textContent = String(report.unmatchedCount ?? 0);
  }

  const totalEl = select(root, '[data-report-total]');
  if (totalEl) {
    totalEl.textContent = String(report.totalAssets ?? 0);
  }

  const generatedEl = select(root, '[data-report-generated]');
  if (generatedEl) {
    if (report.generatedAt) {
      generatedEl.hidden = false;
      generatedEl.textContent = `Letzte Berechnung: ${formatReportDate(report.generatedAt)}`;
    } else {
      generatedEl.hidden = true;
    }
  }

  const errorEl = select(root, '[data-report-error]');
  if (errorEl) {
    if (state.reports.error) {
      errorEl.hidden = false;
      errorEl.textContent = state.reports.error;
    } else {
      errorEl.hidden = true;
      errorEl.textContent = '';
    }
  }

  const button = select(root, '[data-report-calc]');
  if (button) {
    if (state.reports.isCalculating) {
      button.disabled = true;
      button.textContent = 'Berechnen…';
    } else {
      button.disabled = false;
      button.textContent = 'Report berechnen';
    }
  }
}

async function handleCalculateReport(root) {
  if (state.reports.isCalculating) {
    return;
  }
  state.reports.isCalculating = true;
  state.reports.error = null;
  renderReportsView(root);
  try {
    const payload = await fetchJson(API.reportsCoverage, { method: 'POST' });
    state.reports.report = normalizeReportData(payload);
  } catch (error) {
    state.reports.error = error?.payload?.error || error.message;
  } finally {
    state.reports.isCalculating = false;
    renderReportsView(root);
  }
}

function initReportsApp() {
  const root = document.querySelector('[data-app="reports"]');
  if (!root) {
    return;
  }

  const initialData = getInitialReportData(root);
  state.reports.report = normalizeReportData(initialData);
  renderReportsView(root);

  const button = select(root, '[data-report-calc]');
  button?.addEventListener('click', () => handleCalculateReport(root));
}

document.addEventListener('DOMContentLoaded', () => {
  initAssetPoolApp();
  initAssetStructureApp();
  initMeasuresApp();
  initReportsApp();
});
