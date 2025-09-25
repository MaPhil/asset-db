import express from 'express';
import exphbs from 'express-handlebars';
import bodyParser from 'body-parser';
import path from 'path';

import apiV1 from './api/v1/index.js';
import { store } from './lib/storage.js';
import { logger } from './lib/logger.js';

const app = express();

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection detected', { reason });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception detected', error);
});

app.engine('hbs', exphbs.engine({
  extname: '.hbs',
  helpers: {
    eq: (a, b) => a === b,
    json: (context) => JSON.stringify(context, null, 2)
  }
}));
app.set('view engine', 'hbs');
app.set('views', path.join(process.cwd(), 'views'));

app.use(express.static(path.join(process.cwd(), 'public')));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use((req, res, next) => {
  const startedAt = Date.now();
  logger.debug('Incoming request', {
    method: req.method,
    path: req.originalUrl,
    ip: req.ip
  });

  res.on('finish', () => {
    logger.info('Request completed', {
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt
    });
  });

  res.on('close', () => {
    if (!res.writableEnded) {
      logger.warn('Response closed before completion', {
        method: req.method,
        path: req.originalUrl
      });
    }
  });

  next();
});

// Mount API v1
app.use('/api/v1', apiV1);

// UI routes (read-only bootstrap)
app.get('/', (req, res) => res.redirect('/asset-pool'));

app.get('/asset-pool', (req, res) => {
  res.render('asset-pool', {
    nav: 'assetPool'
  });
});

app.get('/asset-pool/raw/:id', (req, res) => {
  const rawTableId = Number(req.params.id);
  const rawTable = store.get('raw_tables').rows.find((row) => row.id === rawTableId);
  const status = rawTable ? 200 : 404;
  const hasRows =
    rawTable && store.get('raw_rows').rows.some((row) => row.raw_table_id === rawTableId);

  res.status(status).render('raw-table', {
    nav: 'assetPool',
    rawTableId,
    rawTableTitle: rawTable?.title || null,
    missing: !rawTable,
    hasRows: Boolean(hasRows)
  });
});

app.get('/asset-structure', (req, res) => {
  const schema = store.get('schema').rows.map((row) => row.col_name);
  const sources = store.get('sources').rows;
  res.render('asset-structure', {
    nav: 'assetStructure',
    schema,
    sources
  });
});

app.get('/measurements', (req, res) => {
  const assets = store.get('unified_assets').rows;
  const schema = store.get('schema').rows.map((row) => row.col_name);
  const sources = store.get('sources').rows;
  const sourceRows = store.get('source_rows').rows;

  const sourceRowCounts = sourceRows.reduce((acc, row) => {
    acc[row.source_id] = (acc[row.source_id] || 0) + 1;
    return acc;
  }, {});

  const metrics = [
    { label: 'Total unified assets', value: assets.length },
    { label: 'Schema columns', value: schema.length },
    { label: 'Active sources', value: sources.length },
    { label: 'Rows ingested', value: sourceRows.length }
  ];

  const latestUpdate = sources
    .map((source) => source.updated_at)
    .filter(Boolean)
    .sort()
    .pop();

  const sourceMetrics = sources.map((source) => ({
    id: source.id,
    name: source.name,
    totalRows: sourceRowCounts[source.id] || 0
  }));

  res.render('measurements', {
    nav: 'measurements',
    metrics,
    sourceMetrics,
    latestUpdate
  });
});

app.get('/implementation', (req, res) => {
  res.render('implementation', {
    nav: 'implementation'
  });
});

app.get('/assets', (req, res) => res.redirect('/asset-pool'));

app.get('/sources/:id', (req, res) => {
  const id = Number(req.params.id);
  const source = store.get('sources').rows.find((row) => row.id === id);
  if (!source) {
    logger.warn('Source not found for UI route', { sourceId: id });
    return res.status(404).send('Source not found');
  }

  const rows = store
    .get('source_rows')
    .rows.filter((row) => row.source_id === id)
    .sort((a, b) => a.row_index - b.row_index)
    .map((row) => row.data);
  const headers = rows[0] ? Object.keys(rows[0]) : [];

  res.render('assets/source', {
    nav: 'assetStructure',
    source,
    rows,
    headers
  });
});

const PORT = process.env.PORT || 5678;
app.use((err, req, res, next) => {
  logger.error('Unhandled error while processing request', err, {
    method: req.method,
    path: req.originalUrl,
    body: req.body,
    query: req.query
  });

  if (res.headersSent) {
    return next(err);
  }

  const status = err.status && Number.isInteger(err.status) ? err.status : 500;
  const message = status >= 500 ? 'Internal server error' : err.message;
  res.status(status).json({ error: message });
});

app.listen(PORT, () => {
  logger.info(`Server listening at http://localhost:${PORT}`);
});
