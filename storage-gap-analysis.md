# Storage Gap Analysis

## 1. Executive Summary

The current application storage architecture operates as a **pseudo-relational database** using flat JSON files managed through `lib/storage.js`. Data is normalized and split across multiple files (e.g., headers in one file, rows in another, mappings in a third).【F:lib/storage.js†L7-L90】【F:api/v1/controllers/RawTablesController.js†L89-L197】

The **Target Vision** requires a **document-oriented storage** approach for both assets and measures:
* **Assets:** Each uploaded Excel file becomes a self-contained `raw-asset-data` document stored under `storage/raw-assets` and stays there until a user explicitly archives it. Archiving moves the file to `storage/archived-raw-assets`, and all related asset IDs in the pool are marked `archived: true`. Meta data (`title`, `mapping` object) and raw rows start from the second spreadsheet row. A central `asset-pool.json` aggregates every asset by UUID/ID key and supports updates, archives, unarchive on ID reuse, and pagination-friendly access.
* **Measures:** Each Measures upload is hashed row-by-row; if a new upload with the same name arrives, the existing per-upload file is moved to `storage/measures/archived/` before the new file replaces it in `storage/measures/`. An **active** measures file holds current entries keyed by a hash derived from concatenating row values, while archived measure files live in the archive directory.

**Key Finding:** The current architecture is fundamentally incompatible with the Target Vision and requires a complete refactor of the storage layer (`lib/storage.js`), the raw upload controller (`api/v1/controllers/RawTablesController.js`), the asset pool utilities (`lib/assetPool.js`), and the measure ingestion/storage surfaces (`api/v1/controllers/MeasuresController.js`, `lib/assetStructure.js`).

---

## 2. Folder & File Layout Comparison

| Component | Current State (`lib/storage.js`) | Target Vision | Gap / Action |
| :--- | :--- | :--- | :--- |
| **Root Storage** | Auto-initializes 25+ table files directly under `storage/*.json` at runtime.【F:lib/storage.js†L7-L49】 | Keep `storage/` but stop creating unrelated table JSON files. | Remove table auto-creation once the new layout is in place. |
| **Active Raw Assets** | **Missing.** Raw uploads are split across `raw_tables.json`, `raw_rows.json`, and `raw_mappings.json`.【F:api/v1/controllers/RawTablesController.js†L142-L213】【F:api/v1/controllers/RawTablesController.js†L226-L275】 | `storage/raw-assets/{upload-id}.json` (one file per upload) that remains active until explicitly archived. | Create directory and change writes to per-upload JSON documents. |
| **Archived Raw Assets** | **Missing.** No archive directory or move logic. | `storage/archived-raw-assets/{upload-id}.json` created only after an explicit archive action that removes the file from `raw-assets`. | Add directory and move files upon archive while marking asset IDs archived in the pool. |
| **Asset Pool** | `unified_assets.json` referenced but not aligned with file-per-asset object store.【F:lib/storage.js†L8-L34】【F:lib/assetPool.js†L1-L205】 | `storage/asset-pool.json` as `{ assetId: { ... }, ... }` plus `archived` flag per asset. | Replace `unified_assets.json` usage with `asset-pool.json` and update consumers. |
| **Active Measures** | **Missing.** Measures are normalized across multiple tables (`measure_*`).【F:lib/storage.js†L27-L32】【F:api/v1/controllers/MeasuresController.js†L40-L174】 | Single active measure file (e.g., `storage/measures/active.json`) keyed by a hash of concatenated row values; one entry per spreadsheet row. New uploads replace existing per-upload files after the old one is archived. | Introduce active measure file and hash-keyed entries plus pre-replacement archival. |
| **Archived Measures** | **Missing.** No measure archive mechanism. | `storage/measures/archived/{upload-id}.json` holding hash-keyed rows for archived uploads when superseded or explicitly archived. | Add archive folder and move/archive logic for measure imports. |

---

## 3. Data Schema & Model Comparison

### A. Raw Asset Documents

**Current State (Normalized / Relational):**
Data is shredded across three separate files tied together by `raw_table_id` keys:
1.  `storage/raw_tables.json`: Upload metadata (title, filename, headers, options).【F:api/v1/controllers/RawTablesController.js†L178-L241】
2.  `storage/raw_rows.json`: Row content for all uploads (starting at the first data row).【F:api/v1/controllers/RawTablesController.js†L242-L255】
3.  `storage/raw_mappings.json`: Column mappings stored separately. 【F:api/v1/controllers/RawTablesController.js†L257-L274】

**Target Vision (Denormalized / Document):**
* One JSON file per upload under `storage/raw-assets/` with shape:
  ```json
  {
    "meta": {
      "title": "My Upload",
      "mapping": { "ExcelHeader": "AssetPoolKey" }
    },
    "data": [ { ...row_1... }, { ...row_2... } ]
  }
  ```
* Rows start at spreadsheet row 2 (header excluded); each upload keeps its own file name and optional asset-id column (or generated UUIDs during import).
* Archiving moves `{upload}.json` to `storage/archived-raw-assets/` and flips affected assets to `archived: true` in the pool.

**Gap:** Metadata, mappings, and data live in separate global tables today. They must be bundled per upload with a `meta` object that includes `title` and `mapping`, plus a dedicated asset ID source (column or generated UUID) captured during import.

### B. Asset Pool (The Aggregation)

**Current State:**
* `lib/assetPool.js` synthesizes a view by combining raw rows and mappings at request time instead of reading a persistent aggregated file.【F:lib/assetPool.js†L1-L205】
* Storage still references `unified_assets.json`, but no JSON object keyed by asset ID exists.

**Target Vision:**
* `storage/asset-pool.json` should be an object: `{ "550e8400...": { ...row data..., "archived": false }, ... }`.
* When a raw upload is imported or mappings change, cloned row data (with asset IDs) are created/updated in the pool. Archiving a raw file flips `archived: true` for the affected asset IDs, and re-importing the same asset IDs resets `archived: false`.

**Gap:** There is no persisted asset-pool object keyed by asset ID, and the current view builder cannot support archive state or per-asset updates.

### C. Measure Documents (Active + Archived)

**Current State (Normalized / Relational):**
* Measures, versions, topics, sub-topics, categories, and state live in separate JSON tables managed by `store`.
  * Tables initialized in `lib/storage.js`: `measure_versions`, `measure_state`, `measure_topics`, `measure_sub_topics`, `measure_categories`, `measures`.【F:lib/storage.js†L27-L32】
  * Controllers and loaders read/write normalized rows: `api/v1/controllers/MeasuresController.js` and `lib/assetStructure.js`.【F:api/v1/controllers/MeasuresController.js†L40-L288】【F:lib/assetStructure.js†L61-L382】

**Target Vision (Denormalized / Document):**
* Each raw measure upload produces a JSON document under `storage/measures/` (e.g., `{upload-id}.json`) with all rows. If a same-named file already exists, it is moved to `storage/measures/archived/{upload-id}.json` before the new upload is stored.
* Active measures live in a single file (e.g., `storage/measures/active.json`) structured as `{ hash: { ...row fields... } }`, where `hash` is derived by concatenating row values and hashing the result.
* Archived measure uploads keep the same hash-keyed structure in `storage/measures/archived/{upload-id}.json` for superseded or explicitly archived uploads.

**Gap:** Measure data is split across normalized tables with no hash-keyed active store, no per-upload raw files, and no archive location. Hash generation and keying logic do not exist in the current codebase.

---

## 4. Logic & Workflow Analysis

### A. Import Process (`RawTablesController.js`)
*   **Current:** Parses Excel -> Validates -> Inserts into `raw_tables` -> Inserts rows into `raw_rows` -> Inserts mappings into `raw_mappings`.【F:api/v1/controllers/RawTablesController.js†L142-L277】
*   **Target:** Parse Excel -> Determine asset ID source (explicit column or generated UUID per row) -> Construct `{ meta, data }` JSON -> Write to `storage/raw-assets/{upload-id}.json` -> Update `asset-pool.json` with cloned rows (per asset ID) and `archived: false`.
*   **Action:** Replace `store.insert()` calls with file writes; capture the asset-id definition and mapping in the new file meta; ensure asset-pool entries are generated during import and un-archive any preexisting asset IDs that were archived.

### B. Archival Process
*   **Current:** No archival logic found in controllers or services.
*   **Target:**
    1. Move `{upload}.json` from `raw-assets/` to `archived-raw-assets/` only when a user triggers archive.
    2. Set `archived: true` for all related asset IDs inside `asset-pool.json` during that move.
    3. If a later upload reuses an archived asset ID, flip `archived` back to `false` for that ID while refreshing its data.
*   **Action:** Add archive operation in controller/service layer plus file move helper triggered by an explicit archive action, and ensure the import flow can revive archived asset IDs when they reappear.

### C. Mapping Updates
*   **Current:** Updates `raw_mappings.json` via `store.set()` without touching asset aggregates.【F:api/v1/controllers/RawTablesController.js†L279-L345】
*   **Target:**
    1. Read the specific raw-asset JSON file and update `meta.mapping` (object of `{ rawHeader: assetKey }`).
    2. Rewrite the file with preserved rows.
    3. Recompute the affected asset records in `asset-pool.json` using the new mapping, keeping the same asset IDs.
*   **Action:** Refactor mapping update flow to operate on file-based raw assets and re-sync the asset pool.

### D. Asset Pool Utilities
*   **Current:** `lib/assetPool.js` builds an in-memory view each request and relies on `store` tables; it cannot update or archive assets persistently.【F:lib/assetPool.js†L1-L205】
*   **Target:** Dedicated helper that reads/writes `asset-pool.json` and supports: create, update single, update many, archive, delete, get (with/without filter), and paginated reads.
*   **Action:** Replace view-builder logic with read/write helpers backed by the new file; expose APIs/controllers that call these helpers instead of the current computed view.

### E. Measure Import, Hashing, and Archiving
*   **Current:** Measures are loaded from multiple normalized tables and delivered via `MeasuresController` list endpoints without a document store or hash-based keys.【F:api/v1/controllers/MeasuresController.js†L170-L288】【F:lib/assetStructure.js†L61-L382】
*   **Target:** Parse raw measure uploads into per-upload JSON documents, derive a hash by concatenating row values as the key, and materialize an active measures file keyed by those hashes. When a Measures upload with the same name exists, archive the old file before writing the new one; archiving a measure upload moves its file to `storage/measures/archived/` and removes or flags the hashes from the active file.
*   **Action:** Add measure import + hash generator, write per-upload measure documents, maintain `storage/measures/active.json`, archive superseded uploads pre-write, and update controllers/services to read from the hash-keyed store instead of the normalized tables.

---

## 5. Recommended Plan of Action (Backend-Only)

1.  **Create Storage Layout:** Add `storage/raw-assets/`, `storage/archived-raw-assets/`, `storage/measures/`, and `storage/measures/archived/`; stop initializing unused table JSON files once migration completes.
2.  **Asset ID Strategy:** During import, support selecting an ID column or generate UUIDs; persist the choice in each raw-asset file meta for later reprocessing.
3.  **Refactor Asset Import Flow:** Rewrite `RawTablesController.import` to write `{ meta, data }` JSON per upload and to seed/extend `asset-pool.json` with cloned rows keyed by asset ID and `archived: false`; if an incoming ID already exists but was archived, revive it and replace its data.
4.  **Implement Asset Archive Flow:** Add controller/service that moves the raw file to `archived-raw-assets/` only on explicit archive and marks the associated asset IDs as `archived: true` in `asset-pool.json`.
5.  **Mapping Management:** Update mapping handling to write into `meta.mapping` objects on the raw file and to reapply mappings to the asset pool (including a "Zuordnungen aktualisieren" button hook).
6.  **Asset Pool Service:** Replace `lib/assetPool.js` with a file-based helper that can create, update-one, update-many, archive, delete, and read assets (with filters and pagination). Controllers consuming asset pool data must switch to this helper.
7.  **Measure Import & Hashing:** Add a measure import path that writes each raw upload into `storage/measures/{upload-id}.json` with one entry per row and derives a deterministic hash by concatenating row values; if a file of the same name exists, archive it first; aggregate active measures into `storage/measures/active.json` keyed by that hash.
8.  **Measure Archiving:** Move archived or superseded measure uploads into `storage/measures/archived/{upload-id}.json` and remove or mark their hashes from the active file to avoid duplicates.
9.  **Measure Access Layer:** Refactor `MeasuresController` and `assetStructure` loaders to consume the new hash-keyed active file (and optional filters) instead of normalized tables.
10. **Migration or Reset:** Provide scripts to convert existing asset `raw_tables/raw_rows/raw_mappings` data and measure `measure_*` tables into the new per-upload and active files, or explicitly start with empty directories.
11. **Ignore Other Domains:** Group-related and category-adjacent tables remain out of scope for this refactor unless they consume asset or measure data directly.

---

## 6. Representative JSON Schemas (Target Vision)

The following sketches illustrate the expected structure for every file type in the new storage layout. Field names are examples; types should be refined during implementation.

### A. `storage/raw-assets/{upload-id}.json`
```json
{
  "meta": {
    "title": "Original filename or user-provided title",
    "uploadId": "uuid-or-timestamp",
    "uploadedAt": "ISO-8601 string",
    "assetIdStrategy": {
      "type": "column|generated",
      "columnName": "Asset ID" // only when type === "column"
    },
    "mapping": {
      "Raw Header": "assetPoolKey"
    }
  },
  "data": [
    {
      "assetId": "550e8400-e29b-41d4-a716-446655440000",
      "Raw Header": "value",
      "Another Header": 123
    }
  ]
}
```

### B. `storage/archived-raw-assets/{upload-id}.json`
Same shape as the active raw asset file. Asset IDs referenced here must be marked `archived: true` inside the pool when the file is moved.

### C. `storage/asset-pool.json`
```json
{
  "550e8400-e29b-41d4-a716-446655440000": {
    "archived": false,
    "sourceUploadId": "upload-123",
    "fields": {
      "name": "Example name",
      "category": "Example category"
    }
  },
  "4c9d7fa2-3f11-4e5a-b7a4-1b21c4c1c9b5": {
    "archived": true,
    "sourceUploadId": "upload-456",
    "fields": {
      "name": "Older asset"
    }
  }
}
```

### D. `storage/measures/{upload-id}.json`
```json
{
  "uploadId": "measures-2024-01-01",
  "uploadedAt": "ISO-8601 string",
  "rows": [
    {
      "hash": "3f785b...",
      "columns": {
        "Measure": "Example measure",
        "Value": 10,
        "Unit": "%"
      }
    }
  ]
}
```
If a file with the same `uploadId` already exists, move it to `storage/measures/archived/{upload-id}.json` before writing the new document.

### E. `storage/measures/active.json`
```json
{
  "3f785b...": {
    "sourceUploadId": "measures-2024-01-01",
    "columns": {
      "Measure": "Example measure",
      "Value": 10,
      "Unit": "%"
    }
  },
  "9d2a1c...": {
    "sourceUploadId": "measures-2024-01-02",
    "columns": {
      "Measure": "Another measure",
      "Value": 5,
      "Unit": "%"
    }
  }
}
```

### F. `storage/measures/archived/{upload-id}.json`
Same shape as the per-upload measure document (`storage/measures/{upload-id}.json`), representing superseded or explicitly archived uploads.
