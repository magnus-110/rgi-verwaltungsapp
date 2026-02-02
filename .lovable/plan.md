

# To-Do-Verwaltung: Erweiterter Implementierungsplan

## Zusammenfassung der zusätzlichen Features

| Feature | Beschreibung |
|---------|--------------|
| Wiederkehrende Aufgaben | Diskret integriert, nicht prominent |
| Unteraufgaben/Checklisten | Für Ersteller UND Bearbeiter |
| Datei-Upload | Anhänge an Aufgaben |
| Optionale Zuweisung | Verantwortlicher nicht Pflicht |
| Professioneller Export | PDF mit Logo, Filtereinstellungen, kundengerecht |

---

## Datenbankstruktur (erweitert)

### 1. `todo_categories` - Frei definierbare Kategorien
```sql
CREATE TABLE todo_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  color TEXT DEFAULT '#6B7280',
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES profiles(user_id)
);
```

### 2. `todos` - Haupttabelle (erweitert)
```sql
CREATE TABLE todos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_number SERIAL,
  title TEXT NOT NULL,
  description TEXT,
  
  -- Kategorisierung
  category_id UUID REFERENCES todo_categories(id),
  
  -- Zuweisung (OPTIONAL - kann NULL sein)
  assigned_to UUID REFERENCES profiles(user_id), -- NULL erlaubt!
  created_by UUID NOT NULL REFERENCES profiles(user_id),
  
  -- Zeitangaben
  due_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  
  -- Status und Priorität
  priority TEXT NOT NULL DEFAULT 'medium' 
    CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'open' 
    CHECK (status IN ('open', 'in_progress', 'done')),
  
  -- Gebäudebezug (optional)
  building_id UUID REFERENCES buildings(id),
  
  -- Dateianhänge (JSONB-Array)
  attachments JSONB DEFAULT '[]'::jsonb,
  
  -- Wiederkehrend (NEU - diskret)
  is_recurring BOOLEAN DEFAULT false,
  recurrence_pattern TEXT, -- 'daily', 'weekly', 'monthly', 'yearly'
  recurrence_interval INTEGER DEFAULT 1, -- z.B. alle 2 Wochen
  recurrence_end_date DATE, -- Wann endet die Wiederholung
  parent_todo_id UUID REFERENCES todos(id), -- Verknüpfung zur Original-Aufgabe
  next_occurrence_date DATE -- Wann ist die nächste Instanz fällig
);
```

### 3. `todo_subtasks` - Unteraufgaben/Checklisten (NEU)
```sql
CREATE TABLE todo_subtasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  todo_id UUID NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  is_completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES profiles(user_id),
  created_by UUID NOT NULL REFERENCES profiles(user_id),
  created_at TIMESTAMPTZ DEFAULT now(),
  sort_order INTEGER DEFAULT 0
);
```

### 4. `todo_comments` - Kommentare
```sql
CREATE TABLE todo_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  todo_id UUID NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES profiles(user_id),
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### RLS-Policies
```sql
-- Alle 4 Tabellen: Admins und Mitarbeiter haben vollen Zugriff
ALTER TABLE todos ENABLE ROW LEVEL SECURITY;
ALTER TABLE todo_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE todo_subtasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE todo_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and employees can manage todos"
ON todos FOR ALL USING (user_has_admin_access(auth.uid()));

CREATE POLICY "Admins and employees can manage categories"
ON todo_categories FOR ALL USING (user_has_admin_access(auth.uid()));

CREATE POLICY "Admins and employees can manage subtasks"
ON todo_subtasks FOR ALL USING (user_has_admin_access(auth.uid()));

CREATE POLICY "Admins and employees can manage comments"
ON todo_comments FOR ALL USING (user_has_admin_access(auth.uid()));
```

### Neuer Storage Bucket
```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('todo-attachments', 'todo-attachments', false);

-- RLS für Storage
CREATE POLICY "Admins and employees can manage todo attachments"
ON storage.objects FOR ALL
USING (bucket_id = 'todo-attachments' AND user_has_admin_access(auth.uid()));
```

---

## UI-Komponenten

### 1. Hauptseite: `/todos`

```text
+------------------------------------------------------------------+
| Aufgaben                            [+ Neue Aufgabe] [Exportieren]|
+------------------------------------------------------------------+
| Filter:                                                           |
| [Suche...        ] [Verantwortlich v] [Kategorie v] [Priorität v]|
| [Status v]  [Fälligkeit: Von ___ Bis ___]           [Sortieren v]|
+------------------------------------------------------------------+
|                                                                   |
| OFFENE AUFGABEN (12)                                              |
| +---------------------------------------------------------------+ |
| | #42 | [DRINGEND] | Heizungswartung | Max M.  | Fällig: 05.02  | |
| |     |    [!]     |                 |         | [ÜBERFÄLLIG]   | |
| | Checkliste: 2/5 erledigt                        [v] Ausklappen | |
| +---------------------------------------------------------------+ |
|                                                                   |
| IN BEARBEITUNG (3)                                                |
| +---------------------------------------------------------------+ |
| | #38 | [MITTEL] | Treppenhausreinigung | - | Fällig: 10.02    | |
| | Checkliste: 0/3 erledigt                        [v] Ausklappen | |
| +---------------------------------------------------------------+ |
|                                                                   |
| ERLEDIGT                                               [Einblenden]|
| +---------------------------------------------------------------+ |
| | 45 erledigte Aufgaben (eingeklappt)                           | |
| +---------------------------------------------------------------+ |
+------------------------------------------------------------------+
```

### 2. Aufgaben-Karte (ausgeklappt)

```text
+------------------------------------------------------------------+
| #42 | [DRINGEND] | Heizungswartung planen              [Bearbeiten]|
+------------------------------------------------------------------+
| Beschreibung:                                                     |
| Die jährliche Heizungswartung für alle WEG-Gebäude muss          |
| koordiniert werden.                                               |
|                                                                   |
| Kategorie: Technik           Verantwortlich: Max Mustermann       |
| Erstellt: 01.02.2025         Fällig: 05.02.2025 [ÜBERFÄLLIG]     |
| Gebäude: WEG Musterstr. 1    🔄 Wiederholt sich: Jährlich        |
|                                                                   |
| CHECKLISTE (2/5)                                   [+ Hinzufügen] |
| +-------------------------------------------------------------+  |
| | [x] Angebote einholen                          (Anna S.)    |  |
| | [x] Termine abstimmen                          (Max M.)     |  |
| | [ ] Techniker beauftragen                                   |  |
| | [ ] Termine an Eigentümer kommunizieren                     |  |
| | [ ] Abnahme durchführen                                     |  |
| +-------------------------------------------------------------+  |
|                                                                   |
| ANHÄNGE (2)                                        [+ Hochladen]  |
| +-------------------------------------------------------------+  |
| | 📄 Angebot_HeizGmbH.pdf (245 KB)                [Öffnen] [x] |  |
| | 📷 Heizungsraum_Foto.jpg (1.2 MB)               [Öffnen] [x] |  |
| +-------------------------------------------------------------+  |
|                                                                   |
| KOMMENTARE (3)                                                    |
| +-------------------------------------------------------------+  |
| | Anna S. (02.02.): Angebot von HeizGmbH eingeholt - 1.250€   |  |
| | Max M. (03.02.): Termin für 07.02. vereinbart               |  |
| | Admin (04.02.): Bitte Eigentümer informieren                |  |
| +-------------------------------------------------------------+  |
| [ Kommentar schreiben...                       ] [Senden]        |
|                                                                   |
| [Status: In Bearbeitung v]                          [Löschen]    |
+------------------------------------------------------------------+
```

### 3. Dialog: Neue Aufgabe erstellen

```text
+--------------------------------------------------+
| Neue Aufgabe erstellen                           |
+--------------------------------------------------+
| Titel*: [_________________________________]      |
|                                                  |
| Beschreibung:                                    |
| [____________________________________]           |
| [____________________________________]           |
|                                                  |
| Kategorie: [Auswählen...              v]         |
|            [+ Neue Kategorie]                    |
|                                                  |
| Verantwortlich: [Optional - Nicht zugewiesen v]  |
|   - (Keine Zuweisung)                            |
|   - Admin Admin                                  |
|   - Max Mustermann (Mitarbeiter)                 |
|                                                  |
| Priorität: [Mittel                   v]          |
|                                                  |
| Fälligkeitsdatum: [Datum wählen       📅]        |
| (optional)                                       |
|                                                  |
| Gebäude: [Optional...                 v]         |
|                                                  |
| ----------------------------------------         |
| ▼ Erweiterte Optionen (diskret)                  |
|   [ ] Wiederkehrende Aufgabe                     |
|       Wiederholung: [Wöchentlich      v]         |
|       Alle: [1] Wochen                           |
|       Endet am: [Datum wählen         📅]        |
| ----------------------------------------         |
|                                                  |
| Checkliste (optional):                           |
| [+ Punkt hinzufügen                          ]   |
| • Schritt 1                              [x]     |
| • Schritt 2                              [x]     |
|                                                  |
| Anhänge:                                         |
| [Dateien auswählen...]                           |
| 📄 Dokument.pdf (245 KB)             [Entfernen] |
|                                                  |
| [Abbrechen]                      [Erstellen]     |
+--------------------------------------------------+
```

### 4. Export-Dialog (professionell)

```text
+--------------------------------------------------+
| Aufgaben exportieren                             |
+--------------------------------------------------+
| Format:                                          |
| (o) PDF (professionell mit Logo)                 |
| ( ) Excel                                        |
|                                                  |
| Aktuelle Filter werden übernommen:               |
| +----------------------------------------------+ |
| | Verantwortlich: Max Mustermann               | |
| | Kategorie: Technik                           | |
| | Status: Offen, In Bearbeitung                | |
| | Zeitraum: 01.01.2025 - 31.01.2025           | |
| +----------------------------------------------+ |
|                                                  |
| [ ] Nur überfällige Aufgaben                     |
| [ ] Checklisten-Details einschließen             |
| [ ] Kommentare einschließen                      |
|                                                  |
| [Abbrechen]                    [Exportieren]     |
+--------------------------------------------------+
```

### 5. Exportiertes PDF (Professionell)

```text
+------------------------------------------------------------------+
|  [RGI LOGO]           AUFGABENÜBERSICHT                          |
|                                                                   |
|  Erstellt am: 05.02.2025                                         |
|  Verantwortlich: Max Mustermann                                  |
|  Kategorie: Technik | Status: Offen, In Bearbeitung              |
+------------------------------------------------------------------+
|                                                                   |
|  #42 - Heizungswartung planen                     Priorität: HOCH |
|  ---------------------------------------------------------------- |
|  Beschreibung: Die jährliche Heizungswartung für alle            |
|  WEG-Gebäude muss koordiniert werden.                            |
|                                                                   |
|  Verantwortlich: Max Mustermann                                  |
|  Erstellt: 01.02.2025          Fällig: 05.02.2025 (ÜBERFÄLLIG)  |
|  Gebäude: WEG Musterstraße 1                                     |
|                                                                   |
|  Checkliste (2/5):                                               |
|  ✓ Angebote einholen                                             |
|  ✓ Termine abstimmen                                             |
|  ○ Techniker beauftragen                                         |
|  ○ Termine kommunizieren                                         |
|  ○ Abnahme durchführen                                           |
|  ---------------------------------------------------------------- |
|                                                                   |
|  #41 - Mülltonnen bestellen                      Priorität: MITTEL|
|  ---------------------------------------------------------------- |
|  ...                                                              |
+------------------------------------------------------------------+
|  Seite 1 von 3                    RGI Immobilienverwaltung       |
+------------------------------------------------------------------+
```

### 6. Dashboard-Widget

```text
+-------------------------------------------+
| 📋 Meine Aufgaben                   [→]   |
+-------------------------------------------+
| [DRINGEND] 2 Aufgaben                     |
| • #42 Heizungswartung [ÜBERFÄLLIG]        |
| • #45 Protokoll erstellen - morgen        |
|                                           |
| [HOCH] 3 Aufgaben                         |
| • #41 Mülltonnen - in 3 Tagen             |
|                                           |
| [MITTEL] 5 Aufgaben                       |
+-------------------------------------------+
| Gesamt: 10 offen | 2 in Bearbeitung       |
| Davon nicht zugewiesen: 3                 |
+-------------------------------------------+
```

---

## Neue Dateien

### Frontend-Komponenten

| Datei | Beschreibung |
|-------|--------------|
| `src/pages/Todos.tsx` | Hauptseite mit Aufgabenliste |
| `src/components/todos/TodoCard.tsx` | Ausklappbare Aufgaben-Karte |
| `src/components/todos/TodoDialog.tsx` | Dialog zum Erstellen/Bearbeiten |
| `src/components/todos/TodoFilters.tsx` | Filter-Leiste mit allen Optionen |
| `src/components/todos/TodoSubtasks.tsx` | Checklisten-Komponente |
| `src/components/todos/TodoComments.tsx` | Kommentar-Bereich |
| `src/components/todos/TodoAttachments.tsx` | Dateianhänge-Komponente |
| `src/components/todos/CategoryDialog.tsx` | Dialog für neue Kategorie |
| `src/components/todos/RecurrenceSettings.tsx` | Wiederholungs-Einstellungen (diskret) |
| `src/components/todos/TodoExportDialog.tsx` | Export-Dialog |
| `src/components/todos/TodoDashboardWidget.tsx` | Dashboard-Widget |
| `src/components/todos/TodoPdfExport.tsx` | PDF-Generierung mit Logo |

### Hooks

| Datei | Beschreibung |
|-------|--------------|
| `src/hooks/useTodos.tsx` | React Query Hooks für alle Todo-Operationen |

---

## Technische Details

### PDF-Export mit Logo

Verwendung von `jspdf` und `jspdf-autotable` (bereits ähnliche Patterns im Projekt):

```typescript
import jsPDF from 'jspdf';
import 'jspdf-autotable';

const exportToPdf = async (todos: Todo[], filters: TodoFilters) => {
  const doc = new jsPDF();
  
  // Logo einbinden
  const logoUrl = '/lovable-uploads/8c5a36ed-b686-4ac4-a6ec-5f337fd466b7.png';
  doc.addImage(logoUrl, 'PNG', 15, 10, 40, 20);
  
  // Titel
  doc.setFontSize(18);
  doc.text('AUFGABENÜBERSICHT', 60, 25);
  
  // Filter-Info
  doc.setFontSize(10);
  doc.text(`Erstellt am: ${new Date().toLocaleDateString('de-DE')}`, 15, 40);
  doc.text(`Filter: ${formatFiltersForPdf(filters)}`, 15, 46);
  
  // Tabelle mit Aufgaben
  autoTable(doc, {
    startY: 55,
    head: [['Nr.', 'Titel', 'Priorität', 'Verantwortlich', 'Fällig', 'Status']],
    body: todos.map(t => [
      `#${t.task_number}`,
      t.title,
      getPriorityLabel(t.priority),
      t.assigned_to_name || 'Nicht zugewiesen',
      t.due_date ? formatDate(t.due_date) : '-',
      getStatusLabel(t.status)
    ]),
    // Styling...
  });
  
  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.text(
      `Seite ${i} von ${pageCount}`,
      doc.internal.pageSize.width / 2,
      doc.internal.pageSize.height - 10,
      { align: 'center' }
    );
  }
  
  doc.save(`Aufgaben_${new Date().toISOString().slice(0,10)}.pdf`);
};
```

### Wiederkehrende Aufgaben (Backend-Logik)

Ein einfacher Trigger oder Edge Function, die bei Abschluss einer wiederkehrenden Aufgabe die nächste erstellt:

```sql
-- Trigger bei Status-Änderung auf 'done'
CREATE OR REPLACE FUNCTION handle_recurring_todo_completion()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'done' AND NEW.is_recurring = true AND OLD.status != 'done' THEN
    -- Berechne nächstes Fälligkeitsdatum
    INSERT INTO todos (
      title, description, category_id, assigned_to, created_by,
      priority, building_id, is_recurring, recurrence_pattern,
      recurrence_interval, recurrence_end_date, parent_todo_id,
      due_date
    )
    SELECT
      NEW.title, NEW.description, NEW.category_id, NEW.assigned_to, NEW.created_by,
      NEW.priority, NEW.building_id, NEW.is_recurring, NEW.recurrence_pattern,
      NEW.recurrence_interval, NEW.recurrence_end_date, 
      COALESCE(NEW.parent_todo_id, NEW.id),
      CASE NEW.recurrence_pattern
        WHEN 'daily' THEN NEW.due_date + (NEW.recurrence_interval || ' days')::interval
        WHEN 'weekly' THEN NEW.due_date + (NEW.recurrence_interval * 7 || ' days')::interval
        WHEN 'monthly' THEN NEW.due_date + (NEW.recurrence_interval || ' months')::interval
        WHEN 'yearly' THEN NEW.due_date + (NEW.recurrence_interval || ' years')::interval
      END
    WHERE NEW.recurrence_end_date IS NULL 
       OR (NEW.due_date + calculate_next_occurrence(NEW.*)) <= NEW.recurrence_end_date;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

## Sidebar-Integration

```typescript
// In AdminSidebar.tsx
import { CheckSquare } from "lucide-react";

const menuItems = [
  { title: "Dashboard", url: "/dashboard", icon: BarChart3 },
  { title: "NOVA", url: "/documents", icon: Sparkles },
  { title: "Aufgaben", url: "/todos", icon: CheckSquare }, // NEU
  { title: "Meldungen", url: "/reports", icon: ClipboardList },
  // ...
];
```

---

## Zusammenfassung aller Features

### Kerfeatures
- Aufgaben erstellen, bearbeiten, löschen
- Prioritäten: Niedrig, Mittel, Hoch, Dringend
- Status: Offen, In Bearbeitung, Erledigt
- Optionale Zuweisung (kann leer bleiben)
- Fälligkeitsdatum (optional)
- Gebäudebezug (optional)

### Erweiterungen
- **Unteraufgaben/Checklisten**: Jeder (Ersteller + Bearbeiter) kann Punkte hinzufügen und abhaken
- **Datei-Upload**: Mehrere Anhänge pro Aufgabe (PDFs, Bilder, etc.)
- **Wiederkehrende Aufgaben**: Diskret unter "Erweiterte Optionen", täglich/wöchentlich/monatlich/jährlich
- **Kommentare**: Kommunikation zur Aufgabe

### Filterung & Sortierung
- Nach Verantwortlichem
- Nach Kategorie
- Nach Priorität
- Nach Status
- Nach Fälligkeit (Zeitraum)
- Freitextsuche

### Export
- **PDF**: Professionell mit RGI-Logo, Filtereinstellungen, kundengerecht
- **Excel**: Für Weiterverarbeitung
- Aktuelle Filter werden automatisch übernommen
- Optional: Checklisten-Details, Kommentare einschließen

### Dashboard-Widget
- Persönliche Aufgabenübersicht
- Gruppiert nach Priorität
- Überfällige Aufgaben hervorgehoben
- Nicht zugewiesene Aufgaben zählen

---

## Neue Dependencies

```bash
npm install jspdf jspdf-autotable
```

Die xlsx-Bibliothek ist bereits im Projekt vorhanden.

---

## Implementierungsreihenfolge

1. **Datenbank-Migration**: Tabellen, RLS, Storage Bucket
2. **Hook erstellen**: `useTodos.tsx` mit allen CRUD-Operationen
3. **Basis-Seite**: `Todos.tsx` mit Filterung und Sortierung
4. **Aufgaben-Karte**: Ausklappbar mit allen Details
5. **Unteraufgaben**: Checklisten-Komponente
6. **Datei-Upload**: Anhänge-Komponente
7. **Wiederkehrende Aufgaben**: Diskrete Einstellungen + Trigger
8. **Kommentare**: Kommentar-Bereich
9. **Export**: PDF + Excel mit Filter-Übernahme
10. **Dashboard-Widget**: Persönliche Übersicht
11. **Sidebar + Routing**: Navigation einbinden

