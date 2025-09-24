import express from 'express';
import exphbs from 'express-handlebars';
import bodyParser from 'body-parser';
import path from 'path';

import apiV1 from './api/v1/index.js';
import { store } from './lib/storage.js';

const app = express();

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

// Mount API v1
app.use('/api/v1', apiV1);

// UI routes (read-only bootstrap)
app.get('/', (req, res) => res.redirect('/assets'));

app.get('/assets', (req, res) => {
  const schema = store.get('schema').rows.map((row) => row.col_name);
  const assets = store.get('unified_assets').rows;
  const sources = store.get('sources').rows;
  res.render('assets/index', {
    nav: 'assets',
    schema,
    assets,
    sources
  });
});

app.get('/sources/:id', (req, res) => {
  const id = Number(req.params.id);
  const source = store.get('sources').rows.find((row) => row.id === id);
  if (!source) {
    return res.status(404).send('Source not found');
  }

  const rows = store
    .get('source_rows')
    .rows.filter((row) => row.source_id === id)
    .sort((a, b) => a.row_index - b.row_index)
    .map((row) => row.data);
  const headers = rows[0] ? Object.keys(rows[0]) : [];

  res.render('assets/source', {
    nav: 'assets',
    source,
    rows,
    headers
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening at http://localhost:${PORT}`);
});
