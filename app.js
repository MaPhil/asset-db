import express from 'express';
import bodyParser from 'body-parser';
import fs from 'fs';
import path from 'path';


import api from './api/index.js';
import { logger } from './lib/logger.js';

const app = express();

process.on('unhandledRejection', (reason) => {
  logger.error('Nicht behandelte Promise-Zurückweisung erkannt', { reason });
});

process.on('uncaughtException', (error) => {
  logger.error('Nicht abgefangene Ausnahme erkannt', error);
});

const publicPath = path.join(process.cwd(), 'public');
const distIndexPath = path.join(publicPath, 'dist', 'index.html');

app.use(express.static(publicPath));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use((req, res, next) => {
  const startedAt = Date.now();
  logger.debug('Eingehende Anfrage', {
    method: req.method,
    path: req.originalUrl,
    ip: req.ip
  });

  res.on('finish', () => {
    logger.info('Anfrage abgeschlossen', {
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt
    });
  });

  res.on('close', () => {
    if (!res.writableEnded) {
      logger.warn('Antwort vor Abschluss geschlossen', {
        method: req.method,
        path: req.originalUrl
      });
    }
  });

  next();
});

// Mount API
app.use('/api', api);

// Serve SPA entry for non-API GET requests
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.method !== 'GET') {
    return next();
  }

  if (fs.existsSync(distIndexPath)) {
    return res.sendFile(distIndexPath);
  }

  logger.error('Frontend build not found at expected path', { distIndexPath });
  return res.status(404).send('Frontend build not found. Bitte `npm run client:build` ausführen.');
});

const PORT = process.env.PORT || 5678;
app.use((err, req, res, next) => {
  logger.error('Unbehandelter Fehler bei der Verarbeitung einer Anfrage', err, {
    method: req.method,
    path: req.originalUrl,
    body: req.body,
    query: req.query
  });

  if (res.headersSent) {
    return next(err);
  }

  const status = err.status && Number.isInteger(err.status) ? err.status : 500;
  const message = status >= 500 ? 'Interner Serverfehler' : err.message;
  res.status(status).json({ error: message });
});

app.listen(PORT, () => {
  logger.info(`Server hört auf http://localhost:${PORT}`);
});
