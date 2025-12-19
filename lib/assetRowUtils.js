const ASSET_ROW_META_FIELDS = new Set([
  'id',
  'rawTableId',
  'rawTableTitle',
  'rowIndex',
  'rowKey',
  'values'
]);

export function buildAssetRowValues(row) {
  const result = {};
  if (!row || typeof row !== 'object') {
    return result;
  }
  Object.keys(row).forEach((key) => {
    if (ASSET_ROW_META_FIELDS.has(key)) {
      return;
    }
    result[key] = row[key];
  });
  return result;
}
