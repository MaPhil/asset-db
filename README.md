# Assets Inventory API + JSON-Speicher

Dieses Repository stellt einen JSON-gestützten Dienst zur Verwaltung eines Asset-Verzeichnisses bereit. Der Service bietet eine versionierte REST-API unter `/api/v1` und hält die Handlebars-Oberfläche vor. Die Anwendung verzichtet auf klassische Datenbanken, indem sie strukturierte JSON-Dateien auf der Festplatte speichert.

## Funktionen

- **Versionierte API** – sämtliche Anfragen laufen über `/api/v1/*` und sind nach Controller-, Middleware- und Routen-Ordnern.
- **JSON-Persistenz** – Datensätze werden in Dateien `storage/*.json` gespeichert. Jede Datei enthält einen `meta`-Abschnitt für die Sequenzierung sowie das eigentliche `rows`-Array.
- **Neuaufbau der vereinheitlichten Assets** – `lib/merge.js` stellt `rebuildUnified()` bereit, um die denormalisierte Asset-Tabelle neu zu erstellen, sobald Quellen oder Zuordnungen geändert werden.
- **Schlanke Oberfläche** – `views/` enthält einfache Handlebars-Vorlagen zum lesen der Quellen und zusammengeführten Assets, während die API die Hauptarbeit übernimmt.

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
# besuche http://localhost:5678
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

### Middleware

- `asyncHandler(fn)` – umschließt asynchrone Route-Handler und leitet Fehler an Express weiter.
- `validateId(param?)` – validiert Integer-Routenparameter und liefert bei Ungültigkeit `400`.

### Uploads

`POST /api/v1/sources/upload` erwartet Multipart-Formdaten mit einem `file`-Feld. Hochgeladene Dateien werden vorübergehend in `uploads/` gespeichert und mit `xlsx` verarbeitet. Jede Zeile landet in `storage/source_rows.json`, und das Schema wird anhand der Kopfzeilen der ersten Zeile initialisiert.
