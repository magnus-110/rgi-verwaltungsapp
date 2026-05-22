## Ziel

Beim ersten Öffnen des Kassenprüfungs-Links sieht der Prüfer eine kurze, freundliche Einführung, die erklärt, wie die Prüfung abläuft und was sich hinter jeder Unterseite verbirgt. Danach kann er normal weiterarbeiten; die Erklärung lässt sich jederzeit erneut über einen Info-Button öffnen.

## Umfang

- Nur Frontend / UI – keine Änderung an Logik, Daten oder Edge Functions.
- Wirkt im Token-Modus (`/kassenpruefung/:token`) sowie im Owner-Portal-Modus. In der Admin-Vorschau optional.

## Neue Komponente

`src/components/finance/CashAuditIntroDialog.tsx`

- Modal (Dialog) im RGI-Stil mit Header, scrollbarem Inhalt, „Verstanden, los geht's"-Button.
- Inhalt in 4 kompakten Abschnitten mit passenden lucide-Icons:

  1. **Willkommen & Ablauf** – Kurz: „Sie prüfen die Kasse der WEG XY für das Wirtschaftsjahr ZZZZ. Arbeiten Sie sich Schritt für Schritt durch die Tabs. Ihre Eingaben werden automatisch gespeichert."
  2. **Die Tabs im Überblick**
     - *Kontenblätter*: Salden + Einzelbuchungen je Konto, zum systematischen Abhaken.
     - *Buchungsjournal*: Chronologische Liste aller Buchungen mit Such-/Monatsfilter.
     - *Dokumente*: Bankauszüge, Rechnungen, Verträge zum Quervergleich.
     - *Hinweise des Verwalters*: Vorab-Notizen zu Besonderheiten des Jahres.
  3. **So prüfen Sie eine Buchung**
     - Klick auf eine Buchung (im Journal oder Kontenblatt) öffnet die Detailansicht.
     - Dort sehen Sie automatisch die **verknüpfte Rechnung** (PDF-Vorschau) oder die **verknüpfte Buchungsvorlage**.
     - Mit den Buttons „✓ Geprüft" oder „⚠ Auffällig" markieren; Notiz optional.
  4. **Was sind Vorlagen, und warum gibt es Buchungen ohne Beleg?**
     - **Buchungsvorlage = wiederkehrende Zahlung** (z. B. Hausmeister, Versicherung, Müllgebühr). Hier gibt es nicht zu jeder Einzelzahlung eine neue Rechnung – die Vorlage dient als „Vertrags-Beleg" und definiert Betrag/Intervall.
     - **Interne Buchungen ohne Beleg**: Umbuchungen zwischen Konten (z. B. Heizkostenumlage, Abgrenzungen, Eröffnungs-/Schlussbilanz, Bank↔Kasse). Dafür ist kein externer Beleg nötig.
     - Hinweis: Auffällig sind in der Regel nur Buchungen, bei denen weder Rechnung noch Vorlage noch eine plausible interne Begründung existiert.

- Footer: Checkbox „Beim nächsten Öffnen nicht mehr automatisch anzeigen" (Default an) + Button „Verstanden".

## Integration in `CashAuditWizard.tsx`

- Neuer State `showIntro`.
- Beim Mount: Wenn `localStorage[`cash-audit-intro-seen-${auditId}`]` nicht gesetzt ist → `showIntro = true`. Beim Schließen mit aktiver Checkbox flag setzen.
- Im Header (neben dem bestehenden Info-Icon) ein Button „Anleitung" (Icon `HelpCircle`) ergänzt, der das Modal jederzeit erneut öffnet.
- Dialog wird nur gerendert, wenn `tokenMode` ODER Owner-Portal-Modus (nicht in der Admin-Review). Praktisch: anzeigen, wenn nicht `CashAuditAdminReview` aktiv – also im Wizard selbst immer erlauben, aber Auto-Open nur außerhalb der Admin-Vorschau.

## Technische Details

- Verwendet bestehende shadcn-Komponenten: `Dialog`, `Button`, `Checkbox`, `ScrollArea`, `Separator`.
- Nur semantische Tailwind-Tokens (keine harten Farben).
- Texte auf Deutsch, kurz, mit fett gesetzten Schlüsselbegriffen.
- Keine neuen Pakete, keine DB-Änderungen.

## Geänderte / neue Dateien

- **Neu:** `src/components/finance/CashAuditIntroDialog.tsx`
- **Edit:** `src/components/finance/CashAuditWizard.tsx` (Import, State, Auto-Open-Effect, Header-Button, Render)
