import { store } from './storage.js';

const CATEGORY_TABLE = 'asset_categories';

const toPositiveInteger = (value) => {
  const num = Number(value);
  return Number.isInteger(num) && num > 0 ? num : null;
};

const getCategoryRows = () => {
  const table = store.get(CATEGORY_TABLE);
  return Array.isArray(table?.rows) ? table.rows : [];
};

const getAssetSubCategoryIdsForCategory = (row) => {
  if (!row || typeof row !== 'object') {
    return [];
  }
  const ids = Array.isArray(row.asset_sub_category_ids) ? row.asset_sub_category_ids : [];
  return ids
    .map((value) => toPositiveInteger(value))
    .filter((value, index, array) => value && array.indexOf(value) === index);
};

const normaliseDecision = (value) => (value === 'ignore' ? 'ignore' : 'use');

export const getIgnoredAssetSubCategoryIds = () => {
  const categories = getCategoryRows();
  const ignoredAssetSubCategoryIds = new Set();

  categories.forEach((row) => {
    const id = toPositiveInteger(row?.id);
    if (!id) {
      return;
    }

    if (normaliseDecision(row?.decision) === 'ignore') {
      getAssetSubCategoryIdsForCategory(row).forEach((assetSubCategoryId) => {
        ignoredAssetSubCategoryIds.add(assetSubCategoryId);
      });
    }
  });

  return ignoredAssetSubCategoryIds;
};
