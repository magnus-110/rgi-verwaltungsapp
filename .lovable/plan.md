## Ziel

Protokoll-System radikal vereinfachen: Das Protokoll entsteht direkt aus den im Editor vorbereiteten TOPs (Beschreibung + optional Beschlussantrag + Abstimmungsergebnis + Notizen). Kein KI-Fließtext, keine 30 Platzhalter, keine Anwesenheitsliste pro Person — nur das, was real im RGI-Protokoll steht.

## Neues Vorlagen-Schema (schlank)

**Kopf / Stammdaten**
- `{weg.name}` – z.B. "Birkenweg 13, Pfronten"
- `{versammlung.datum}` – "27.02.2026"
- `{versammlung.ort}` – "Gasthof Aggenstein - Tiroler Str. 124, 87459 Pfronten"
- `{versammlung.beginn}` / `{versammlung.ende}` – "17:00 Uhr" / "20:00 Uhr"
- `{versammlung.leitung}` – Name Versammlungsleitung
- `{versammlung.protokollfuehrer}` – Name Protokollführer
- `{versammlung.anwesenheit_text}` – fertig formatierter Satz "Von insgesamt 1000,000 Tausendstel waren 1000,000 Tausendstel anwesend." (+ optional "Es waren alle Tausendstel anwesend.")

**TOP-Loop** `{#tops} … {/tops}` mit Feldern:
- `{nummer}` – "1", "2", …
- `{titel}` – "Eröffnung der Eigentümerversammlung"
- `{text}` – kompletter vorbereiteter Beschreibungstext aus dem TOP-Editor (mehrzeilig, inkl. Unterpunkten)
- `{#hat_beschluss}` … `{/hat_beschluss}` – Block nur rendern wenn Beschlussantrag existiert
  - `{beschluss_text}` – Wortlaut des Antrags
  - `{abstimmung_methode}` – "Die Abstimmung erfolgte nach Anteilen (MEA)." (oder Kopfprinzip-Variante)
  - `{ja}` / `{nein}` / `{enthaltung}` – formatiert "1.000,000"
  - `{ergebnis_satz}` – "Der Beschluss wurde einstimmig angenommen und verkündet." / "mehrheitlich angenommen" / "abgelehnt"
- `{#hat_notizen}` `{notizen}` `{/hat_notizen}` – nur wenn admin_notes vorhanden

**Schluss**
- `{schlusssatz}` – "Die Verwaltung bedankt sich … und beendet die Versammlung um 20:00 Uhr."
- `{ort_datum}` – "Pfronten, 27.02.2026"

**Unterschriften** (PNG-Felder via pdf-lib im finalize-Schritt)
- Versammlungsleitung, Protokollführer, Beirat, Eigentümer (1 Eigentümer-Unterschrift, wie in der Vorlage)

## Was rausfliegt

- KI-Generierung (`{ki.*}`, `{einleitung}`, `{ki_protokoll_volltext}`) → nicht benötigt, Inhalte stehen in den TOPs
- Anwesenheitsloop `{#anwesende}` mit Einzeleinträgen → ersetzt durch einen Anwesenheits-Summary-Satz
- `{liegenschaft.plz/ort/einheiten_anzahl/mea_gesamt}`, `{verwaltung.*}`, `{rollen.*}`, separater `{#beschluesse}`-Loop, `{versammlung.titel/uhrzeit_beginn/uhrzeit_ende/art/einladungs_datum/beschlussfaehig/quorum_text}` → alles raus
- `etv-render-protocol` Payload-Builder entsprechend abspecken

## Umsetzung

1. **`supabase/functions/etv-render-protocol/index.ts`** — Payload-Builder neu schreiben: nur noch die oben gelisteten Felder, TOPs aus `etv_agenda_items` sortiert (sort_order) mit `description` → `text`, `resolution_text` → `beschluss_text`, `yes/no/abstain_count` → Stimmen, `admin_notes` → `notizen`. Hilfs-Funktion `formatMea(n)` (de-DE 3 Nachkommastellen), `buildErgebnisSatz()` (einstimmig vs. mehrheitlich vs. abgelehnt anhand Stimmen).
2. **`ProtocolTemplatesTab.tsx`** — Platzhalter-Hilfe (Help-Sheet/Akkordeon) auf die neue, schlanke Liste reduzieren mit Beispielen.
3. **Neue `.docx`-Vorlage `ETV_Protokoll_Vorlage_v2.docx`** generieren, die das echte RGI-Layout nachbaut: 
   - Kopfzeile "RGI IMMOBILIEN – Verkauf · Vermietung · Verwaltung"
   - Titel "Protokoll zur Eigentümerversammlung der Eigentümergemeinschaft {weg.name}"
   - Block Datum/Ort/Beginn/Ende/Leitung/Protokollführer/Anwesenheit
   - `{#tops}`-Schleife mit "TOP {nummer} - {titel}", `{text}`, bedingter Beschluss-Block (Beschlussantrag-Wortlaut + Abstimmungsergebnis-Zeilen + Ergebnissatz), bedingter Notizen-Block
   - Schlusssatz, Ort/Datum, vier Unterschriftsfelder
4. **`MeetingProtocol.tsx`** — sicherstellen, dass die TOP-Beschreibung (`description`) das Hauptfeld für den Fließtext ist (kleines UI-Hinweis-Label "Dieser Text erscheint 1:1 im Protokoll").
5. **KI-Erzeugung** (`generate-meeting-protocol`-Aufruf in MeetingProtocol) optional belassen, aber Hinweis: dient nur als Entwurf für `description`, fließt nicht mehr direkt in die Vorlage.

## Deliverables

- Aktualisierte Edge Function + Templates-Tab
- Neue `ETV_Protokoll_Vorlage_v2.docx` als Download
- Kurze Platzhalter-Liste (1 Seite) zum Weitergeben an Claude für künftige Vorlagen-Varianten

Soll ich so umsetzen?
