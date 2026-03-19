

# Expanded Contact View: Untertabs statt einer langen Liste

## Problem
Beim Ausklappen einer Person im Gebäude-Hub wird alles untereinander angezeigt (Kontaktdaten, Bankverbindung, Einheitsdaten, Anteile, Kosten, Notizen). Das ist unübersichtlich.

## Lösung
Den expanded-Bereich in Tabs aufteilen:

| Tab | Inhalt |
|-----|--------|
| **Übersicht** | Kontaktdaten (Telefon, E-Mail, Adresse) + Einheitsdaten (Nr., Lage, Nutzungsart, seit) + Beirat-Checkbox + Notizen |
| **Anteile** | Verteilerschlüssel (MEA, qm, etc.) mit Add/Edit/Delete |
| **Kosten** | Hausgeld, Rücklage, etc. mit Add/Edit/Delete |
| **Bank** | Bankverbindungen als kopierbare Felder (IBAN, BIC, Bank, Kontoinhaber, SEPA-Ref) |

## Technische Details

**Datei: `src/components/contacts/BuildingContactsList.tsx`**

- Import `Tabs, TabsList, TabsTrigger, TabsContent` aus `@/components/ui/tabs`
- Den gesamten expanded-Block (Zeilen 282-496) in eine `<Tabs defaultValue="overview">` Struktur wrappen
- Kompakte TabsList mit kleinen Triggern (`text-xs`, `h-7`)
- Jeder bisherige Abschnitt wandert in seinen eigenen `TabsContent`
- State für aktiven Tab pro Person wird nicht benötigt (Tabs-Komponente verwaltet das intern)

