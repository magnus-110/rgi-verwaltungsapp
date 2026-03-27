

# Plan: Versammlungen für Eigentümer sichtbar machen + PDF-Einladung mit Live-Editor

## Problem 1: Versammlungen nicht sichtbar für Eigentümer

Die RLS-Policy auf `etv_meetings` prüft den Zugang über `contact_building_assignments` + `contacts`, aber das Owner-Portal nutzt `weg_owner_buildings`. Wenn ein Eigentümer keinen passenden Eintrag in `contact_building_assignments` hat (oder der `contacts`-Eintrag keine `user_id` hat), schlägt die RLS-Prüfung fehl.

**Lösung:** Neue Migration, die die bestehende RLS-Policy für `etv_meetings` und `etv_agenda_items` erweitert, sodass auch Eigentümer über `weg_owner_buildings` Zugriff erhalten.

```sql
-- Erweiterte Policy: Zugriff über weg_owner_buildings ODER contact_building_assignments
DROP POLICY "WEG owners can view their building meetings" ON public.etv_meetings;
CREATE POLICY "WEG owners can view their building meetings" ON public.etv_meetings
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.weg_owner_buildings wob
      WHERE wob.building_id = etv_meetings.building_id
        AND wob.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.contact_building_assignments cba
      JOIN public.contacts c ON c.id = cba.contact_id
      WHERE cba.building_id = etv_meetings.building_id
        AND c.user_id = auth.uid()
    )
  );
```

Gleiches für `etv_agenda_items`.

## Problem 2: PDF statt HTML + Live-Editing

### Neues Konzept für `MeetingInvitationPdf.tsx`

Die Vorschau wird zu einem **Live-Editor**, in dem der Admin Texte direkt bearbeiten kann, bevor ein echtes PDF generiert wird.

**Bearbeitbare Felder:**
- Begrüßungstext (vorausgefüllt mit Standardtext)
- Schlusstext / Hinweise (z.B. Vollmachts-Hinweis)
- Freies Textfeld für zusätzliche Informationen

**UI-Aufbau:**
- Klick auf "Vorschau & Bearbeiten" öffnet einen Dialog im A4-Format
- Links/oben: Bearbeitbare Textfelder, die direkt im Brief-Layout eingebettet sind (contentEditable oder Textarea-Overlays)
- Der Inhalt wird live im Briefpapier-Design dargestellt
- Button "Als PDF herunterladen" generiert ein echtes PDF clientseitig

**PDF-Generierung:**
- Clientseitig über `window.print()` mit `@media print`-Styles, was ein sauberes PDF über den Browser-Druckdialog erzeugt — oder alternativ über die bestehende HTML-zu-Print-Pipeline
- Alternativ: `html2canvas` + `jspdf` für direkten PDF-Download ohne Druckdialog

### Technische Details

| Datei | Änderung |
|---|---|
| `supabase/migrations/new.sql` | RLS-Policies für `etv_meetings` und `etv_agenda_items` erweitern um `weg_owner_buildings`-Zugang |
| `src/components/meetings/MeetingInvitationPdf.tsx` | Komplett überarbeiten: Bearbeitbare Textfelder im Briefpapier-Layout, PDF-Download via Print-API oder jspdf |

