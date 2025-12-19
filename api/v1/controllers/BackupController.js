import archiver from 'archiver';

import { logger } from '../../../lib/logger.js';
import { STORAGE_DIR } from '../../../lib/storage.js';

const formatTimestampForFilename = (date = new Date()) =>
  date.toISOString().replace(/[:.]/g, '-');

export const BackupController = {
  download(_req, res) {
    const timestamp = formatTimestampForFilename();
    const filename = `storage-backup-${timestamp}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('warning', (warning) => {
      if (warning.code === 'ENOENT') {
        logger.warn('Backup archive warning', warning);
        return;
      }
      logger.error('Backup archive warning escalated', warning);
    });
    archive.on('error', (error) => {
      logger.error('Backup could not be created', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Backup konnte nicht erstellt werden.' });
      } else {
        res.destroy(error);
      }
    });

    res.on('close', () => {
      archive.destroy();
    });

    archive.pipe(res);
    archive.directory(STORAGE_DIR, false);
    archive.finalize();
  }
};
