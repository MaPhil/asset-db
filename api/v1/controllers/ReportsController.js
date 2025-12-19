import { logger } from '../../../lib/logger.js';
import { generateCoverageReport, readCoverageReport } from '../../../lib/reports.js';
import { getAssetRowsByIds } from '../../../lib/assetPool.js';
import { buildAssetRowValues } from '../../../lib/assetRowUtils.js';

export const ReportsController = {
  async fetchAbdeckungReport(req, res) {
    try {
      const report = readCoverageReport();
      res.json(report);
    } catch (error) {
      logger.error('Coverage report could not be loaded', error);
      res.status(500).json({ error: 'Report konnte nicht geladen werden.' });
    }
  },
  async fetchAbdeckungUnmatched(req, res) {
    try {
      const report = readCoverageReport();
      const unmatchedAssets = Array.isArray(report.unmatchedAssets) ? report.unmatchedAssets : [];
      const unmatchedColumns = Array.isArray(report.unmatchedColumns) ? report.unmatchedColumns : [];
      const assetMap = new Map();
      unmatchedAssets.forEach((asset) => {
        const assetId = asset?.id;
        if (!assetId) {
          return;
        }
        const normalizedId = String(assetId);
        if (!assetMap.has(normalizedId)) {
          assetMap.set(normalizedId, asset);
        }
      });

      const ids = Array.from(assetMap.keys());
      const assetRows = getAssetRowsByIds(ids);
      const rowsById = new Map(assetRows.map((row) => [String(row?.id ?? ''), row]));

      const assets = ids
        .map((id) => {
          const normalizedId = String(id);
          if (!normalizedId) {
            return null;
          }
          const row = rowsById.get(normalizedId);
          const reportEntry = assetMap.get(normalizedId);
          const values =
            row && typeof row === 'object'
              ? buildAssetRowValues(row)
              : reportEntry?.values && typeof reportEntry.values === 'object'
                ? reportEntry.values
                : {};
          const keys =
            Array.isArray(reportEntry?.keys) && reportEntry.keys.length
              ? reportEntry.keys
              : Object.keys(values);
          const rowIndex =
            typeof row?.rowIndex === 'number'
              ? row.rowIndex
              : typeof reportEntry?.rowIndex === 'number'
                ? reportEntry.rowIndex
                : null;
          return {
            id: normalizedId,
            rawTableTitle: row?.rawTableTitle ?? reportEntry?.rawTableTitle ?? '',
            rowKey: row?.rowKey ?? reportEntry?.rowKey ?? '',
            rowIndex,
            values,
            keys
          };
        })
        .filter(Boolean);

      const columnSet = new Set(unmatchedColumns);
      assets.forEach((asset) => {
        (asset.keys || []).forEach((key) => {
          if (key) {
            columnSet.add(key);
          }
        });
      });

      res.json({
        assets,
        columns: Array.from(columnSet),
        totalAssets: Number.isInteger(report.totalAssets) ? report.totalAssets : 0
      });
    } catch (error) {
      logger.error('Coverage report unmatched assets could not be loaded', error);
      res.status(500).json({ error: 'Assets ohne Gruppenzuordnung konnten nicht geladen werden.' });
    }
  },
  async calculateAbdeckungReport(req, res) {
    try {
      const report = generateCoverageReport();
      res.json(report);
    } catch (error) {
      logger.error('Coverage report could not be generated', error);
      res.status(500).json({ error: 'Report konnte nicht berechnet werden.' });
    }
  }
};
