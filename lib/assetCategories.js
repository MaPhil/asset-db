import { store } from './storage.js';
import { slugify } from './assetStructure.js';

const CATEGORY_TABLE = 'asset_categories';

const normaliseDecision = (value) => (value === 'ignore' ? 'ignore' : 'use');

const normaliseSlug = (value) => {
  if (value === undefined || value === null) {
    return '';
  }
  const text = typeof value === 'string' ? value : String(value);
  const trimmed = text.trim();
  if (!trimmed) {
    return '';
  }
  return slugify(trimmed) || trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-');
};

const getCategoryRows = () => {
  const table = store.get(CATEGORY_TABLE);
  return Array.isArray(table?.rows) ? table.rows : [];
};

const collectCategoryValues = (row) => {
  if (!row || typeof row !== 'object') {
    return [];
  }
  const values = [];
  const pushValue = (value) => {
    if (value === undefined || value === null) {
      return;
    }
    values.push(value);
  };

  if (Array.isArray(row.asset_sub_category_slugs)) {
    row.asset_sub_category_slugs.forEach(pushValue);
  } else if (row.asset_sub_category_slug) {
    pushValue(row.asset_sub_category_slug);
  }

  if (Array.isArray(row.asset_sub_category_ids)) {
    row.asset_sub_category_ids.forEach(pushValue);
  } else if (row.asset_sub_category_id) {
    pushValue(row.asset_sub_category_id);
  }

  if (row.asset_sub_category) {
    pushValue(row.asset_sub_category);
  }

  return values;
};

const getAssetSubCategorySlugsForCategory = (row) => {
  return collectCategoryValues(row)
    .map((value) => normaliseSlug(value))
    .filter((value, index, array) => value && array.indexOf(value) === index);
};

export const getIgnoredAssetSubCategorySlugs = () => {
  const categories = getCategoryRows();
  const ignoredAssetSubCategorySlugs = new Set();

  categories.forEach((row) => {
    if (normaliseDecision(row?.decision) === 'ignore') {
      getAssetSubCategorySlugsForCategory(row).forEach((slug) => {
        ignoredAssetSubCategorySlugs.add(slug);
      });
    }
  });

  return ignoredAssetSubCategorySlugs;
};
