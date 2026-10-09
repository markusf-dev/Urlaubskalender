# Urlaubskalender

Jahreskalender im Stil der schulferien.org-Druckvorlage (12 Monatsspalten, Feiertage, Schulferien, KW) zur Urlaubsplanung für eine oder mehrere Personen im Haushalt.

Einfach `index.html` im Browser öffnen – kein Build, keine Abhängigkeiten. Daten bleiben lokal im Browser (localStorage).

## Funktionen

- **Haushalt:** beliebig viele Personen mit eigenem Urlaubsanspruch pro Jahr. Einträge und Vorschläge gelten für die angehakten Personen. Im Kalender zeigt je Person ein farbiger Balken den Urlaub. Die Zelle wird blau, wenn alle Ausgewählten frei haben.
- **Urlaub eintragen:** Von/Bis-Datum oder direkt im Kalender klicken bzw. ziehen. Ein Klick auf einen bereits gebuchten Tag entfernt ihn.
- **Urlaub vorschlagen:** verteilt die angegebenen Tage so, dass zusammen mit Wochenenden und Feiertagen möglichst viele freie Tage am Stück entstehen (Stil, max. Anzahl Blöcke, Schulferien meiden/nur in Schulferien). Bei mehreren Personen wird gemeinsamer Urlaub geplant, ohne den Restanspruch einer Person zu überschreiten. Dazu gibt es eine Liste der besten Brückentage.
- **Vorlagen (jedes Jahr):** feste Urlaubszeiträume (z. B. 24.12.–31.12.) und anders angerechnete Tage (½ Tag oder 0 = frei), jeweils für alle oder einzelne Personen.
- Gesetzliche Feiertage werden für alle 16 Bundesländer berechnet (nur landesweite, z. B. nicht Mariä Himmelfahrt in Teilen Bayerns).
- Schulferien kommen von [openholidaysapi.org](https://openholidaysapi.org). Für NRW 2025–2029 sind sie auch offline eingebaut.
- Drucken im A4-Querformat.

## Entwicklung

```
npm test   # Optimierer- und Datumstests (node:test)
```

`js/optimizer.js` arbeitet mit dynamischer Programmierung über Tag × Restbudget (halbe Tage) × Anzahl Blöcke.
