# Änderungen

Alle Versionen sind als Git-Tag und als [GitHub-Release](https://github.com/markusf-dev/Urlaubskalender/releases) verfügbar.

## v2.2.3 – 2026-10-13

- **Titel über den ganzen Urlaub:** Der Titel steht zentriert über dem ganzen freien Block, also auch über Wochenenden und Feiertage davor und danach (z. B. Fr 01. bis So 03.10. statt nur über den Freitag).

## v2.2.2 – 2026-10-13

- **Punkte über den ganzen Urlaub:** Die Personen-Punkte stehen jetzt auch auf Wochenenden und Feiertagen, die zu einem Urlaub gehören (z. B. Sa 20. bis So 28.02. statt nur Mo bis Fr). Gezählt werden weiterhin nur die Urlaubstage.

## v2.2.1 – 2026-10-11

- **Updates kommen sofort an:** Die App lädt online immer zuerst die aktuelle Version und nutzt den gespeicherten Stand nur noch offline. Übernimmt im Hintergrund eine neue Version, lädt die Seite einmal automatisch neu. Vorher war nach einem Update oft ein zweites Neuladen nötig.

## v2.2 – 2026-10-11

- **Personen als Punkte:** Im Kalender zeigt jetzt ein farbiger Punkt pro Person, wer frei hat. Die Punkte stehen ganz links unter dem Datum statt als Streifen am unteren Rand; auch die Legende zeigt Punkte.

## v2.1 – 2026-10-11

- **Titel für Urlaube:** Beim Eintragen kann ein Titel vergeben werden (z. B. „Mallorca“). Er steht senkrecht in der Mitte der Monatsspalte über den Urlaubstagen. Benannte feste Urlaube aus Vorlagen werden genauso beschriftet. Titel werden mitgedruckt und mit dem gemeinsamen Plan abgeglichen.
- **Urlaube bearbeiten:** ✎ an einem eingetragenen Urlaub lädt ihn ins Formular. Zeitraum, Umfang, Titel und Personen lassen sich ändern.

## v2.0 – 2026-10-10

- **Gemeinsam planen:** Teilen per verschlüsseltem Haushalts-Link, ohne Konto. Der Plan wird im Browser verschlüsselt (AES-256-GCM); der Speicherdienst (Cloudflare Worker + D1) sieht nur unlesbaren Datensalat. Automatischer Abgleich, Konflikterkennung, Offline-Änderungen werden nachgereicht.
- **Vorlagen bearbeitbar:** Jede Vorlage per ✎ ändern. „Zählt als“ 0, ½ oder 1 Tag; 1 Tag macht einen Feiertag zum Arbeitstag. Fester Urlaub auch als einzelner oder halber Tag (vormittags/nachmittags) oder ganzer Tag, der nur ½ zählt.
- **Halbe Urlaubstage** beim Eintragen (vormittags/nachmittags).
- **Personen-Tags:** Auswahl, für wen ein Urlaub gilt, über Tags in „Urlaub eintragen“ und in Vorlagen; Häkchen in der Haushalt-Karte entfernt.

## v1.0 – 2026-10-10

- Jahreskalender im Stil von schulferien.org mit Feiertagen aller Bundesländer und Schulferien.
- Mehrere Personen im Haushalt mit eigenem Urlaubsanspruch.
- Urlaub eintragen per Datum oder Klick/Ziehen im Kalender.
- Urlaubsvorschlag mit Brückentagen (Optimierer).
- Vorlagen: feste Zeiträume, halbe Tage, Brauchtumstage wie Rosenmontag.
- Installierbar als App (PWA), offline nutzbar, Druckansicht.
- Daten nur im Browser.
