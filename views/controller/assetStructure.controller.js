import { store } from '../../lib/storage.js';
import { logger } from '../../lib/logger.js';
import { getAssetTypeSummary } from '../../lib/assetTypes.js';
import {
  getAvailableAssetTypesForGroup,
  listGroupAssetTypes
} from '../../lib/groupAssetTypes.js';

const formatDateTime = (value) => {
  if (!value) {
    return null;
  }

  try {
    return new Intl.DateTimeFormat('de-DE', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(value));
  } catch (err) {
    logger.warn('Datumsformatierung fehlgeschlagen', { value, err });
    return null;
  }
};

export const renderAssetStructure = (req, res) => {
  const categoriesRaw = store.get('categories').rows;

  const categories = categoriesRaw.map((category) => ({
    id: category.id,
    title: category.title || category.name || `Kategorie ${category.id}`,
    governingCategory: category.governing_category || '—',
    owner: category.owner || category.group_owner || '—',
    integrity: category.integrity || '—',
    availability: category.availability || '—',
    confidentiality: category.confidentiality || '—'
  }));

  res.render('asset-structure', {
    nav: 'assetStructure',
    categories
  });
};

export const renderAssetTypes = (req, res) => {
  const summary = getAssetTypeSummary();

  res.render('asset-types', {
    nav: 'assetStructure',
    assetTypes: summary.entries,
    assetTypeField: summary.field
  });
};

export const renderAssetStructureCategory = (req, res) => {
  const categoryId = Number(req.params.id);
  const categories = store.get('categories').rows;
  const category = categories.find((row) => row.id === categoryId);

  if (!category) {
    logger.warn('Kategorie für UI-Route nicht gefunden', { categoryId });
    return res.status(404).send('Kategorie nicht gefunden');
  }

  const links = store
    .get('group_categories')
    .rows.filter((row) => row.category_id === categoryId);
  const groups = store
    .get('groups')
    .rows.filter((group) => links.some((link) => link.group_id === group.id));

  const viewModel = {
    id: category.id,
    title: category.title || category.name || '',
    displayTitle: category.title || category.name || 'Unbenannte Kategorie',
    description: category.description || '',
    governingCategory: category.governing_category || '',
    owner: category.owner || category.group_owner || '',
    integrity: category.integrity || '',
    availability: category.availability || '',
    confidentiality: category.confidentiality || ''
  };

  const groupRows = groups.map((group) => ({
    id: group.id,
    title: group.title || `Gruppe ${group.id}`,
    status: group.status || '—',
    assetType: group.asset_type || '—',
    updatedAt: formatDateTime(group.updated_at) || '—'
  }));

  res.render('asset-structure-category', {
    nav: 'assetStructure',
    category: viewModel,
    groups: groupRows,
    groupCount: groupRows.length
  });
};

export const renderAssetStructureGroup = (req, res) => {
  const categoryId = Number(req.params.categoryId);
  const groupId = Number(req.params.groupId);

  const categories = store.get('categories').rows;
  const category = categories.find((row) => row.id === categoryId);

  if (!category) {
    logger.warn('Kategorie für Gruppen-UI-Route nicht gefunden', { categoryId, groupId });
    return res.status(404).send('Kategorie nicht gefunden');
  }

  const categoryOptions = categories
    .map((row) => ({
      id: row.id,
      title: row.title || row.name || `Kategorie ${row.id}`
    }))
    .sort((a, b) => a.title.localeCompare(b.title));

  const group = store
    .get('groups')
    .rows.find((row) => row.id === groupId);

  if (!group) {
    logger.warn('Gruppe für UI-Route nicht gefunden', { categoryId, groupId });
    return res.status(404).send('Gruppe nicht gefunden');
  }

  const detail = {
    id: group.id,
    title: group.title || '',
    displayTitle: group.title || 'Unbenannte Gruppe',
    description: group.description || '',
    status: group.status || '',
    assetType: group.asset_type || '',
    createdAt: formatDateTime(group.created_at) || '—',
    updatedAt: formatDateTime(group.updated_at) || '—'
  };

  const groupAssetTypes = listGroupAssetTypes(group.id);
  const availableGroupAssetTypes = getAvailableAssetTypesForGroup(group.id);

  res.render('asset-structure-group', {
    nav: 'assetStructure',
    category: {
      id: category.id,
      title: category.title || category.name || 'Unbenannte Kategorie'
    },
    group: detail,
    categoryOptions,
    groupAssetTypes,
    availableGroupAssetTypesCount: availableGroupAssetTypes.length,
    groupAssetTypeCount: groupAssetTypes.length
  });
};
