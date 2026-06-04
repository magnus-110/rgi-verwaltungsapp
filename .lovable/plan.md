## Befund

Backend ist OK — `etv-render-protocol` liefert sowohl DOCX als auch PDF erfolgreich (HTTP 200 mit signierter URL, geprüft via curl). Das Problem auf der Frontend-Seite ist `window.open(signed_url, "_blank")` nach einer asynchronen Mutation: Browser blocken dieses Popup, weil es nicht direkt aus einer User-Gesture stammt. Fix: Datei als Blob fetchen und über versteckten `<a download>` klicken.

## Was umgebaut wird

### 1. Protokoll-Vorschau im RGI-Design (statt iframe-HTML)

Die jetzige iframe-Vorschau (Segoe UI, generisches HTML) wird durch eine native React-Komponente ersetzt, die sich am App-Design orientiert (shadcn Card, Tailwind, semantische Tokens, Primary-Akzent orange wie der Rest der App). Aufbau:

```text
┌─────────────────────────────────────────────────────┐
│  Protokoll der Eigentümerversammlung                │  ← H1, Primary-Akzent, Border-Bottom
│  WEG Achweg 3-5 · Memmingen                         │  ← Muted
├─────────────────────────────────────────────────────┤
│  ┌─ Eckdaten ──────────────────────────────┐        │
│  │ Datum         04.06.2026                │        │  ← Definition-List
│  │ Beginn / Ende 15:00 / 18:30 Uhr         │        │
│  │ Ort           Vereinsheim Memmingen     │        │
│  │ Leitung       Andreas Göttinger         │        │
│  │ Protokoll     Max Mustermann            │        │
│  └─────────────────────────────────────────┘        │
│                                                     │
│  Anwesenheit                                        │
│  Von insgesamt 1.000,000 Tausendstel waren …        │
│                                                     │
│  ─────────────────────────────────────────          │
│  TOP 1 · Verwalterwechsel                           │  ← H2, klein orange Pill mit "TOP 1"
│  [Beschreibung / Fließtext]                         │
│  ┌─ Beschluss ─────────────────────────────┐        │
│  │ Die Eigentümer beschließen …            │        │
│  │ ──────────────────                      │        │
│  │ Abstimmung: nach MEA                    │        │
│  │ Ja 146,000 · Nein 0,000 · Enth. 0,000   │        │  ← Tabular, monospace Zahlen
│  │ ✓ Angenommen                            │        │  ← grünes Badge bei passed, rot bei failed
│  └─────────────────────────────────────────┘        │
│  Notizen: …                                         │  ← nur wenn vorhanden, kursiv muted
│                                                     │
│  TOP 2 · …                                          │
│  …                                                  │
│                                                     │
│  Die Versammlung wurde um 18:30 Uhr geschlossen.    │
│                                                     │
│  ─────────────────────────────────────────          │
│  Unterschriften                                     │
│  ┌──────────────┬──────────────┬──────────────┐     │
│  │ Eigentümer   │ Vers.-leiter │ Protokollf.  │     │  ← REAL SignaturePads, eingebettet
│  │ [Pad 120px]  │ [Pad 120px]  │ [Pad 120px]  │     │     im Vorschau-Bereich (nicht
│  │ Name: ____   │ Name: ____   │ Name: ____   │     │     mehr als separate Karte)
│  └──────────────┴──────────────┴──────────────┘     │
└─────────────────────────────────────────────────────┘
```

Datenbasis: alles aus `meeting`, `agendaItems`, `attendees` (die Queries existieren bereits) — kein Rückgriff mehr auf den unformatierten `protocol_text`-Blob für die Anzeige. Das KI-generierte `protocol_text` bleibt aber als optionale Einleitung/Fallback erhalten (wenn man es z. B. als Intro-Absatz zeigt).

### 2. Unterschriften direkt in den Vorschau-Bereich

`ProtocolSignaturesInline` wird in den Protokoll-Container am Ende eingerückt (keine separate Karte mehr, kein extra Header). Die alten gezeichneten Striche „___ Versammlungsleiter / Protokollführer" in der iframe-HTML entfallen komplett (sie waren ja gerade die störenden Striche aus dem Screenshot).

### 3. Vollbild-Modus

Gleiche React-Vorschau, nur in einem `Dialog` mit `max-w-5xl` und `h-[95dvh]` und schmalerem horizontalem Padding. Renderfunktion ist eine reine Komponente, daher problemlos wiederverwendbar.

### 4. Fix Download-Buttons (PDF/DOCX)

`ProtocolDownloadButtons.tsx`: statt `window.open()` nach Mutation jetzt:

```ts
const res = await fetch(signed_url);
const blob = await res.blob();
const url = URL.createObjectURL(blob);
const a = document.createElement("a");
a.href = url;
a.download = `${baseName}.${ext}`;
document.body.appendChild(a);
a.click();
a.remove();
URL.revokeObjectURL(url);
```

Das löst zuverlässig den Datei-Download aus, ohne Popup-Blocker. Toast „PDF / DOCX heruntergeladen" als Bestätigung.

## Dateien

- **Neu** `src/components/meetings/ProtocolReadableView.tsx` — die strukturierte RGI-Design-Vorschau-Komponente (Eckdaten, Anwesenheit, TOPs mit Beschluss-Cards, Schlusssatz, eingebettete Unterschriften am Fuß)
- **Edit** `src/components/meetings/MeetingProtocol.tsx` — iframe + alte HTML-Generierung raus, `ProtocolReadableView` rein (sowohl inline als auch im Vollbild-Dialog); `ProtocolSignaturesInline` wird *in* die Readable-View gerendert, nicht mehr als separate Sektion
- **Edit** `src/components/meetings/ProtocolDownloadButtons.tsx` — Blob-Download statt `window.open`
- **Löschen** `generateProtocolHtml()` in `MeetingProtocol.tsx` (nicht mehr nötig)

## Nicht Teil dieses Plans

- Backend / Edge Function bleibt unangetastet (funktioniert bereits)
- Word-Vorlage und docxtemplater-Render-Pipeline unverändert (die ist für den Final-Output ohnehin separat)
- KI-Protokoll-Generierung unverändert
