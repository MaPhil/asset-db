import express from 'express';
import exphbs from 'express-handlebars';
import bodyParser from 'body-parser';
import path from 'path';


import api from './api/index.js';
import { logger } from './lib/logger.js';
import viewRoutes from './views/routes/index.js';

const app = express();

process.on('unhandledRejection', (reason) => {
  logger.error('Nicht behandelte Promise-Zurückweisung erkannt', { reason });
});

process.on('uncaughtException', (error) => {
  logger.error('Nicht abgefangene Ausnahme erkannt', error);
});

const templatesPath = path.join(process.cwd(), 'views', 'templates');

app.engine(
  'hbs',
  exphbs.engine({
    extname: '.hbs',
    layoutsDir: path.join(templatesPath, 'layouts'),
    partialsDir: path.join(templatesPath, 'partials'),
    helpers: {
      eq: (a, b) => a === b,
      json: (context) => JSON.stringify(context)
    }
  })
);
app.set('view engine', 'hbs');
app.set('views', templatesPath);

app.use(express.static(path.join(process.cwd(), 'public')));
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

// UI routes
app.use('/', viewRoutes);

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
