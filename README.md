# Masora Döner — Kasse

Kassensystem für den Imbiss, komplett in **HTML, CSS und JavaScript** gebaut (kein Build, kein Framework).
Alle Daten liegen dauerhaft in **Supabase** — nichts geht beim Neuladen oder Gerätewechsel verloren.

## Funktionen

**Anmeldung**

- PIN-Feld mit Zifferntastatur, auch über die Tastatur bedienbar
- Zwei Rollen: `admin` (alles) und `kasse` (Kasse + Bestellungen)

**Kasse**

- Kategorien als Reiter, Produkte als große Touch-Kacheln
- Warenkorb mit Menge +/−, Einzelposten löschen, komplett leeren
- Rabatte (Prozent oder fester Betrag) aus der Datenbank
- Barzahlung mit Schnellwahl-Beträgen, automatischem Rückgeld und Sperre bei zu wenig Geld
- Kartenzahlung
- Bon im 40-Zeichen-Format, direkt druckbar

**Bestellungen**

- Filter: Heute / 7 Tage / Alle
- Kennzahlen: Umsatz, Anzahl, Ø pro Bon, Bar, Karte
- Bon erneut drucken
- Storno (nur Admin) — der Bon bleibt gespeichert, zählt aber nicht mehr im Umsatz

**Verwaltung (nur Admin)**

- Produkte anlegen, bearbeiten, löschen, aktiv/inaktiv schalten
- Rabatte pflegen
- Personal und PINs pflegen
- Einstellungen: Name, Adresse, Telefon, Steuernummer, MwSt.-Satz, Bon-Fußtext
- Tagesabschluss (Z-Bericht) mit Umsatz, Zahlarten, enthaltener MwSt., Rabatten, Stornos und Artikelstatistik

**Sonstiges**

- Helles und dunkles Design
- Voll bedienbar auf Tablet und Handy

## Struktur

```
index.html        Grundgerüst, Anmeldung, drei Ansichten
css/style.css     Design-System und alle Komponenten
js/db.js          Supabase-Verbindung und Datenzugriff
js/app.js         Zustand, Hilfsfunktionen, Dialoge, Anmeldung, Navigation
js/kasse.js       Kasse, Warenkorb, Zahlung, Bon
js/orders.js      Bestellübersicht, Kennzahlen, Storno
js/admin.js       Verwaltung mit fünf Reitern
favicon.svg       Logo als Symbol
```

## Datenbank

Supabase-Projekt `ldeuoyzuhgpvhznnfxyo`, Tabellen im Schema `public`:

| Tabelle     | Zweck                                                        |
| ----------- | ------------------------------------------------------------ |
| `products`  | Speisekarte inkl. Kategorie, Preis, Sortierung               |
| `discounts` | Rabatte (`percent` oder `fixed`)                             |
| `staff`     | Mitarbeiter mit PIN und Rolle                                |
| `orders`    | Bestellungen mit Positionen als JSON, Summen, Zahlart, Status |
| `settings`  | Einzelne Zeile mit den Imbiss-Stammdaten                     |

## Wichtiger Hinweis zur Sicherheit

Die App läuft ohne Server und spricht Supabase direkt mit dem öffentlichen Key an.
Damit das funktioniert, erlauben die RLS-Regeln dem `anon`-Zugang Lesen und Schreiben.
Wer die Adresse der Seite kennt, kann also theoretisch auf die Daten zugreifen — auch auf die PINs.

Für den Einsatz im echten Betrieb empfiehlt sich eines davon:

1. Seite nur intern erreichbar machen (privater Link, lokales Netz)
2. Supabase Auth einbauen und die RLS-Regeln auf angemeldete Nutzer einschränken
3. PINs als Hash speichern und die Prüfung in eine Supabase Edge Function verlagern

## Start

Es ist kein Build nötig. Ordner auf einen beliebigen Webserver legen oder lokal starten:

```bash
npx serve . -l 3000
```

## Anmeldedaten

| Name    | PIN  | Rolle |
| ------- | ---- | ----- |
| Chef    | 1234 | Admin |
| Kasse 1 | 1111 | Kasse |

PINs bitte unter Verwaltung → Personal ändern.
