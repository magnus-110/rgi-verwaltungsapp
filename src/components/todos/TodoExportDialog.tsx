import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { FileText, Table2, Loader2 } from "lucide-react";
import { Todo, TodoFilters, priorityLabels, statusLabels } from "@/hooks/useTodos";
import { exportToPdf } from "./TodoPdfExport";
import * as XLSX from 'xlsx';
import { format } from "date-fns";
import { de } from "date-fns/locale";

interface TodoExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: TodoFilters;
  todos: Todo[];
}

export function TodoExportDialog({ open, onOpenChange, filters, todos }: TodoExportDialogProps) {
  const [exportFormat, setExportFormat] = useState<'pdf' | 'excel'>('pdf');
  const [includeSubtasks, setIncludeSubtasks] = useState(true);
  const [includeComments, setIncludeComments] = useState(false);
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [exporting, setExporting] = useState(false);

  const getActiveFiltersDescription = () => {
    const parts: string[] = [];
    
    if (filters.assignedTo && filters.assignedTo !== 'all') {
      parts.push(`Verantwortlich: ${filters.assignedTo === 'unassigned' ? 'Nicht zugewiesen' : 'Gefiltert'}`);
    }
    if (filters.category && filters.category !== 'all') {
      parts.push('Kategorie: Gefiltert');
    }
    if (filters.priority && filters.priority !== 'all') {
      parts.push(`Priorität: ${priorityLabels[filters.priority]}`);
    }
    if (filters.status && filters.status !== 'all') {
      parts.push(`Status: ${statusLabels[filters.status]}`);
    }
    if (filters.dueDateFrom || filters.dueDateTo) {
      parts.push(`Zeitraum: ${filters.dueDateFrom || '...'} - ${filters.dueDateTo || '...'}`);
    }
    if (filters.search) {
      parts.push(`Suche: "${filters.search}"`);
    }
    
    return parts.length > 0 ? parts : ['Keine Filter aktiv'];
  };

  const handleExport = async () => {
    setExporting(true);
    
    try {
      // Filter for overdue only if selected
      let exportTodos = todos;
      if (onlyOverdue) {
        const today = new Date().toDateString();
        exportTodos = todos.filter(t => 
          t.due_date && 
          t.status !== 'done' && 
          new Date(t.due_date) < new Date(today)
        );
      }

      if (exportFormat === 'pdf') {
        await exportToPdf(exportTodos, filters, { includeSubtasks, includeComments });
      } else {
        exportToExcel(exportTodos);
      }
      
      onOpenChange(false);
    } finally {
      setExporting(false);
    }
  };

  const exportToExcel = (todosToExport: Todo[]) => {
    const data = todosToExport.map(todo => ({
      'Nr.': `#${todo.task_number}`,
      'Titel': todo.title,
      'Beschreibung': todo.description || '',
      'Priorität': priorityLabels[todo.priority],
      'Status': statusLabels[todo.status],
      'Verantwortlich': todo.assigned_user 
        ? `${todo.assigned_user.first_name} ${todo.assigned_user.last_name}`.trim() 
        : 'Nicht zugewiesen',
      'Kategorie': todo.category?.name || '-',
      'Gebäude': todo.building?.name || '-',
      'Fällig': todo.due_date ? format(new Date(todo.due_date), "dd.MM.yyyy", { locale: de }) : '-',
      'Erstellt': format(new Date(todo.created_at), "dd.MM.yyyy", { locale: de }),
      'Wiederkehrend': todo.is_recurring ? 'Ja' : 'Nein',
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Aufgaben');
    
    // Set column widths
    ws['!cols'] = [
      { wch: 8 },   // Nr.
      { wch: 40 },  // Titel
      { wch: 50 },  // Beschreibung
      { wch: 12 },  // Priorität
      { wch: 15 },  // Status
      { wch: 25 },  // Verantwortlich
      { wch: 15 },  // Kategorie
      { wch: 25 },  // Gebäude
      { wch: 12 },  // Fällig
      { wch: 12 },  // Erstellt
      { wch: 12 },  // Wiederkehrend
    ];

    XLSX.writeFile(wb, `Aufgaben_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Aufgaben exportieren</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Format selection */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Format</Label>
            <RadioGroup value={exportFormat} onValueChange={(v) => setExportFormat(v as typeof exportFormat)}>
              <div className="flex items-center space-x-2 p-3 border rounded-lg cursor-pointer hover:bg-muted/50">
                <RadioGroupItem value="pdf" id="pdf" />
                <Label htmlFor="pdf" className="flex items-center gap-2 cursor-pointer flex-1">
                  <FileText className="h-4 w-4 text-red-500" />
                  <div>
                    <p className="font-medium">PDF (professionell mit Logo)</p>
                    <p className="text-xs text-muted-foreground">Geeignet für Kunden und Präsentationen</p>
                  </div>
                </Label>
              </div>
              <div className="flex items-center space-x-2 p-3 border rounded-lg cursor-pointer hover:bg-muted/50">
                <RadioGroupItem value="excel" id="excel" />
                <Label htmlFor="excel" className="flex items-center gap-2 cursor-pointer flex-1">
                  <Table2 className="h-4 w-4 text-green-500" />
                  <div>
                    <p className="font-medium">Excel</p>
                    <p className="text-xs text-muted-foreground">Für Weiterverarbeitung und Datenanalyse</p>
                  </div>
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Active filters info */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Aktuelle Filter werden übernommen:</Label>
            <div className="p-3 bg-muted rounded-lg">
              <ul className="text-sm space-y-1">
                {getActiveFiltersDescription().map((filter, index) => (
                  <li key={index} className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-primary rounded-full" />
                    {filter}
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-xs text-muted-foreground">
              {todos.length} Aufgabe(n) werden exportiert
            </p>
          </div>

          {/* Options */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Optionen</Label>
            
            <div className="flex items-center space-x-2">
              <Checkbox
                id="onlyOverdue"
                checked={onlyOverdue}
                onCheckedChange={(v) => setOnlyOverdue(v === true)}
              />
              <Label htmlFor="onlyOverdue" className="text-sm cursor-pointer">
                Nur überfällige Aufgaben
              </Label>
            </div>

            {exportFormat === 'pdf' && (
              <>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="includeSubtasks"
                    checked={includeSubtasks}
                    onCheckedChange={(v) => setIncludeSubtasks(v === true)}
                  />
                  <Label htmlFor="includeSubtasks" className="text-sm cursor-pointer">
                    Checklisten-Details einschließen
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="includeComments"
                    checked={includeComments}
                    onCheckedChange={(v) => setIncludeComments(v === true)}
                  />
                  <Label htmlFor="includeComments" className="text-sm cursor-pointer">
                    Kommentare einschließen
                  </Label>
                </div>
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={handleExport} disabled={exporting || todos.length === 0}>
            {exporting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Exportieren
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
