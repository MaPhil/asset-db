# Assets Inventory API + JSON Storage

This repository bootstraps a JSON-backed asset inventory service. It exposes a versioned REST API under `/api/v1` and keeps the existing Handlebars UI running on top of the same storage layer. The application avoids traditional databases by persisting data in structured JSON files on disk.

## Features

- **Versioned API** – all requests flow through `/api/v1/*`, organized by controller, middleware, and route folders with index files that re-export everything.
- **JSON persistence** – records are stored in `storage/*.json` files. Each file contains a `meta` section for sequencing plus the actual `rows` array.
- **Unified asset rebuild** – `lib/merge.js` exposes `rebuildUnified()` which regenerates the denormalized asset table whenever sources or mappings change.
- **Lightweight UI** – `views/` includes simple Handlebars templates for browsing sources and merged assets while the heavy lifting is handled by the API.

## Project layout

```
.
├─ api/
│  └─ v1/
│     ├─ controllers/        # Business logic per resource
│     ├─ middleware/         # Shared HTTP helpers
│     ├─ routes/             # Express routers grouped per resource
│     └─ index.js            # Mounts the v1 router
├─ app.js                    # Express bootstrapper + UI routes
├─ lib/
│  ├─ merge.js               # rebuildUnified() using JSON data
│  └─ storage.js             # Minimal JSON data access layer
├─ public/                   # Static assets (CSS/JS)
├─ storage/                  # JSON "database" files
├─ uploads/                  # Multer upload destination (gitignored)
├─ views/                    # Handlebars UI templates
└─ README.md
```

## Getting started

```bash
npm install
npm run dev
# visit http://localhost:3000
```

The development command uses `nodemon` for auto-restarts. Use `npm start` in production environments.

## Storage format

Every JSON file in `storage/` matches the following shape:

```json
{
  "meta": { "seq": 0, "updatedAt": "1970-01-01T00:00:00.000Z" },
  "rows": []
}
```

- `meta.seq` – last issued auto-incrementing identifier.
- `meta.updatedAt` – timestamp refreshed on each write.
- `rows` – plain objects representing table rows (e.g. sources, mappings, categories).

`lib/storage.js` provides helper methods: `get`, `set`, `insert`, `update`, `remove`, and `upsertSchemaCol`. Writes are performed atomically by writing to a temporary file then renaming it.

## API overview

| Resource | Description | Key endpoints |
|----------|-------------|---------------|
| Assets | View or rebuild the unified asset table | `GET /api/v1/assets`, `POST /api/v1/assets/rebuild` |
| Sources | Upload, inspect, or delete raw data sources | `POST /api/v1/sources/upload`, `GET /api/v1/sources/:id`, `DELETE /api/v1/sources/:id` |
| Mappings | Manage source→unified column mappings | `POST /api/v1/mappings/schema/add`, `POST /api/v1/mappings/save` |
| Categories | CRUD for risk categories | `GET /api/v1/categories`, `POST /api/v1/categories`, `GET/PUT /api/v1/categories/:id` |
| Groups | CRUD for asset groups and linking categories | `GET /api/v1/groups`, `POST /api/v1/groups`, `PUT /api/v1/groups/:id`, `POST /api/v1/groups/:id/link-category` |

All controllers live under `api/v1/controllers/` and are imported via the folder's `index.js`.

### Middleware

- `asyncHandler(fn)` – wraps async route handlers and forwards errors to Express.
- `validateId(param?)` – validates integer route params and returns `400` when invalid.

### Uploads

`POST /api/v1/sources/upload` expects multipart form data with a `file` field. Uploaded files are temporarily stored in `uploads/` and parsed with `xlsx`. Each row is captured in `storage/source_rows.json` and the schema is seeded with the first row's headers.

## UI routes

Although the API is preferred for new integrations, the bundled Handlebars UI offers:

- `/assets` – overview of schema, sources, and unified assets (with a rebuild button that calls the API).
- `/sources/:id` – quick preview of the stored rows for a given source.

The UI reads directly from the JSON storage through `store.get()` so it remains in sync with the API responses.

## Development checklist

1. Update or add controllers under `api/v1/controllers/`.
2. Export them via the corresponding `index.js` files (controller/middleware/routes).
3. Define or adjust routes under `api/v1/routes/`.
4. Persist changes with `store.*` helpers and call `rebuildUnified()` whenever unified data should be recomputed.
5. Document API additions here or in supplementary docs.

## License

MIT
