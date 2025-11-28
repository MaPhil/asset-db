# Assets Inventory API + JSON-Speicher

Dieses Repository stellt einen JSON-gestützten Dienst zur Verwaltung eines Asset-Verzeichnisses bereit. Der Service bietet eine versionierte REST-API unter `/api/v1` und liefert das gebaute Vue-Frontend aus `public/dist` aus. Die Anwendung verzichtet auf klassische Datenbanken, indem sie strukturierte JSON-Dateien auf der Festplatte speichert.

## Funktionen

- **Versionierte API** – sämtliche Anfragen laufen über `/api/v1/*` und sind nach Controller-, Middleware- und Routen-Ordnern.
- **JSON-Persistenz** – Datensätze werden in Dateien `storage/*.json` gespeichert. Jede Datei enthält einen `meta`-Abschnitt für die Sequenzierung sowie das eigentliche `rows`-Array.
- **Neuaufbau der vereinheitlichten Assets** – `lib/merge.js` stellt `rebuildUnified()` bereit, um die denormalisierte Asset-Tabelle neu zu erstellen, sobald Quellen oder Zuordnungen geändert werden.
- **Schlanke Oberfläche** – das Vue-Frontend wird aus `public/dist` über Express ausgeliefert und kann per SPA-Routing alle UI-Routen bedienen.

## Projektstruktur

```
.
├─ api/
│  └─ v1/
│     ├─ controllers/        # Fachlogik je Ressource
│     ├─ middleware/         # Gemeinsame HTTP-Helfer
│     ├─ routes/             # Express-Router gruppiert nach Ressourcen
│     └─ index.js            # Bindet den v1-Router ein
├─ app.js                    # Express-Startpunkt + API + SPA-Fallback
├─ lib/
│  ├─ merge.js               # rebuildUnified() mit JSON-Daten
│  └─ storage.js             # Minimalistische Zugriffsschicht auf JSON-Daten
├─ public/                   # Statische Assets (CSS/JS) + gebaute Vue-App unter ./dist
├─ frontend/                 # Vite + Vue 3 Quellcode
├─ storage/                  # JSON-„Datenbank“-Dateien
├─ uploads/                  # Multer-Zwischenspeicher für Uploads (per .gitignore ausgeschlossen)
├─ views/                    # Legacy Handlebars-Vorlagen (werden nicht mehr gerendert)
└─ README.md
```

## Erste Schritte

```bash
npm install
npm run dev
# besuche http://localhost:5678
```

Der Entwicklungsbefehl nutzt `nodemon` für automatische Neustarts. In Produktionsumgebungen `npm start` verwenden.

## Vue-Frontend (Vite + Vue 3)

Eine moderne Vue-Oberfläche liegt unter `frontend/` und bildet das globale Layout mit Header, Navigation und Inhaltsbereich
nach. Die gebauten Assets landen in `public/dist` und werden durch das bestehende Express-Static-Mount unter `/dist`
ausgeliefert.

```bash
# Entwicklungsserver
npm run client:dev

# Production-Build -> public/dist
npm run client:build

# Vorschau des Builds
npm run client:preview
```

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

### Middleware

- `asyncHandler(fn)` – umschließt asynchrone Route-Handler und leitet Fehler an Express weiter.
- `validateId(param?)` – validiert Integer-Routenparameter und liefert bei Ungültigkeit `400`.

### Uploads

`POST /api/v1/sources/upload` erwartet Multipart-Formdaten mit einem `file`-Feld. Hochgeladene Dateien werden vorübergehend in `uploads/` gespeichert und mit `xlsx` verarbeitet. Jede Zeile landet in `storage/source_rows.json`, und das Schema wird anhand der Kopfzeilen der ersten Zeile initialisiert.
