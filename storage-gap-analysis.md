# Storage Gap Analysis

## 1. Executive Summary

The current application storage architecture operates as a **pseudo-relational database** using flat JSON files managed through `lib/storage.js`. Data is normalized and split across multiple files (e.g., headers in one file, rows in another, mappings in a third).【F:lib/storage.js†L7-L90】【F:api/v1/controllers/RawTablesController.js†L89-L197】

The **Target Vision** requires a **document-oriented storage** approach for both assets and measures:
* **Assets:** Each uploaded Excel file becomes a self-contained `raw-asset-data` document stored under `storage/raw-assets` and stays there until a user explicitly archives it. Archiving moves the file to `storage/archived-raw-assets`, and all related asset IDs in the pool are marked `archived: true`. Meta data (`title`, `mapping` object) and raw rows start from the second spreadsheet row. A central `asset-pool.json` aggregates every asset by UUID/ID key and supports updates and pagination-friendly access (no dedicated archive/delete helper flows beyond the existing editing experience).
* **Measures:** There is always a single active measures file named `storage/measures.json` that holds current entries keyed by a deterministic hash derived from concatenating row values. The hash is the stable lookup key for a specific row—consumers should address rows by this hash rather than by index, which also makes it trivial to diff active versus archived uploads or detect duplicates. When a measures upload endpoint receives a new file, it checks whether `storage/measures.json` already exists; if so, that existing file is moved into `storage/archived-measures/` before the new content overwrites `storage/measures.json`. Archive files keep the same hash-keyed structure as the active file.

**Key Finding:** The current architecture is fundamentally incompatible with the Target Vision and requires a complete refactor of the storage layer (`lib/storage.js`), the raw upload controller (`api/v1/controllers/RawTablesController.js`), the asset pool utilities (`lib/assetPool.js`), and the measure ingestion/storage surfaces (`api/v1/controllers/MeasuresController.js`, `lib/assetStructure.js`).

---

## 2. Folder & File Layout Comparison

| Component | Current State (`lib/storage.js`) | Target Vision | Gap / Action |
| :--- | :--- | :--- | :--- |
| **Root Storage** | Auto-initializes 25+ table files directly under `storage/*.json` at runtime.【F:lib/storage.js†L7-L49】 | Keep `storage/` but stop creating unrelated table JSON files. | Remove table auto-creation once the new layout is in place. |
| **Active Raw Assets** | **Missing.** Raw uploads are split across `raw_tables.json`, `raw_rows.json`, and `raw_mappings.json`.【F:api/v1/controllers/RawTablesController.js†L142-L213】【F:api/v1/controllers/RawTablesController.js†L226-L275】 | `storage/raw-assets/{upload-id}.json` (one file per upload) that remains active until explicitly archived. | Create directory and change writes to per-upload JSON documents. |
| **Archived Raw Assets** | **Missing.** No archive directory or move logic. | `storage/archived-raw-assets/{upload-id}.json` created only after an explicit archive action that removes the file from `raw-assets`. | Add directory and move files upon archive while marking asset IDs archived in the pool. |
| **Asset Pool** | `unified_assets.json` referenced but not aligned with file-per-asset object store.【F:lib/storage.js†L8-L34】【F:lib/assetPool.js†L1-L205】 | `storage/asset-pool.json` as `{ assetId: { ... }, ... }` plus `archived` flag per asset. | Replace `unified_assets.json` usage with `asset-pool.json` and update consumers. |
| **Active Measures** | **Missing.** Measures are normalized across multiple tables (`measure_*`).【F:lib/storage.js†L27-L32】【F:api/v1/controllers/MeasuresController.js†L40-L174】 | Single active measure file `storage/measures.json` keyed by a hash of concatenated row values; one entry per spreadsheet row. New uploads replace the active file after archiving the prior version. | Introduce the single active file and hash-keyed entries plus pre-replacement archival. |
| **Archived Measures** | **Missing.** No measure archive mechanism. | `storage/archived-measures/{upload-id}.json` holding hash-keyed rows for archived uploads when superseded. | Add archive folder and move/archive logic for measure imports. |

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
* A single active measures document `storage/measures.json` holds hash-keyed rows derived by concatenating row values; the hash acts as the canonical row identifier used by readers, not just a generated value stored in the payload.
* When a measures upload arrives via the dedicated endpoint, check for an existing `storage/measures.json`; if present, move it to `storage/archived-measures/{upload-id-or-timestamp}.json` before writing the new content.
* Archived measure uploads keep the same hash-keyed structure as the active file.

**Gap:** Measure data is split across normalized tables with no hash-keyed active store or archival process that moves the previous `storage/measures.json` into an archive folder.

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
*   **Target:** Dedicated helper that reads/writes `asset-pool.json` and supports: create, update single, update many, get (with/without filter), and paginated reads (no archive or delete flows beyond the current editing experience).
*   **Action:** Replace view-builder logic with read/write helpers backed by the new file that focus on listing and editing fields as in the current asset pool view.

### E. Measure Import, Hashing, and Archiving
*   **Current:** Measures are loaded from multiple normalized tables and delivered via `MeasuresController` list endpoints without a document store or hash-based keys.【F:api/v1/controllers/MeasuresController.js†L170-L288】【F:lib/assetStructure.js†L61-L382】
*   **Target:** Parse raw measure uploads into a single hash-keyed document at `storage/measures.json`. When a new measures upload arrives, archive the existing `storage/measures.json` into `storage/archived-measures/{upload-id-or-timestamp}.json` before writing the new hashes.
*   **Action:** Add measure import + hash generator that writes to `storage/measures.json`, archives the prior file pre-write, and update controllers/services to read from the hash-keyed store instead of the normalized tables.

---

## 5. Recommended Plan of Action (Backend-Only)

1.  **Create Storage Layout:** Add `storage/raw-assets/`, `storage/archived-raw-assets/`, keep the root `storage/measures.json`, and introduce `storage/archived-measures/`; stop initializing unused table JSON files once migration completes.
2.  **Asset ID Strategy:** During import, support selecting an ID column or generate UUIDs; persist the choice in each raw-asset file meta for later reprocessing.
3.  **Refactor Asset Import Flow:** Rewrite `RawTablesController.import` to write `{ meta, data }` JSON per upload and to seed/extend `asset-pool.json` with cloned rows keyed by asset ID and `archived: false`; if an incoming ID already exists but was archived, revive it and replace its data.
4.  **Implement Asset Archive Flow:** Add controller/service that moves the raw file to `archived-raw-assets/` only on explicit archive and marks the associated asset IDs as `archived: true` in `asset-pool.json`.
5.  **Mapping Management:** Update mapping handling to write into `meta.mapping` objects on the raw file and to reapply mappings to the asset pool (including a "Zuordnungen aktualisieren" button hook).
6.  **Asset Pool Service:** Replace `lib/assetPool.js` with a file-based helper that can create, update-one, update-many, and read assets (with filters and pagination) to match the current asset pool list/edit functionality.
7.  **Measure Import & Hashing:** Add a measure import path that writes the hashed rows into the single `storage/measures.json`; if that file already exists, archive it first to `storage/archived-measures/{upload-id-or-timestamp}.json`.
8.  **Measure Archiving:** Ensure the upload endpoint moves the previous `storage/measures.json` into `storage/archived-measures/` before writing a new version, keeping the same hash-keyed structure.
9.  **Measure Access Layer:** Refactor `MeasuresController` and `assetStructure` loaders to consume the hash-keyed `storage/measures.json` (and optional filters) instead of normalized tables.
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
    "source": ["upload-123", "archived-upload-001"],
    "fields": {
      "name": "Example name",
      "category": "Example category"
    }
  },
  "4c9d7fa2-3f11-4e5a-b7a4-1b21c4c1c9b5": {
    "archived": true,
    "source": ["archived-upload-999"],
    "fields": {
      "name": "Older asset"
    }
  }
}
```

### D. `storage/measures.json`
```json
{
  "uploadedAt": "ISO-8601 string",
  "data": {
    "3f785b...": {
      "Measure": "Example measure",
      "Value": 10,
      "Unit": "%"
    }
  }
}
```
If `storage/measures.json` already exists when a new measures upload arrives, move the existing file to `storage/archived-measures/{upload-id-or-timestamp}.json` before writing the new document.

### E. `storage/archived-measures/{upload-id}.json`
```json
{
  "uploadedAt": "ISO-8601 string",
  "data": {
    "3f785b...": {
      "Measure": "Example measure",
      "Value": 10,
      "Unit": "%"
    }
  }
}
```

Same shape as the active measures document, representing superseded uploads moved out of `storage/measures.json`.

### F. `storage/asset_pool_manipulator.json`
```json
{
  "fields": [
    {
      "key": "name",
      "label": "Asset name",
      "type": "text"
    },
    {
      "key": "category",
      "label": "Category",
      "type": "select",
      "options": ["Category A", "Category B"]
    }
  ],
  "displayOrder": ["name", "category"],
  "editable": true
}
```
This replaces the current generic `manipulator` description with an asset-pool-specific configuration that defines which fields appear in the asset pool UI, their labels, input types, and ordering.

---

## 7. Storage File Disposition Under the New Scheme

| File | Previous Purpose | New Purpose | Action |
| :--- | :--- | :--- | :--- |
| asset_categories.json | Normalized lookup for asset categories tied to measures. | Superseded by hash-keyed measures and asset pool metadata. | Delete once new measures/asset pool are in place. |
| asset_category_assignments.json | Linked assets to category records. | Superseded by embedded category fields in `asset-pool.json`. | Delete after migrating category values into asset records. |
| asset_pool_cells.json | Stored cell-level asset pool grid data. | Replaced by denormalized asset entries in `asset-pool.json`. | Delete after migration. |
| asset_pool_fields.json | Defined asset pool field metadata. | Consolidate into `asset_pool_manipulator.json` configuration. | Modify/merge into new manipulator file. |
| asset_type_decisions.json | Held inferred/selected asset type decisions. | Capture any needed type directly on asset pool entries. | Delete after folding needed fields into `asset-pool.json`. |
| categories.json | Shared category lookup for groups/assets. | Remains a shared taxonomy if the UI still needs it. | Modify later only if taxonomy model changes. |
| group_asset_selectors.json | Linked groups to asset selection rules. | Still relevant for group features; independent of storage refactor. | Keep as-is for now. |
| group_asset_types.json | Defined asset types per group. | Still relevant for group features; independent of storage refactor. | Keep as-is for now. |
| group_categories.json | Defined categories per group. | Still relevant for group features; independent of storage refactor. | Keep as-is for now. |
| groups.json | Stored group records. | Still relevant for group features; independent of storage refactor. | Keep as-is for now. |
| manipulators.json | Generic manipulator definitions. | Replace with `asset_pool_manipulator.json` focused on asset pool UI fields. | Modify/replace. |
| mappings.json | Stored column mappings for assets. | Persist mappings inside each `raw-assets/{upload-id}.json` meta section. | Delete after migration. |
| measure_categories.json | Lookup table for measure categories. | Superseded by flat measures rows in `measures.json`. | Delete. |
| measure_state.json | Lookup/state table for measures. | Superseded by flat measures rows in `measures.json`. | Delete. |
| measure_sub_topics.json | Lookup table for sub-topics. | Superseded by flat measures rows in `measures.json`. | Delete. |
| measure_topics.json | Lookup table for topics. | Superseded by flat measures rows in `measures.json`. | Delete. |
| measure_versions.json | Versioning table for measures. | Superseded by the archived copies in `archived-measures/`. | Delete after migration. |
| measures.json | Current normalized measure rows. | Becomes the single hash-keyed active measures document at `storage/measures.json`. | Modify to new structure/location. |
| raw_mappings.json | Normalized asset column mappings. | Captured per upload in `raw-assets/{upload-id}.json` meta. | Delete after migration. |
| raw_rows.json | Normalized asset rows for all uploads. | Superseded by per-upload `raw-assets/{upload-id}.json` data blocks. | Delete after migration. |
| raw_tables.json | Upload metadata for assets. | Superseded by per-upload `raw-assets/{upload-id}.json` meta blocks. | Delete after migration. |
| schema.json | Global schema definition for normalized tables. | Replace with JSON schema definitions for new documents if needed. | Modify/replace. |
| settings.json | Application-level settings. | Still applicable; unrelated to storage refactor. | Keep as-is. |
| source_rows.json | Normalized source rows. | Superseded by per-upload raw asset documents and archived copies. | Delete after migration. |
| sources.json | Source metadata for uploads. | Capture source details inside raw asset meta or measure archive entries. | Delete after migrating needed fields. |
| unified_assets.json | Legacy unified asset view. | Superseded entirely by `asset-pool.json`. | Delete. |
