# Urlaubskalender

Ein Jahreskalender für die Urlaubsplanung im Haushalt. Er sieht aus wie der bekannte Kalender zum Ausdrucken von schulferien.org: zwölf Monatsspalten, Feiertage, Schulferien und Kalenderwochen auf einen Blick. Dazu plant er deinen Urlaub und schlägt die besten Brückentage vor.

**Zur App: https://markusf-dev.github.io/Urlaubskalender/**

Die App läuft komplett im Browser. Es gibt kein Konto, keinen Server und keine Kosten. Deine Daten verlassen dein Gerät nur, wenn du selbst eine Datendatei in einem Cloud-Ordner anlegst (siehe [Gemeinsam planen](#gemeinsam-planen)).

## Was die App kann

- **Jahresübersicht:** Gesetzliche Feiertage für alle 16 Bundesländer und die Schulferien des gewählten Bundeslands. Wochenenden und Feiertage sind rot, Schulferien grün markiert.
- **Mehrere Personen:** Lege alle im Haushalt an, jede Person mit eigenem Urlaubsanspruch. Bei jedem Eintrag wählst du, für wen er gilt: für eine Person, mehrere oder alle. Im Kalender zeigt ein farbiger Balken, wer an welchem Tag frei hat.
- **Urlaub eintragen:** Wähle Von und Bis, oder klicke direkt in den Kalender. Mit gedrückter Maustaste markierst du mehrere Tage. Ein erneuter Klick auf einen Urlaubstag entfernt ihn wieder. Die App zählt die verbrauchten und übrigen Urlaubstage pro Person mit.
- **Urlaub vorschlagen:** Gib an, wie viele Tage du verplanen möchtest. Die App verteilt sie so, dass zusammen mit Wochenenden und Feiertagen möglichst viele freie Tage am Stück entstehen. Du kannst wählen:
  - den Stil: lange Wochenenden, ausgewogen oder wenige lange Urlaube
  - die maximale Anzahl der Urlaubsblöcke
  - ob Schulferien egal sind, gemieden werden oder ob nur in den Schulferien geplant wird

  Für mehrere Personen sucht die App gemeinsamen Urlaub, ohne den Restanspruch einer Person zu überschreiten. Zusätzlich listet sie die besten Brückentage auf. Jeder Vorschlag lässt sich mit einem Klick übernehmen.
- **Vorlagen:** Regeln, die jedes Jahr gelten, jeweils für alle oder einzelne Personen:
  - fester Urlaub, z. B. 24.12.–31.12.
  - Tage, die nur halb zählen, z. B. Heiligabend und Silvester
  - Brauchtumstage wie Rosenmontag als freier Tag, der nicht vom Urlaub abgeht
- **Drucken:** Der Kalender passt auf eine A4-Seite im Querformat.
- **Offline:** Einmal installiert, funktioniert die App auch ohne Internet.

## Installation

Die App ist eine Web-App. Du kannst sie im Browser nutzen oder wie eine normale App installieren. Dann bekommt sie ein eigenes Symbol, öffnet sich im eigenen Fenster und läuft offline.

### iPhone und iPad
1. https://markusf-dev.github.io/Urlaubskalender/ in **Safari** öffnen.
2. Unten auf das **Teilen**-Symbol tippen (Quadrat mit Pfeil nach oben).
3. **„Zum Home-Bildschirm“** wählen und mit **„Hinzufügen“** bestätigen.

### Android
1. Die Adresse in **Chrome** öffnen.
2. Oben rechts das Menü **⋮** öffnen.
3. **„App installieren“** oder **„Zum Startbildschirm hinzufügen“** wählen.

### Mac
- **Chrome oder Edge:** In der Adressleiste rechts auf das Installieren-Symbol (Bildschirm mit Pfeil) klicken. Alternativ im Menü **⋮ → „Streamen, speichern und teilen“ → „Seite als App installieren“** wählen.
- **Safari** (ab macOS Sonoma): Menü **Ablage → „Zum Dock hinzufügen“**.

Für das [gemeinsame Planen über eine Datei](#gemeinsam-planen) brauchst du Chrome oder Edge.

### Windows
In **Chrome oder Edge** rechts in der Adressleiste auf das Installieren-Symbol klicken. Bei Edge findest du es auch über das Menü **… → Apps → „Diese Website als App installieren“**.

### Updates
Neue Versionen lädt die App beim Start im Hintergrund. Sie sind ab dem nächsten Öffnen aktiv.

## Erste Schritte

1. Links oben das **Jahr** und dein **Bundesland** wählen.
2. Unter **Haushalt** den Namen anpassen und den Urlaubsanspruch eintragen. Mit **„+ Person hinzufügen“** kommen weitere Personen dazu.
3. Unter **Vorlagen** prüfen, ob die Voreinstellungen passen. Ab Werk gelten Heiligabend und Silvester als halbe Tage, und vom 24.12. bis 31.12. ist Urlaub eingetragen. Unpassende Vorlagen kannst du abhaken oder löschen.
4. Feste Urlaube eintragen, z. B. den Sommerurlaub.
5. Unter **Urlaub vorschlagen** die restlichen Tage verteilen lassen.

Mit **«** oben links klappst du die Seitenleiste ein, wenn du nur den Kalender sehen willst.

## Daten und Sicherung

Ohne weitere Einstellung speichert die App alles nur im Browser des jeweiligen Geräts. Andere Geräte und Personen sehen deine Einträge dann nicht.

Ganz unten in der linken Leiste findest du die **Einstellungen**:
- **Datenablage:** Mit **„Ordner wählen …“** öffnet sich der Finder bzw. Explorer, und du wählst einen Ordner aus. Die App legt dort die Datei `urlaubskalender.json` an und speichert jede Änderung sofort. In der Datei steht der komplette Plan mit allen Einstellungen: Bundesland, Personen, Urlaubsanspruch, Urlaube, Vorlagen und Vorschlagseinstellungen. Das funktioniert nur in **Chrome und Edge auf dem Computer**.
- **Exportieren / Importieren:** Speichert den Plan als Datei oder lädt ihn wieder, z. B. als Sicherung oder für ein anderes Gerät. Das klappt in jedem Browser, auch auf dem iPhone.

Wo der Plan gerade liegt, steht immer oben links unter dem Bundesland, z. B. **„💾 Ablage: Familie › urlaubskalender.json“**. Ein Klick darauf springt zu den Einstellungen.

**Merkt sich der Browser den Ordner?** Ja. Er speichert den Verweis auf den Ordner und verbindet sich beim nächsten Start automatisch. Nach einem Neustart fragt Chrome bzw. Edge eventuell einmal nach Zugriff. Dann wird die Ablage-Zeile orange, und du klickst in den Einstellungen auf **„Zugriff erlauben“**. In der installierten App bietet Chrome dabei meist **„Bei jedem Besuch zulassen“** an. Danach fragt der Browser nicht mehr. Aus Sicherheitsgründen sieht die App nur den Ordnernamen, nicht den vollständigen Pfad.

## Gemeinsam planen

Damit alle im Haushalt denselben Plan sehen und bearbeiten können:

1. Einen Ordner in **iCloud Drive, Dropbox oder OneDrive** mit allen im Haushalt teilen. Alle müssen ihn auf ihrem Computer synchronisieren.
2. Die erste Person wählt in den Einstellungen **„Ordner wählen …“** und diesen Ordner. Die App legt darin den Plan an.
3. Alle anderen wählen ebenfalls **„Ordner wählen …“** und denselben Ordner. Die App erkennt den vorhandenen Plan und fragt, ob sie ihn verwenden soll.
4. Ab jetzt erscheinen die Änderungen der anderen nach ein paar Sekunden, sobald der Cloud-Dienst abgeglichen hat.

Gut zu wissen:
- **Pro Gerät:** Welches Jahr du gerade ansiehst, wer angehakt ist und ob die Seitenleiste eingeklappt ist, bleibt auf deinem Gerät.
- **Gleichzeitige Änderungen:** Ändern zwei Personen fast gleichzeitig etwas, gilt der zuerst gespeicherte Stand. Die andere Person bekommt einen Hinweis und wiederholt ihre Änderung. Es wird nichts still überschrieben.
- **iPhone, Safari und Firefox:** Diese Browser können keinen Ordner dauerhaft verknüpfen. Dort gleichst du per Export und Import ab.

### Mehrere Haushalte, ganz ohne Konten

Alle nutzen dieselbe App unter derselben Adresse, aber jeder Haushalt hat seinen eigenen Plan in seinem eigenen Ordner. Das GitHub-Projekt enthält nur den Programmcode, keine Daten. Es gibt keinen Server, der Pläne speichert, und deshalb auch keine Benutzerkonten. Wer einen Plan sehen darf, regelt die Ordnerfreigabe beim Cloud-Anbieter: Wer den Ordner nicht geteilt bekommt, sieht den Plan nicht.

## Datenquellen

- **Feiertage:** Die App berechnet sie selbst. Sie kennt nur Feiertage, die im ganzen Bundesland gelten, also z. B. nicht Mariä Himmelfahrt in Teilen Bayerns. Solche Tage kannst du als Vorlage ergänzen.
- **Schulferien:** Sie kommen von [openholidaysapi.org](https://openholidaysapi.org). Für NRW 2025–2029 sind sie zusätzlich fest eingebaut, damit sie auch offline verfügbar sind.

## Entwicklung

Reines HTML, CSS und JavaScript ohne Build und ohne Abhängigkeiten. Lokal reicht es, `index.html` im Browser zu öffnen. Für Service Worker und Datenablage braucht es einen lokalen Server, z. B. `python3 -m http.server`.

```
npm test   # Tests für Optimierer und Datumsberechnung (node:test)
```

| Datei | Inhalt |
| --- | --- |
| `js/dates.js` | Datumsfunktionen, Feiertage, Brauchtumstage |
| `js/school.js` | Schulferien (API und Offline-Daten) |
| `js/optimizer.js` | Urlaubsvorschlag: dynamische Programmierung über Tag × Restbudget (halbe Tage) × Anzahl Blöcke |
| `js/storage.js` | Datenablage im gewählten Ordner (File System Access API) |
| `js/app.js` | Oberfläche und Zustand |
| `sw.js` | Offline-Unterstützung |

Nach Änderungen an Dateien die Version `CACHE` in `sw.js` erhöhen, damit installierte Apps die neue Version laden.

Die App wird über GitHub Pages aus dem Branch `main` veröffentlicht.

## Lizenz

MIT, siehe [LICENSE](LICENSE).
