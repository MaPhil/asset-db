import { calculateGroupAssetCoverage, calculateGroupSelectors } from './groupAssetSelectors.js';
import { calculateManipulators } from './manipulators.js';
import { REPORTS_ABDECKUNG_FILE, readJsonFile, writeJsonFile } from './storage.js';

const DEFAULT_COVERAGE_REPORT = {
  generatedAt: null,
  totalAssets: 0,
  unmatchedCount: 0,
  groups: [],
  unmatchedColumns: []
};

const normalizeGroup = (group) => {
  const slug = typeof group?.slug === 'string' ? group.slug : '';
  const title =
    typeof group?.title === 'string'
      ? group.title
      : typeof group?.name === 'string'
        ? group.name
        : slug || 'Unbekannte Gruppe';
  const assetCount = Number.isInteger(group?.assetCount) ? group.assetCount : 0;
  return { slug, title, assetCount };
};

const sortGroups = (groups) =>
  [...groups].sort((a, b) => {
    const left = (a?.title || '').toLowerCase();
    const right = (b?.title || '').toLowerCase();
    return left.localeCompare(right, 'de', { sensitivity: 'base', numeric: true });
  });

const buildReportPayload = (payload) => {
  const base = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  return {
    generatedAt: typeof base.generatedAt === 'string' ? base.generatedAt : null,
    totalAssets: Number.isInteger(base.totalAssets) ? base.totalAssets : 0,
    unmatchedCount: Number.isInteger(base.unmatchedCount) ? base.unmatchedCount : 0,
    groups: sortGroups((Array.isArray(base.groups) ? base.groups : []).map(normalizeGroup)),
    unmatchedAssets: Array.isArray(base.unmatchedAssets) ? base.unmatchedAssets : [],
    unmatchedColumns: Array.isArray(base.unmatchedColumns) ? base.unmatchedColumns : []
  };
};

export function readCoverageReport() {
  const payload = readJsonFile(REPORTS_ABDECKUNG_FILE, DEFAULT_COVERAGE_REPORT);
  return buildReportPayload(payload);
}

export function writeCoverageReport(report) {
  const payload = buildReportPayload(report);
  writeJsonFile(REPORTS_ABDECKUNG_FILE, payload);
  return payload;
}

export function generateCoverageReport() {
  calculateManipulators();
  calculateGroupSelectors();
  const coverage = calculateGroupAssetCoverage();
  return writeCoverageReport({
    generatedAt: new Date().toISOString(),
    totalAssets: coverage.totalAssets ?? 0,
    unmatchedCount: coverage.unmatchedCount ?? 0,
    groups: coverage.groups || [],
    unmatchedAssets: coverage.unmatchedAssets || [],
    unmatchedColumns: coverage.unmatchedColumns || []
  });
}
