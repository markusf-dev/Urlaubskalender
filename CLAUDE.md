# Urlaubskalender – Claude Code Context

## Session-Handling
- Bei Sessionstart: den neuesten Eintrag in `HANDOFFS/` vollständig lesen (oder `/resume`).
- Bei ~70–75 % Context-Auslastung oder nach einer klar abgegrenzten Aufgabe: `/handoff` ausführen, bevor `/compact` oder Sessionende.
- Für Kontinuität NICHT auf komprimierten Chatverlauf verlassen – Handoff-Dateien, CLAUDE.md, README.md und CHANGELOG.md sind die Quelle der Wahrheit.
- `HANDOFFS/` ist bewusst per `.gitignore` lokal (öffentliches Repo, persönlicher Kontext).

## Projekt
Jahreskalender zur Urlaubsplanung für Haushalte, im Stil der schulferien.org-Druckvorlage (12 Monatsspalten × 31 Zeilen): Feiertage aller Bundesländer, Schulferien, Urlaubsvorschläge (Brückentage), Vorlagen, mehrere Personen, gemeinsamer Plan per verschlüsseltem Haushalts-Link.

- Live: https://markusf-dev.github.io/Urlaubskalender/ (GitHub Pages aus `main`)
- Repo: https://github.com/markusf-dev/Urlaubskalender (öffentlich, MIT)
- Speicherdienst: https://urlaubskalender-sync.mstuff.workers.dev (Cloudflare Worker + D1, `worker/`)

## Stack & Struktur
Reines HTML/CSS/JavaScript, **kein Build, keine Abhängigkeiten**, klassische `<script>`-Tags (muss auch per `file://` laufen). PWA mit Service Worker.

| Datei | Inhalt |
| --- | --- |
| `index.html`, `styles.css` | Oberfläche |
| `js/dates.js` | Datum, Feiertage (berechnet), Brauchtumstage – auch in Node nutzbar |
| `js/school.js` | Schulferien (openholidaysapi.org, Cache, NRW-Fallback) |
| `js/optimizer.js` | Urlaubsvorschlag (DP) – auch in Node nutzbar |
| `js/sync.js` | Haushalts-Sync: AES-GCM, Versionen, Polling |
| `js/config.js` | Adresse des Speicherdienstes (localhost → lokaler Dienst) |
| `js/app.js` | Zustand, Rendering, Events |
| `sw.js` | Service Worker (Netzwerk zuerst, Cache nur offline) |
| `worker/` | Cloudflare Worker + D1, eigene README |

## Entwicklung
```
npm test                                  # Node-Tests (Optimierer, Datum)
python3 -m http.server 8766               # App lokal (für Service Worker und Sync)
cd worker && npm run dev                  # lokaler Speicherdienst auf :8787
cd worker && npm run deploy               # Worker veröffentlichen (nur von main)
```

## Konventionen
- UI-Sprache Deutsch. Code-Kommentare englisch, sparsam, im Stil des bestehenden Codes.
- Bei jeder Änderung an ausgelieferten Dateien `CACHE` in `sw.js` hochzählen.
- Neue ausgelieferte Dateien in `FILES` in `sw.js` eintragen.
- Daten, die zum gemeinsamen Plan gehören, in `SHARED_KEYS` (`js/app.js`) aufnehmen; Ansichtszustand (Jahr, Auswahl „Für“) bleibt pro Gerät.
- Keine persönlichen Daten ins Repo (`urlaubskalender*.json` ist ignoriert).
- Vor UI-Entscheidungen, die nicht eindeutig angefragt sind, fragen – als nummerierte Textliste, Mehrfachantworten erlauben. Nur bauen, was angefragt ist.

## Versionsverwaltung (Claude verantwortet Git/GitHub)
- `main` = live, geschützt (kein Force-Push, kein Löschen). Nur getesteter Code.
- Jedes Feature/Fix auf eigenem Branch (`feature/…`, `fix/…`, `docs/…`) von `main`.
- Merge per PR als Merge-Commit (`gh pr merge --merge`), danach Branch löschen.
- App-Änderungen: annotierter Tag `vX.Y[.Z]`, GitHub-Release, Eintrag in `CHANGELOG.md`.
- „Live“ erst melden, wenn der Pages-Workflow fertig ist (`gh run watch`) und die Live-Dateien die neue `CACHE`-Version zeigen.
- Commits mit der noreply-Adresse `214218133+markusf-dev@users.noreply.github.com` (lokal im Repo konfiguriert).
- Nach Live-Tests gegen den echten Worker Testhaushalte löschen: `cd worker && npx wrangler d1 execute urlaubskalender --remote --command "DELETE FROM households"` (nur solange es keine echten Nutzer gibt!).

## Architektur-Entscheidungen (mit Nutzer abgestimmt)
- Sync per verschlüsseltem Haushalts-Link (Schlüssel nur im `#`-Teil), keine Konten. Server sieht nur Ciphertext.
- Abgelehnt: Supabase (pausiert Gratis-Projekte), File System Access/Ordnerablage (kein Safari/iPhone), Dropbox/Google/iCloud (Anbieterzwang, gemischte Haushalte), Export/Import (vom Nutzer entfernt).
