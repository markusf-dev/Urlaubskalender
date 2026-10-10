# Speicherdienst (Cloudflare Worker)

Speichert pro Haushalt einen verschlüsselten Plan, damit mehrere Personen gemeinsam planen können. Der Dienst sieht nur eine Haushalts-ID und unlesbaren Datensalat. Der Schlüssel steckt im Haushalts-Link hinter dem `#`, und dieser Teil einer Adresse wird nie an einen Server geschickt.

- **Technik:** Cloudflare Worker und D1 (SQLite), kostenloser Tarif
- **Schnittstelle:** `GET / PUT / DELETE /h/:id` mit Versionsnummer für konfliktfreies Speichern (siehe `src/index.js`)
- **Aufräumen:** Haushalte, die 730 Tage niemand geändert hat, werden täglich gelöscht (`RETENTION_DAYS`).
- **Zugriff:** Nur die in `ALLOWED_ORIGINS` eingetragenen Adressen dürfen den Dienst aufrufen.

## Einrichten (einmalig)

```
cd worker
npm install
npx wrangler login                      # öffnet den Browser, mit dem Cloudflare-Konto anmelden
npx wrangler d1 create urlaubskalender  # gibt eine database_id aus
```

1. Die `database_id` in `wrangler.toml` eintragen.
2. Die Datenbank anlegen und den Dienst veröffentlichen:
   ```
   npm run db:init
   npm run deploy                          # gibt die Adresse aus, z. B. https://urlaubskalender-sync.<name>.workers.dev
   ```
3. Die Adresse in `../js/config.js` als `syncUrl` eintragen.

## Lokal entwickeln

```
npm run dev                             # Dienst auf http://localhost:8787 mit lokaler Datenbank
python3 -m http.server 8766             # im Hauptordner: App auf http://localhost:8766
```

Auf `localhost` verwendet die App automatisch den lokalen Dienst.
