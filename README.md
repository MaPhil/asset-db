# Assets Inventory API + JSON-Speicher

Dieses Repository stellt einen JSON-gestützten Dienst zur Verwaltung eines Asset-Verzeichnisses bereit. Er bietet eine versionierte REST-API unter `/api/v1` und hält die vorhandene Handlebars-Oberfläche auf derselben Speicherbasis lauffähig. Die Anwendung verzichtet auf klassische Datenbanken, indem sie strukturierte JSON-Dateien auf der Festplatte persistiert.

## Funktionen

- **Versionierte API** – sämtliche Anfragen laufen über `/api/v1/*` und sind nach Controller-, Middleware- und Routen-Ordnern mit Index-Dateien organisiert, die alles re-exportieren.
- **JSON-Persistenz** – Datensätze werden in Dateien `storage/*.json` gespeichert. Jede Datei enthält einen `meta`-Abschnitt für die Sequenzierung sowie das eigentliche `rows`-Array.
- **Neuaufbau der vereinheitlichten Assets** – `lib/merge.js` stellt `rebuildUnified()` bereit, um die denormalisierte Asset-Tabelle neu zu erstellen, sobald Quellen oder Zuordnungen geändert werden.
- **Schlanke Oberfläche** – `views/` enthält einfache Handlebars-Vorlagen zum Durchstöbern von Quellen und zusammengeführten Assets, während die API die Hauptarbeit übernimmt.

## Projektstruktur

```
.
├─ api/
│  └─ v1/
│     ├─ controllers/        # Fachlogik je Ressource
│     ├─ middleware/         # Gemeinsame HTTP-Helfer
│     ├─ routes/             # Express-Router gruppiert nach Ressourcen
│     └─ index.js            # Bindet den v1-Router ein
├─ app.js                    # Express-Startpunkt + UI-Routen
├─ lib/
│  ├─ merge.js               # rebuildUnified() mit JSON-Daten
│  └─ storage.js             # Minimalistische Zugriffsschicht auf JSON-Daten
├─ public/                   # Statische Assets (CSS/JS)
├─ storage/                  # JSON-„Datenbank“-Dateien
├─ uploads/                  # Multer-Zwischenspeicher für Uploads (per .gitignore ausgeschlossen)
├─ views/                    # Handlebars-Vorlagen
└─ README.md
```

## Erste Schritte

```bash
npm install
npm run dev
# besuche http://localhost:3000
```

Der Entwicklungsbefehl nutzt `nodemon` für automatische Neustarts. In Produktionsumgebungen `npm start` verwenden.

## Speicherformat

Jede JSON-Datei in `storage/` entspricht dem folgenden Aufbau:

```json
{
  "meta": { "seq": 0, "updatedAt": "1970-01-01T00:00:00.000Z" },
  "rows": []
}
```

- `meta.seq` – zuletzt vergebener, automatisch erhöhter Bezeichner.
- `meta.updatedAt` – Zeitstempel, der bei jedem Schreiben aktualisiert wird.
- `rows` – einfache Objekte, die Tabellenzeilen repräsentieren (z. B. Quellen, Zuordnungen, Kategorien).

`lib/storage.js` stellt Hilfsmethoden bereit: `get`, `set`, `insert`, `update`, `remove` und `upsertSchemaCol`. Schreibvorgänge erfolgen atomar, indem zunächst in eine temporäre Datei geschrieben und diese anschließend umbenannt wird.

## API-Überblick

| Ressource | Beschreibung | Wichtige Endpunkte |
|-----------|--------------|--------------------|
| Assets | Anzeige oder Neuaufbau der vereinheitlichten Asset-Tabelle | `GET /api/v1/assets`, `POST /api/v1/assets/rebuild` |
| Quellen | Rohdatenquellen hochladen, einsehen oder löschen | `POST /api/v1/sources/upload`, `GET /api/v1/sources/:id`, `DELETE /api/v1/sources/:id` |
| Zuordnungen | Verwaltung der Zuordnung von Quellen- zu Vereinheitlichten-Spalten | `POST /api/v1/mappings/schema/add`, `POST /api/v1/mappings/save` |
| Kategorien | CRUD für Risikokategorien | `GET /api/v1/categories`, `POST /api/v1/categories`, `GET/PUT /api/v1/categories/:id` |
| Gruppen | CRUD für Asset-Gruppen sowie das Verknüpfen von Kategorien | `GET /api/v1/groups`, `POST /api/v1/groups`, `PUT /api/v1/groups/:id`, `POST /api/v1/groups/:id/link-category` |

Alle Controller befinden sich unter `api/v1/controllers/` und werden über die jeweilige `index.js` importiert.

### Middleware

- `asyncHandler(fn)` – umschließt asynchrone Route-Handler und leitet Fehler an Express weiter.
- `validateId(param?)` – validiert Integer-Routenparameter und liefert bei Ungültigkeit `400`.

### Uploads

`POST /api/v1/sources/upload` erwartet Multipart-Formdaten mit einem `file`-Feld. Hochgeladene Dateien werden vorübergehend in `uploads/` gespeichert und mit `xlsx` verarbeitet. Jede Zeile landet in `storage/source_rows.json`, und das Schema wird anhand der Kopfzeilen der ersten Zeile initialisiert.

## UI-Routen

Auch wenn die API für neue Integrationen bevorzugt wird, bietet die mitgelieferte Handlebars-Oberfläche:

- `/assets` – Überblick über Schema, Quellen und vereinheitlichte Assets (inklusive Schaltfläche zum Neuaufbau über die API).
- `/sources/:id` – schnelle Vorschau der gespeicherten Zeilen für eine bestimmte Quelle.

Die Oberfläche greift direkt über `store.get()` auf den JSON-Speicher zu und bleibt dadurch mit den API-Antworten synchron.

## Entwicklungs-Checkliste

1. Controller unter `api/v1/controllers/` aktualisieren oder hinzufügen.
2. Über die entsprechenden `index.js`-Dateien exportieren (Controller/Middleware/Routes).
3. Routen unter `api/v1/routes/` definieren oder anpassen.
4. Änderungen mit den `store.*`-Hilfsmethoden speichern und `rebuildUnified()` aufrufen, sobald vereinheitlichte Daten neu berechnet werden sollen.
5. API-Erweiterungen hier oder in ergänzenden Dokumenten festhalten.
