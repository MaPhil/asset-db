import express from 'express';
import exphbs from 'express-handlebars';
import bodyParser from 'body-parser';
import path from 'path';

import apiV1 from './api/v1/index.js';
import { store } from './lib/storage.js';
import { logger } from './lib/logger.js';
import { getAssetTypeSummary } from './lib/assetTypes.js';
import {
  getAvailableAssetTypesForGroup,
  listGroupAssetTypes
} from './lib/groupAssetTypes.js';

const app = express();

process.on('unhandledRejection', (reason) => {
  logger.error('Nicht behandelte Promise-Zurückweisung erkannt', { reason });
});

process.on('uncaughtException', (error) => {
  logger.error('Nicht abgefangene Ausnahme erkannt', error);
});

app.engine('hbs', exphbs.engine({
  extname: '.hbs',
  helpers: {
    eq: (a, b) => a === b,
    json: (context) => JSON.stringify(context)
  }
}));
app.set('view engine', 'hbs');
app.set('views', path.join(process.cwd(), 'views'));

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

const formatDateTime = (value) => {
  if (!value) {
    return null;
  }
  try {
  return new Intl.DateTimeFormat('de-DE', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(value));
  } catch (err) {
    logger.warn('Datumsformatierung fehlgeschlagen', { value, err });
    return null;
  }
};

app.get('/asset-structure', (req, res) => {
  const categoriesRaw = store.get('categories').rows;

  const categories = categoriesRaw.map((category) => ({
    id: category.id,
    title: category.title || category.name || `Kategorie ${category.id}`,
    governingCategory: category.governing_category || '—',
    owner: category.owner || category.group_owner || '—',
    integrity: category.integrity || '—',
    availability: category.availability || '—',
    confidentiality: category.confidentiality || '—'
  }));

  res.render('asset-structure', {
    nav: 'assetStructure',
    categories
  });
});

app.get('/asset-types', (req, res) => {
  const summary = getAssetTypeSummary();

  res.render('asset-types', {
    nav: 'assetStructure',
    assetTypes: summary.entries,
    assetTypeField: summary.field
  });
});

app.get('/asset-structure/categories/:id', (req, res) => {
  const categoryId = Number(req.params.id);
  const categories = store.get('categories').rows;
  const category = categories.find((row) => row.id === categoryId);
  if (!category) {
    logger.warn('Kategorie für UI-Route nicht gefunden', { categoryId });
    return res.status(404).send('Kategorie nicht gefunden');
  }

  const links = store
    .get('group_categories')
    .rows.filter((row) => row.category_id === categoryId);
  const groups = store
    .get('groups')
    .rows.filter((group) => links.some((link) => link.group_id === group.id));

  const viewModel = {
    id: category.id,
    title: category.title || category.name || '',
    displayTitle: category.title || category.name || 'Unbenannte Kategorie',
    description: category.description || '',
    governingCategory: category.governing_category || '',
    owner: category.owner || category.group_owner || '',
    integrity: category.integrity || '',
    availability: category.availability || '',
    confidentiality: category.confidentiality || ''
  };

  const groupRows = groups.map((group) => ({
    id: group.id,
    title: group.title || `Gruppe ${group.id}`,
    status: group.status || '—',
    assetType: group.asset_type || '—',
    updatedAt: formatDateTime(group.updated_at) || '—'
  }));

  res.render('asset-structure-category', {
    nav: 'assetStructure',
    category: viewModel,
    groups: groupRows
  });
});

app.get('/asset-structure/categories/:categoryId/groups/:groupId', (req, res) => {
  const categoryId = Number(req.params.categoryId);
  const groupId = Number(req.params.groupId);

  const categories = store.get('categories').rows;
  const category = categories.find((row) => row.id === categoryId);
  if (!category) {
    logger.warn('Kategorie für Gruppen-UI-Route nicht gefunden', { categoryId, groupId });
    return res.status(404).send('Kategorie nicht gefunden');
  }

  const categoryOptions = categories
    .map((row) => ({
      id: row.id,
      title: row.title || row.name || `Kategorie ${row.id}`
    }))
    .sort((a, b) => a.title.localeCompare(b.title));

  const group = store
    .get('groups')
    .rows.find((row) => row.id === groupId);
  if (!group) {
    logger.warn('Gruppe für UI-Route nicht gefunden', { categoryId, groupId });
    return res.status(404).send('Gruppe nicht gefunden');
  }

  const detail = {
    id: group.id,
    title: group.title || '',
    displayTitle: group.title || 'Unbenannte Gruppe',
    description: group.description || '',
    status: group.status || '',
    assetType: group.asset_type || '',
    createdAt: formatDateTime(group.created_at) || '—',
    updatedAt: formatDateTime(group.updated_at) || '—'
  };

  const groupAssetTypes = listGroupAssetTypes(group.id);
  const availableGroupAssetTypes = getAvailableAssetTypesForGroup(group.id);

  res.render('asset-structure-group', {
    nav: 'assetStructure',
    category: {
      id: category.id,
      title: category.title || category.name || 'Unbenannte Kategorie'
    },
    group: detail,
    categoryOptions,
    groupAssetTypes,
    availableGroupAssetTypesCount: availableGroupAssetTypes.length
  });
});

app.get('/measures', (req, res) => {
  const assets = store.get('unified_assets').rows;
  const schema = store.get('schema').rows.map((row) => row.col_name);
  const sources = store.get('sources').rows;
  const sourceRows = store.get('source_rows').rows;

  const sourceRowCounts = sourceRows.reduce((acc, row) => {
    acc[row.source_id] = (acc[row.source_id] || 0) + 1;
    return acc;
  }, {});

  const metrics = [
    { label: 'Summe vereinheitlichter Assets', value: assets.length },
    { label: 'Schema-Spalten', value: schema.length },
    { label: 'Aktive Quellen', value: sources.length },
    { label: 'Übernommene Zeilen', value: sourceRows.length }
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
    nav: 'measures',
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

app.get('/measurements', (req, res) => res.redirect(302, '/measures'));

app.get('/assets', (req, res) => res.redirect('/asset-pool'));

app.get('/sources/:id', (req, res) => {
  const id = Number(req.params.id);
  const source = store.get('sources').rows.find((row) => row.id === id);
  if (!source) {
    logger.warn('Quelle für UI-Route nicht gefunden', { sourceId: id });
    return res.status(404).send('Quelle nicht gefunden');
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
