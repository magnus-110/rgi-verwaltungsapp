
# Implementierungsplan: Erweiterungen des Aufgabensystems

## Ubersicht der Anderungen

| Anderung | Beschreibung |
|----------|--------------|
| Mobile Navigation | Aufgaben-Link in MobileHeader hinzufugen |
| Mitarbeiter-Sichtbarkeit | Mitarbeiter sehen nur Mitarbeiter-Aufgaben |
| Standard-Filter | Zeigt eigene + nicht zugewiesene Aufgaben |
| Mehrfachzuweisung | Personen und Gebaude als Arrays |
| Formular-Persistenz | localStorage-Speicherung |
| Editierbare Checkliste | Inline-Bearbeitung mit Click-to-Edit |
| Losch-Bestatigung | Bestatigung vor Checklisten-Loschung |
| Mobile Optimierung | Kompaktere Darstellung |

---

## Phase 1: Mobile Navigation

**Datei:** `src/components/MobileHeader.tsx`

Aufgaben-Link nach NOVA einfugen:
```typescript
// Nach Zeile 45: Sparkles/NOVA hinzufugen
{
  icon: CheckSquare,
  label: "Aufgaben",
  path: '/todos',
  active: location.pathname.startsWith('/todos')
},
```

---

## Phase 2: Mitarbeiter-Sichtbarkeit

Aktuell sehen alle Admins und Mitarbeiter alle Aufgaben. Mitarbeiter sollen nur Aufgaben sehen, die:
- Ihnen zugewiesen sind
- Anderen Mitarbeitern zugewiesen sind
- Niemandem zugewiesen sind

**Datei:** `src/hooks/useTodos.tsx`

Neue Funktion `useTodosWithRole`:
```typescript
// Prufe Rolle des aktuellen Benutzers
const { profile } = useAuth();
const isEmployee = profile?.role === 'employee';

// Im Query: Filter fur Mitarbeiter
if (isEmployee) {
  // Hole alle Mitarbeiter-IDs
  const employeeIds = await supabase
    .from('profiles')
    .select('user_id')
    .eq('role', 'employee');

  // Nur Aufgaben die:
  // - assigned_to IS NULL (nicht zugewiesen)
  // - assigned_to in employeeIds (Mitarbeiter-Aufgaben)
  query = query.or(`assigned_to.is.null,assigned_to.in.(${employeeIds.map(e => e.user_id).join(',')})`);
}
```

---

## Phase 3: Standard-Filter

**Datei:** `src/pages/Todos.tsx`

Standard-Filter auf aktuelle Person + nicht zugewiesene andern:
```typescript
// useAuth Hook verwenden
const { user } = useAuth();

// Default-Filter mit "mine_and_unassigned"
const defaultFilters: TodoFiltersType = {
  assignedTo: 'mine_and_unassigned', // Neuer Spezialwert
  // ... andere Felder
};
```

**Datei:** `src/components/todos/TodoFilters.tsx`

Neue Filter-Option:
```typescript
<SelectItem value="mine_and_unassigned">
  Meine + Nicht zugewiesen
</SelectItem>
```

**Datei:** `src/hooks/useTodos.tsx`

Neue Filter-Logik:
```typescript
if (filters.assignedTo === 'mine_and_unassigned') {
  query = query.or(`assigned_to.eq.${userId},assigned_to.is.null`);
}
```

**Datei:** `src/components/todos/TodoDashboardWidget.tsx`

Widget zeigt auch nur eigene + nicht zugewiesene:
```typescript
const widgetFilters: TodoFilters = {
  assignedTo: 'mine_and_unassigned',
  // ...
};
```

---

## Phase 4: Mehrfachzuweisung (Personen und Gebaude)

### Datenbank-Migration

Neue Junction-Tabellen:
```sql
-- Aufgaben-zu-Personen (n:m)
CREATE TABLE public.todo_assignees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  todo_id UUID NOT NULL REFERENCES public.todos(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(todo_id, user_id)
);

-- Aufgaben-zu-Gebaude (n:m)
CREATE TABLE public.todo_buildings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  todo_id UUID NOT NULL REFERENCES public.todos(id) ON DELETE CASCADE,
  building_id UUID NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(todo_id, building_id)
);

-- RLS
ALTER TABLE public.todo_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.todo_buildings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and employees can manage todo assignees"
ON public.todo_assignees FOR ALL
USING (public.user_has_admin_access(auth.uid()));

CREATE POLICY "Admins and employees can manage todo buildings"
ON public.todo_buildings FOR ALL
USING (public.user_has_admin_access(auth.uid()));

-- Alte Spalten behalten fur Abwartskompatibilitat
-- assigned_to und building_id in todos bleiben als Legacy
```

### Frontend-Anderungen

**Datei:** `src/components/todos/TodoDialog.tsx`

Multi-Select fur Personen:
```typescript
// Statt einzelnem Select:
<MultiSelect
  options={users.map(u => ({ value: u.user_id, label: `${u.first_name} ${u.last_name}` }))}
  selected={assignees}
  onChange={setAssignees}
  placeholder="Verantwortliche auswahlen..."
/>

// Gleiches fur Gebaude
<MultiSelect
  options={buildings.map(b => ({ value: b.id, label: b.name }))}
  selected={selectedBuildings}
  onChange={setSelectedBuildings}
  placeholder="Gebaude auswahlen..."
/>
```

**Datei:** `src/hooks/useTodos.tsx`

Erweitertes Query:
```typescript
.select(`
  *,
  assignees:todo_assignees(
    user:profiles(user_id, first_name, last_name)
  ),
  buildings:todo_buildings(
    building:buildings(id, name)
  ),
  // ... rest
`)
```

---

## Phase 5: Formular-Persistenz

**Datei:** `src/components/todos/TodoDialog.tsx`

LocalStorage fur Formularfelder:
```typescript
const STORAGE_KEY = 'todo_dialog_draft';

// Beim Laden
useEffect(() => {
  if (mode === 'create' && open) {
    const draft = localStorage.getItem(STORAGE_KEY);
    if (draft) {
      const parsed = JSON.parse(draft);
      setTitle(parsed.title || '');
      setDescription(parsed.description || '');
      // ... weitere Felder
    }
  }
}, [mode, open]);

// Beim Andern speichern (debounced)
useEffect(() => {
  if (mode === 'create') {
    const draft = { title, description, categoryId, priority, ... };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  }
}, [title, description, categoryId, priority, ...]);

// Bei erfolgreichem Speichern loschen
onSuccess: () => {
  localStorage.removeItem(STORAGE_KEY);
  onOpenChange(false);
}

// Bei Abbrechen: Bestatigung wenn Draft existiert
const handleCancel = () => {
  if (title || description || subtasks.length > 0) {
    // Optional: Bestatigung zeigen
    // Oder: Draft wird einfach behalten
  }
  onOpenChange(false);
};
```

---

## Phase 6: Editierbare Checkliste

**Datei:** `src/components/todos/TodoSubtasks.tsx`

Inline-Bearbeitung:
```typescript
const [editingId, setEditingId] = useState<string | null>(null);
const [editText, setEditText] = useState("");
const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

// Neue Mutation
const updateSubtask = useUpdateSubtask();

// UI fur jeden Punkt
{subtasks.map((subtask) => (
  <div key={subtask.id} className="flex items-center gap-2 p-2 rounded-md group">
    <Checkbox
      checked={subtask.is_completed}
      onCheckedChange={() => handleToggle(subtask)}
    />

    {/* Editierbar durch Klick */}
    {editingId === subtask.id ? (
      <Input
        value={editText}
        onChange={(e) => setEditText(e.target.value)}
        onBlur={() => handleSaveEdit(subtask.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSaveEdit(subtask.id);
          if (e.key === 'Escape') setEditingId(null);
        }}
        autoFocus
        className="flex-1 text-sm"
      />
    ) : (
      <span
        onClick={() => {
          setEditingId(subtask.id);
          setEditText(subtask.title);
        }}
        className="flex-1 text-sm cursor-text hover:bg-muted/50 rounded px-1"
      >
        {subtask.title}
      </span>
    )}

    {/* Loschen mit Bestatigung */}
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6">
          <Trash2 className="h-3 w-3" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Punkt loschen?</AlertDialogTitle>
          <AlertDialogDescription>
            Dieser Checklistenpunkt wird unwiderruflich geloscht.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
          <AlertDialogAction onClick={() => handleDelete(subtask.id)}>
            Loschen
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
))}
```

**Datei:** `src/hooks/useTodos.tsx`

Neue Mutation:
```typescript
export function useUpdateSubtask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, todoId, title }: { id: string; todoId: string; title: string }) => {
      const { data, error } = await supabase
        .from('todo_subtasks')
        .update({ title })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return { data, todoId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['todo-subtasks', result.todoId] });
    },
  });
}
```

---

## Phase 7: Mobile Optimierung

**Datei:** `src/components/todos/TodoCard.tsx`

Kompaktere mobile Darstellung:
```typescript
<CardContent className="p-3 md:p-4 cursor-pointer">
  <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-3">
    {/* Erste Zeile: Nummer + Prioritat + Datum */}
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs font-mono text-muted-foreground">
        #{todo.task_number}
      </span>
      <Badge className={cn("text-xs px-1.5 py-0", priorityColors[todo.priority])}>
        {priorityLabels[todo.priority]}
      </Badge>
      {todo.due_date && (
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          {format(new Date(todo.due_date), "dd.MM.", { locale: de })}
        </span>
      )}
      {overdue && <Badge variant="destructive" className="text-xs px-1">Uberfällig</Badge>}
    </div>

    {/* Zweite Zeile: Titel */}
    <h3 className="font-medium text-sm sm:text-base line-clamp-2 sm:flex-1">
      {todo.title}
    </h3>

    {/* Chevron */}
    <div className="hidden sm:block">
      {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
    </div>
  </div>

  {/* Metadaten kompakt auf Mobile */}
  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground">
    {assignedName && (
      <span className="flex items-center gap-1">
        <User className="h-3 w-3" />
        {assignedName}
      </span>
    )}
    {todo.building && (
      <span className="flex items-center gap-1">
        <Building2 className="h-3 w-3" />
        {todo.building.name}
      </span>
    )}
    {totalSubtasks > 0 && (
      <span>Checkliste: {completedSubtasks}/{totalSubtasks}</span>
    )}
  </div>
</CardContent>
```

**Datei:** `src/pages/Todos.tsx`

Kompaktere Uberschriften:
```typescript
{/* Mobile: Knappe Uberschrift */}
<h1 className="text-xl sm:text-3xl font-semibold">Aufgaben</h1>
<p className="text-muted-foreground text-sm mt-0.5 hidden sm:block">
  Verwalten Sie alle Aufgaben und To-Dos
</p>
```

---

## Zusammenfassung der Dateianderungen

### Neue Dateien
| Datei | Beschreibung |
|-------|--------------|
| Migration | Junction-Tabellen fur Mehrfachzuweisung |

### Genderte Dateien
| Datei | Anderung |
|-------|----------|
| `MobileHeader.tsx` | Aufgaben-Link hinzufugen |
| `Todos.tsx` | Standard-Filter, Mobile-Optimierung |
| `TodoFilters.tsx` | "Meine + Nicht zugewiesen" Option |
| `TodoCard.tsx` | Mobile Layout optimieren |
| `TodoDialog.tsx` | LocalStorage-Persistenz, Multi-Select |
| `TodoSubtasks.tsx` | Inline-Edit, Losch-Bestatigung |
| `TodoDashboardWidget.tsx` | Default-Filter andern |
| `useTodos.tsx` | Neue Filter-Logik, Update-Subtask Mutation |

---

## Technische Notizen

### LocalStorage Schema
```json
{
  "todo_dialog_draft": {
    "title": "string",
    "description": "string",
    "categoryId": "uuid | null",
    "assignees": ["uuid"],
    "priority": "low|medium|high|urgent",
    "dueDate": "yyyy-MM-dd | null",
    "buildings": ["uuid"],
    "subtasks": ["string"],
    "isRecurring": false,
    "recurrencePattern": "weekly",
    "recurrenceInterval": 1
  }
}
```

### Filter-Logik fur Mitarbeiter
```text
1. Benutzer ist Mitarbeiter?
   -> Hole alle Mitarbeiter-IDs aus profiles
   -> Filter: assigned_to IS NULL OR assigned_to IN (mitarbeiter_ids)

2. Default-Filter "mine_and_unassigned":
   -> assigned_to = current_user_id OR assigned_to IS NULL
```

### Multi-Select Komponente
Verwendet bestehende Checkbox + Popover Pattern:
```typescript
<Popover>
  <PopoverTrigger>
    <Button variant="outline">
      {selected.length > 0 ? `${selected.length} ausgewahlt` : "Auswahlen..."}
    </Button>
  </PopoverTrigger>
  <PopoverContent>
    {options.map(opt => (
      <div key={opt.value} className="flex items-center gap-2">
        <Checkbox
          checked={selected.includes(opt.value)}
          onCheckedChange={() => toggle(opt.value)}
        />
        <span>{opt.label}</span>
      </div>
    ))}
  </PopoverContent>
</Popover>
```
