import { logger } from '../../../lib/logger.js';
import { generateCoverageReport, readCoverageReport } from '../../../lib/reports.js';

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
