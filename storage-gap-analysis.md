# Storage Gap Analysis

## 1. Executive Summary

The current application storage architecture operates as a **pseudo-relational database** using flat JSON files. Data is normalized and split across multiple files (e.g., headers in one file, rows in another, mappings in a third).

The **Target Vision** requires a **document-oriented storage** approach. The goal is to keep uploaded Excel data as self-contained "Raw Asset" JSON documents (one file per upload), while maintaining a central "Asset Pool" for aggregated access.

**Key Finding:** The current architecture is fundamentally incompatible with the Target Vision and requires a complete refactor of the storage layer ( `lib/storage.js`) and the upload controller (`RawTablesController.js`).

---

## 2. Folder Structure Comparison

| Component | Current State (`lib/storage.js`) | Target Vision | Gap / Action |
| :--- | :--- | :--- | :--- |
| **Root Storage** | `storage/*.json` (Flat list of 25+ files) | `storage/` | **Retain** root, but cleanup unused "tables". |
| **Active Assets** | **Missing.** Stored as rows in `raw_rows.json`. | `storage/raw-assets/` | **Create** directory. Move from normalized rows to individual files. |
| **Archives** | **Missing.** No dedicated archive concept. | `storage/archived-raw-assets/` | **Create** directory. |
| **Asset Index** | `storage/unified_assets.json` (Concept exists but structure differs). | `storage/asset-pool.json` | **Rename & Restructure.** |

---

## 3. Data Schema & Model Comparison

### A. Raw Data Storage

**Current State (Normalized / Relational):**
Data is shredded across three separate files:
1.  `storage/raw_tables.json`: Stores ID, Title, Filename.
2.  `storage/raw_rows.json`: Stores the actual data content, linked by `raw_table_id`.
3.  `storage/raw_mappings.json`: Stores column mappings, linked by `raw_table_id`.

**Target Vision (Denormalized / Document):**
A single, self-contained JSON file for every upload (e.g., `storage/raw-assets/upload-123.json`).
```json
{
  "meta": {
    "title": "My Upload",
    "mapping": { "ExcelHeader": "AssetPoolKey" }
  },
  "data": [
    { ...row_1... },
    { ...row_2... }
  ]
}
```

**Gap:** The current system isolates metadata from data. The Target Vision requires them to be bundled.

### B. Asset Pool (The Aggregation)

**Current State:**
*   `unified_assets.json` exists in code but usage is unclear.
*   Logic tries to "build" views on the fly from raw rows.

**Target Vision:**
A simple, flat Key-Value store keyed by UUID.
```json
{
  "550e8400-e29b...": { "name": "Item A", "archived": false },
  "770e8400-e29b...": { "name": "Item B", "archived": true }
}
```

**Gap:** The current system relies on "Raw Tables" as the source of truth. The Target Vision shifts the source of truth to the `asset-pool.json` for the aggregated view.

---

## 4. Logic & Workflow Analysis

### A. Import Process (`RawTablesController.js`)
*   **Current:** Parses Excel -> Validates -> Inserts into `raw_tables` -> Inserts rows into `raw_rows`.
*   **Target:** Parse Excel -> Generate UUIDs -> Construct JSON Object (Meta + Data) -> **Write File** to `storage/raw-assets/{id}.json`.
*   **Action:** Rewrite `import` function to bypass `lib/storage.js` "table" logic and use native FS operations to write the new JSON structure.

### B. Archival Process
*   **Current:** No archival logic found.
*   **Target:**
    1.  Move file from `raw-assets/` to `archived-raw-assets/`.
    2.  Update entries in `asset-pool.json` setting `archived: true`.
*   **Action:** Implement new `archive` endpoint/controller method.

### C. Mapping Updates
*   **Current:** Updates `raw_mappings.json`.
*   **Target:**
    1.  Read specific file from `raw-assets/`.
    2.  Update `meta.mapping` object.
    3.  Save file.
    4.  Update corresponding keys in `asset-pool.json`.
*   **Action:** Refactor `updateMapping` to work with the file system instead of `store.update()`.

---

## 5. Recommended Plan of Action

1.  **Initialize Folders:** Create `storage/raw-assets` and `storage/archived-raw-assets`.
2.  **Create Migration Script (Optional):** If existing data in `raw_rows.json` is valuable, write a script to "un-shred" it into individual JSON files. If not, start fresh.
3.  **Refactor `RawTablesController.import`:**
    *   Stop using `store.insert('raw_tables'...)`.
    *   Start using `fs.writeFileSync` to save the structured JSON.
4.  **Implement `AssetPoolService`:** Create a helper to manage reading/writing the `asset-pool.json` file to ensure concurrent updates (UUID keying) are handled correctly.
5.  **Refactor Frontend:** The frontend views currently expect an ID to fetch data from the API. The API response format must remain consistent, OR the frontend must be updated to expect the new structure.
