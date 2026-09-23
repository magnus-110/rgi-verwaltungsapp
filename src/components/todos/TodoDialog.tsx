import React, { useState, useEffect, useCallback, forwardRef, ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Building2,
  CalendarIcon,
  ChevronDown,
  ChevronRight,
  FolderKanban,
  Loader2,
  Plus,
  Search,
  Users,
  X,
} from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Todo, CreateTodoInput, useCreateTodo, useUpdateTodo, useCategories, useAssignableUsers } from "@/hooks/useTodos";
import { useAuth } from "@/hooks/useAuth";
import { useCasesForPicker } from "@/hooks/useCaseReview";
import { useWallPeople } from "@/hooks/useBoardWalls";
import { usePinToWalls } from "@/hooks/useBoardPins";
import { CategoryDialog } from "./CategoryDialog";
import { InlineSubtasksCreator } from "./TodoSubtasks";
import { InlineAttachmentCreator } from "./TodoAttachments";
import { supabase } from "@/integrations/supabase/client";
import { applyChecklistTemplate } from "@/hooks/useChecklistTemplates";


const STORAGE_KEY = 'todo_dialog_draft';

interface TodoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  todo?: Todo | null;
  mode: 'create' | 'edit';
  /** Wird nach dem Anlegen mit der neuen Aufgaben-ID gerufen — die Pinnwand
   *  haengt die Aufgabe damit gleich an die eigene Wand. */
  onCreated?: (todoId: string) => void;
  /** Vorbelegung beim Anlegen, z. B. aus einem Vorgang heraus. */
  vorbelegung?: { caseId?: string | null; buildingId?: string | null };
}

interface DraftData {
  title: string;
  description: string;
  categoryId: string | null;
  assignees: string[];
  priority: 'low' | 'medium' | 'high' | 'urgent';
  dueDate: string | null;
  buildingIds: string[];
  isRecurring: boolean;
  recurrencePattern: 'daily' | 'weekly' | 'monthly' | 'yearly';
  recurrenceInterval: number;
  recurrenceEndDate: string | null;
  subtasks: string[];
  caseId?: string | null;
}

const PRIO_TEXT: Record<string, string> = {
  low: 'niedrig',
  medium: 'mittel',
  high: 'hoch',
  urgent: 'dringend',
};

const WDH_TEXT: Record<string, string> = {
  daily: 'Tage',
  weekly: 'Wochen',
  monthly: 'Monate',
  yearly: 'Jahre',
};

/**
 * Ein Knopf am Fuss des Blattes.
 *
 * Gestrichelt, solange nichts drinsteht — dann sieht man auf einen Blick,
 * was noch leer ist, ohne dass ein leeres Feld wie ein Versäumnis wirkt.
 */
interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  aktiv: boolean;
  icon: ReactNode;
}

const Chip = forwardRef<HTMLButtonElement, ChipProps>(
  ({ aktiv, icon, children, className, ...rest }, ref) => (
    <button
      ref={ref}
      type="button"
      {...rest}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        aktiv
          ? "border border-border bg-background text-foreground hover:bg-muted"
          : "border border-dashed border-[#D5CCBA] bg-transparent text-muted-foreground hover:border-[#C2B79F] hover:text-foreground",
        className
      )}
    >
      {icon}
      {children}
    </button>
  )
);
Chip.displayName = 'Chip';

/** Eine Gruppe unter „Mehr einstellen". */
function Gruppe({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <div className="space-y-2.5 rounded-[10px] border border-border/70 p-3.5">
      <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {titel}
      </span>
      {children}
    </div>
  );
}

/** Eine Zeile in einer Gruppe: links die Frage, rechts die Antwort. */
function Zeile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="min-w-0 flex-1 text-[13px] text-foreground">{label}</span>
      {children}
    </div>
  );
}

/**
 * Der Dialog zum Schreiben einer Aufgabe.
 *
 * Oben steht nur, was später auch auf der Aufgabe zu sehen ist: Überschrift,
 * Text, Gebäude, Verantwortliche, Termin. Wer nichts weiter einstellt, tippt
 * zwei Zeilen und hängt auf.
 *
 * Alles andere — Kategorie, Priorität, Wiedervorlage, Anleitung, Unterpunkte,
 * Anhänge — liegt unter „Mehr einstellen", dort nach drei Fragen sortiert:
 * wann taucht sie auf, wie wird sie abgearbeitet, wo gehört sie hin. Vorher
 * standen alle elf Felder untereinander und sahen gleich wichtig aus; bei den
 * allermeisten Aufgaben bleiben neun davon leer.
 */
export function TodoDialog({ open, onOpenChange, todo, mode, onCreated, vorbelegung }: TodoDialogProps) {
  const { user, profile } = useAuth();
  const { data: categories = [] } = useCategories();
  const { data: users = [] } = useAssignableUsers();
  const createTodo = useCreateTodo();
  const updateTodo = useUpdateTodo();

  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [mehr, setMehr] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [assignees, setAssignees] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');
  const [buildingIds, setBuildingIds] = useState<string[]>([]);
  const [isRecurring, setIsRecurring] = useState(false);
  const [isInternal, setIsInternal] = useState(false);
  const [recurrencePattern, setRecurrencePattern] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('weekly');
  const [recurrenceInterval, setRecurrenceInterval] = useState(1);
  const [recurrenceEndDate, setRecurrenceEndDate] = useState<string | null>(null);
  const [subtasks, setSubtasks] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  // Drei Daten mit drei verschiedenen Bedeutungen, deshalb getrennt:
  // due_date = harte Frist, show_in_list_date = ab wann im Vorrat sichtbar,
  // follow_up_at = Wiedervorlage (verschwindet bis dahin, kommt dann zurueck).
  const [showFrom, setShowFrom] = useState<string | null>(null);
  const [followUpAt, setFollowUpAt] = useState<string | null>(null);
  const [checklistTemplateId, setChecklistTemplateId] = useState<string | null>(null);
  const [caseId, setCaseId] = useState<string | null>(null);
  const [vorgangSuche, setVorgangSuche] = useState('');

  const { data: vorgaenge = [] } = useCasesForPicker();
  const { data: wandLeute = [] } = useWallPeople();
  const anWaende = usePinToWalls();

  // Anleitungen (Prozessvorlagen) fuer die Checkliste
  const [templates, setTemplates] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    supabase
      .from('process_templates')
      .select('id, name')
      .order('name')
      .then(({ data }) => setTemplates(data || []));
  }, []);

  // Fetch buildings
  const [buildings, setBuildings] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    supabase
      .from('buildings')
      .select('id, name')
      .order('name')
      .then(({ data }) => setBuildings(data || []));
  }, []);

  // Load draft from localStorage for create mode
  useEffect(() => {
    if (open && mode === 'create') {
      const savedDraft = localStorage.getItem(STORAGE_KEY);
      if (savedDraft) {
        try {
          const draft: DraftData = JSON.parse(savedDraft);
          setTitle(draft.title || '');
          setDescription(draft.description || '');
          setCategoryId(draft.categoryId);
          setAssignees(draft.assignees || []);
          setPriority(draft.priority || 'medium');
          setDueDate(draft.dueDate);
          setBuildingIds(draft.buildingIds || []);
          setIsRecurring(draft.isRecurring || false);
          setRecurrencePattern(draft.recurrencePattern || 'weekly');
          setRecurrenceInterval(draft.recurrenceInterval || 1);
          setRecurrenceEndDate(draft.recurrenceEndDate);
          setSubtasks(draft.subtasks || []);
          setCaseId(draft.caseId ?? null);
        } catch (e) {
          // Invalid draft, ignore
        }
      }
    }
  }, [open, mode]);

  // Save draft to localStorage (debounced)
  const saveDraft = useCallback(() => {
    if (mode === 'create') {
      const draft: DraftData = {
        title,
        description,
        categoryId,
        assignees,
        priority,
        dueDate,
        buildingIds,
        isRecurring,
        recurrencePattern,
        recurrenceInterval,
        recurrenceEndDate,
        subtasks,
        caseId,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    }
  }, [mode, title, description, categoryId, assignees, priority, dueDate, buildingIds, isRecurring, recurrencePattern, recurrenceInterval, recurrenceEndDate, subtasks, caseId]);

  useEffect(() => {
    if (mode === 'create' && open) {
      const timeout = setTimeout(saveDraft, 500);
      return () => clearTimeout(timeout);
    }
  }, [saveDraft, mode, open]);

  // Reset form when dialog opens/closes or mode changes
  useEffect(() => {
    if (open) {
      if (mode === 'edit' && todo) {
        setTitle(todo.title);
        setDescription(todo.description || '');
        setCategoryId(todo.category_id);
        if (todo.assignees && todo.assignees.length > 0) {
          setAssignees(todo.assignees.map(a => a.user?.user_id).filter(Boolean) as string[]);
        } else if (todo.assigned_to) {
          setAssignees([todo.assigned_to]);
        } else {
          setAssignees([]);
        }
        setDueDate(todo.due_date);
        setPriority(todo.priority);
        if (todo.buildings && todo.buildings.length > 0) {
          setBuildingIds(todo.buildings.map(b => b.building?.id).filter(Boolean) as string[]);
        } else if (todo.building_id) {
          setBuildingIds([todo.building_id]);
        } else {
          setBuildingIds([]);
        }
        setIsRecurring(todo.is_recurring);
        setIsInternal((todo as any).is_internal || false);
        setRecurrencePattern(todo.recurrence_pattern || 'weekly');
        setRecurrenceInterval(todo.recurrence_interval || 1);
        setRecurrenceEndDate(todo.recurrence_end_date);
        setShowFrom((todo as any).show_in_list_date || null);
        setFollowUpAt((todo as any).follow_up_at || null);
        setChecklistTemplateId((todo as any).checklist_template_id || null);
        setCaseId((todo as any).case_id || null);
        setSubtasks([]);
        setFiles([]);
        // Beim Bearbeiten aufgeklappt, sobald unten etwas drinsteht — sonst
        // waere es versteckt, und man wuesste nicht, dass es da ist.
        setMehr(
          !!todo.category_id ||
            todo.priority !== 'medium' ||
            todo.is_recurring ||
            !!(todo as any).is_internal ||
            !!(todo as any).show_in_list_date ||
            !!(todo as any).follow_up_at ||
            !!(todo as any).checklist_template_id
        );
      } else if (mode === 'create') {
        setMehr(false);
        // Wer eine Aufgabe schreibt, macht sie meistens selbst. Wer sie
        // jemand anderem hinlegt, tauscht die Wand in einem Klick.
        if (user?.id) setAssignees(prev => (prev.length ? prev : [user.id]));
        // Der Entwurf aus dem Zwischenspeicher wird oben geladen; eine
        // Vorbelegung von aussen (etwa aus einem Vorgang heraus) sticht sie,
        // denn sie beschreibt, wozu diese Aufgabe gerade angelegt wird.
        if (vorbelegung?.caseId) setCaseId(vorbelegung.caseId);
        if (vorbelegung?.buildingId) setBuildingIds([vorbelegung.buildingId]);
      }
    }
  }, [open, mode, todo, user?.id, vorbelegung?.caseId, vorbelegung?.buildingId]);

  const clearForm = () => {
    setTitle("");
    setDescription("");
    setCategoryId(null);
    setAssignees([]);
    setDueDate(null);
    setPriority('medium');
    setBuildingIds([]);
    setIsRecurring(false);
    setIsInternal(false);
    setRecurrencePattern('weekly');
    setRecurrenceInterval(1);
    setRecurrenceEndDate(null);
    setSubtasks([]);
    setFiles([]);
    setShowFrom(null);
    setFollowUpAt(null);
    setChecklistTemplateId(null);
    setCaseId(null);
    setVorgangSuche('');
    setMehr(false);
    localStorage.removeItem(STORAGE_KEY);
  };

  const handleSubmit = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e) e.preventDefault();
    if (!title.trim() || isPending) return;

    try {
      if (mode === 'create') {
        const input: CreateTodoInput = {
          title: title.trim(),
          description: description.trim() || undefined,
          category_id: categoryId || undefined,
          assigned_to: assignees.length === 1 ? assignees[0] : undefined,
          assignees: assignees.length > 0 ? assignees : undefined,
          due_date: dueDate || undefined,
          priority,
          building_id: buildingIds.length === 1 ? buildingIds[0] : undefined,
          building_ids: buildingIds.length > 0 ? buildingIds : undefined,
          is_recurring: isRecurring,
          is_internal: isInternal,
          recurrence_pattern: isRecurring ? recurrencePattern : undefined,
          recurrence_interval: isRecurring ? recurrenceInterval : undefined,
          recurrence_end_date: isRecurring ? recurrenceEndDate || undefined : undefined,
          subtasks: subtasks.length > 0 ? subtasks : undefined,
        };
        (input as any).show_in_list_date = showFrom || undefined;
        (input as any).follow_up_at = followUpAt || undefined;
        (input as any).checklist_template_id = checklistTemplateId || undefined;
        input.case_id = caseId;

        const newTodo = await createTodo.mutateAsync(input);

        // Upload files after todo is created
        if (files.length > 0 && newTodo) {
          setUploading(true);
          try {
            const uploadedAttachments: any[] = [];
            for (const file of files) {
              const fileExt = file.name.split('.').pop();
              const fileName = `${newTodo.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
              const { error } = await supabase.storage
                .from('todo-attachments')
                .upload(fileName, file);
              if (!error) {
                uploadedAttachments.push({
                  name: file.name,
                  path: fileName,
                  size: file.size,
                  type: file.type,
                });
              }
            }
            if (uploadedAttachments.length > 0) {
              await supabase
                .from('todos')
                .update({ attachments: uploadedAttachments })
                .eq('id', newTodo.id);
            }
          } finally {
            setUploading(false);
          }
        }
        if (newTodo && checklistTemplateId) {
          await applyChecklistTemplate(newTodo.id, checklistTemplateId, user!.id);
        }
        // An die gewaehlten Waende haengen — auch an fremde. Die Pinnwand
        // haengt nichts mehr selbst auf, sonst haette man zwei Quellen dafuer.
        if (newTodo && assignees.length > 0) {
          await anWaende.mutateAsync({
            todoId: newTodo.id,
            titel: title.trim(),
            userIds: assignees,
          });
        }

        clearForm();
        onOpenChange(false);
        if (newTodo && onCreated) onCreated(newTodo.id);
      } else if (mode === 'edit' && todo) {
        const updatePayload: any = {
          id: todo.id,
          title: title.trim(),
          description: description.trim() || null,
          category_id: categoryId,
          assigned_to: assignees.length === 1 ? assignees[0] : null,
          due_date: dueDate,
          priority,
          building_id: buildingIds.length === 1 ? buildingIds[0] : null,
          is_recurring: isRecurring,
          is_internal: isInternal,
          recurrence_pattern: isRecurring ? recurrencePattern : null,
          recurrence_interval: isRecurring ? recurrenceInterval : null,
          recurrence_end_date: isRecurring ? recurrenceEndDate : null,
          show_in_list_date: showFrom,
          follow_up_at: followUpAt,
          checklist_template_id: checklistTemplateId,
          case_id: caseId,
        };
        updatePayload.assignees = assignees;
        updatePayload.building_ids = buildingIds;

        await updateTodo.mutateAsync(updatePayload);
        onOpenChange(false);
      }
    } catch (err) {
      console.error('TodoDialog submit failed:', err);
      setUploading(false);
    }
  };

  const toggleAssignee = (userId: string) => {
    setAssignees(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const toggleBuilding = (buildingId: string) => {
    setBuildingIds(prev =>
      prev.includes(buildingId)
        ? prev.filter(id => id !== buildingId)
        : [...prev, buildingId]
    );
  };

  const isPending = createTodo.isPending || updateTodo.isPending || uploading;

  const gebaeudeText =
    buildingIds.length === 0
      ? 'Gebäude'
      : buildingIds.length === 1
        ? buildings.find(b => b.id === buildingIds[0])?.name ?? '1 Gebäude'
        : `${buildingIds.length} Gebäude`;

  const werText = (() => {
    if (assignees.length === 0) return 'in den Vorrat';
    if (assignees.length === 1) {
      if (assignees[0] === user?.id) return 'meine Wand';
      const p = wandLeute.find(x => x.userId === assignees[0]);
      return p ? `Wand von ${p.name.split(' ')[0]}` : '1 Wand';
    }
    return `${assignees.length} Wände`;
  })();

  const gewaehlterVorgang = vorgaenge.find(v => v.id === caseId);
  const vorgangText = gewaehlterVorgang ? gewaehlterVorgang.title : 'kein Vorgang';

  /** Umlaute und Gross-/Kleinschreibung beim Suchen ignorieren. */
  const normal = (t: string) =>
    t.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');

  const gefundeneVorgaenge = (() => {
    const woerter = normal(vorgangSuche.trim()).split(/\s+/).filter(Boolean);
    if (!woerter.length) return vorgaenge.slice(0, 40);
    return vorgaenge
      .filter(v => {
        const heuhaufen = normal([v.title, v.building_name, v.unit_number].filter(Boolean).join(' '));
        return woerter.every(w => heuhaufen.includes(w));
      })
      .slice(0, 40);
  })();

  const terminText = dueDate
    ? format(new Date(dueDate), 'dd.MM.yyyy', { locale: de })
    : 'ohne Termin';

  /** Was unter „Mehr" tatsächlich gesetzt ist — für die Zeile im zugeklappten Zustand. */
  const gesetzt: string[] = [];
  if (categoryId) gesetzt.push(categories.find(c => c.id === categoryId)?.name ?? 'Kategorie');
  if (priority !== 'medium') gesetzt.push(`Priorität ${PRIO_TEXT[priority]}`);
  if (showFrom) gesetzt.push(`ab ${format(new Date(showFrom), 'dd.MM.', { locale: de })} im Vorrat`);
  if (followUpAt) gesetzt.push(`Wiedervorlage ${format(new Date(followUpAt), 'dd.MM.', { locale: de })}`);
  if (isRecurring) gesetzt.push('wiederholt sich');
  if (checklistTemplateId) gesetzt.push(templates.find(t => t.id === checklistTemplateId)?.name ?? 'Anleitung');
  if (subtasks.length > 0) gesetzt.push(`${subtasks.length} Unterpunkte`);
  if (files.length > 0) gesetzt.push(`${files.length} ${files.length === 1 ? 'Anhang' : 'Anhänge'}`);
  if (isInternal) gesetzt.push('nur für Admins');

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden p-0 sm:max-w-[560px]">
          <DialogHeader className="shrink-0 px-5 pb-1 pt-5">
            <DialogTitle className="text-[15px] font-semibold">
              {mode === 'create' ? 'Aufgabe schreiben' : 'Aufgabe bearbeiten'}
            </DialogTitle>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-1">
            <form onSubmit={handleSubmit}>
              {/*
                Das Blatt. Dieselbe Fläche wie die fertige Aufgabe an der Wand —
                man schreibt, was man nachher sieht.
              */}
              <div className="rounded-[10px] border border-[#EBE4D6] bg-[#FFFDF7] p-4 shadow-[0_1px_2px_rgba(43,43,43,.05)]">
                <label htmlFor="title" className="sr-only">
                  Überschrift der Aufgabe
                </label>
                <input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Worum geht's?"
                  required
                  autoFocus
                  className="w-full border-none bg-transparent p-0 text-[20px] font-semibold leading-snug text-foreground outline-none placeholder:font-normal placeholder:text-muted-foreground"
                />

                <label htmlFor="description" className="sr-only">
                  Beschreibung
                </label>
                <textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ein, zwei Sätze dazu – wenn nötig."
                  rows={3}
                  className="mt-2 w-full resize-none border-none bg-transparent p-0 text-[13.5px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground"
                />

                <div className="my-3 h-px bg-[#EBE4D6]" />

                <div className="flex flex-wrap gap-2">
                  {/* Gebäude */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Chip aria-label="Gebäude wählen" aktiv={buildingIds.length > 0} icon={<Building2 className="h-3.5 w-3.5" />}>
                        {gebaeudeText}
                      </Chip>
                    </PopoverTrigger>
                    <PopoverContent className="w-[300px] p-2" align="start">
                      <div className="max-h-[220px] space-y-1 overflow-y-auto">
                        {buildings.map((b) => (
                          <div
                            key={b.id}
                            className="flex cursor-pointer items-center gap-2 rounded p-2 hover:bg-muted"
                            onClick={() => toggleBuilding(b.id)}
                          >
                            <Checkbox checked={buildingIds.includes(b.id)} />
                            <span className="text-sm">{b.name}</span>
                          </div>
                        ))}
                      </div>
                      {buildingIds.length > 0 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="mt-2 w-full"
                          onClick={() => setBuildingIds([])}
                        >
                          Auswahl aufheben
                        </Button>
                      )}
                    </PopoverContent>
                  </Popover>

                  {/* Verantwortliche */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Chip aria-label="Wand wählen" aktiv={assignees.length > 0} icon={<Users className="h-3.5 w-3.5" />}>
                        {werText}
                      </Chip>
                    </PopoverTrigger>
                    <PopoverContent className="w-[300px] p-2" align="start">
                      <p className="px-2 pb-1.5 pt-1 text-[11.5px] leading-snug text-muted-foreground">
                        An wessen Wand soll sie hängen?
                      </p>
                      <div className="max-h-[220px] space-y-1 overflow-y-auto">
                        {wandLeute.map((p) => (
                          <div
                            key={p.userId}
                            className="flex cursor-pointer items-center gap-2 rounded p-2 hover:bg-muted"
                            onClick={() => toggleAssignee(p.userId)}
                          >
                            <Checkbox checked={assignees.includes(p.userId)} />
                            <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-[#2B2B2B] text-[9.5px] font-semibold text-white">
                              {p.initials}
                            </span>
                            <span className="text-sm">
                              {p.name}
                              {p.userId === user?.id && (
                                <span className="text-muted-foreground"> (du)</span>
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                      {assignees.length > 0 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="mt-2 w-full"
                          onClick={() => setAssignees([])}
                        >
                          An keine Wand — in den Vorrat
                        </Button>
                      )}
                      <p className="mt-2 border-t border-border pt-2 text-[11.5px] leading-snug text-muted-foreground">
                        Wer nicht du selbst ist, bekommt eine Meldung. Ohne Wand landet die
                        Aufgabe im Vorrat.
                      </p>
                    </PopoverContent>
                  </Popover>

                  {/* Termin */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Chip aria-label="Termin wählen" aktiv={!!dueDate} icon={<CalendarIcon className="h-3.5 w-3.5" />}>
                        {terminText}
                      </Chip>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={dueDate ? new Date(dueDate) : undefined}
                        onSelect={(date) => setDueDate(date ? format(date, 'yyyy-MM-dd') : null)}
                        initialFocus
                        locale={de}
                      />
                      <div className="border-t border-border p-2">
                        <p className="px-1 pb-2 text-[11.5px] leading-snug text-muted-foreground">
                          Nur setzen, wenn das Datum eine echte Konsequenz hat. Die meisten
                          Aufgaben brauchen keins.
                        </p>
                        {dueDate && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="w-full"
                            onClick={() => setDueDate(null)}
                          >
                            Termin entfernen
                          </Button>
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>

                  {/* Vorgang */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Chip aria-label="Vorgang wählen" aktiv={!!caseId} icon={<FolderKanban className="h-3.5 w-3.5" />}>
                        <span className="max-w-[190px] truncate">{vorgangText}</span>
                      </Chip>
                    </PopoverTrigger>
                    <PopoverContent className="w-[340px] p-2" align="start">
                      <div className="relative mb-2">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={vorgangSuche}
                          onChange={e => setVorgangSuche(e.target.value)}
                          placeholder="Vorgang suchen …"
                          className="h-8 pl-8 text-[12.5px]"
                          aria-label="Vorgang suchen"
                        />
                      </div>

                      {caseId && (
                        <button
                          type="button"
                          onClick={() => setCaseId(null)}
                          className="mb-1 flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12.5px] text-muted-foreground hover:bg-muted"
                        >
                          <X className="h-3.5 w-3.5" /> Verknüpfung lösen
                        </button>
                      )}

                      <div className="max-h-[220px] space-y-0.5 overflow-y-auto">
                        {gefundeneVorgaenge.length === 0 && (
                          <p className="px-2 py-3 text-center text-[12.5px] text-muted-foreground">
                            Kein offener Vorgang gefunden.
                          </p>
                        )}
                        {gefundeneVorgaenge.map(v => (
                          <button
                            key={v.id}
                            type="button"
                            onClick={() => {
                              setCaseId(v.id);
                              // Der Vorgang weiss, um welches Haus es geht —
                              // das muss man nicht zweimal angeben.
                              if (v.building_id && buildingIds.length === 0) {
                                setBuildingIds([v.building_id]);
                              }
                            }}
                            className={`flex w-full flex-col items-start rounded px-2 py-1.5 text-left hover:bg-muted ${
                              v.id === caseId ? 'bg-muted' : ''
                            }`}
                          >
                            <span className="text-[13px] leading-snug text-foreground">{v.title}</span>
                            {(v.building_name || v.unit_number) && (
                              <span className="text-[11.5px] text-muted-foreground">
                                {[v.building_name, v.unit_number ? `Whg. ${v.unit_number}` : null]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>

                      <p className="mt-2 border-t border-border pt-2 text-[11.5px] leading-snug text-muted-foreground">
                        Wird die Aufgabe erledigt, steht das im Verlauf des Vorgangs — und
                        Eigentümer sehen beim zugehörigen Beschluss eine neue Änderung.
                      </p>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {/* Mehr einstellen */}
              <button
                type="button"
                onClick={() => setMehr(o => !o)}
                aria-expanded={mehr}
                className="mt-3.5 flex w-full items-center gap-2 py-1.5 text-left text-[13px] text-foreground"
              >
                {mehr ? (
                  <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                )}
                <span className="font-medium">Mehr einstellen</span>
                {!mehr && (
                  <span className="min-w-0 truncate text-muted-foreground">
                    {gesetzt.length > 0
                      ? `– ${gesetzt.join(' · ')}`
                      : '– Kategorie, Wiedervorlage, Anleitung, Unterpunkte, Anhänge'}
                  </span>
                )}
              </button>

              {mehr && (
                <div className="mt-1.5 space-y-3.5 pb-1">
                  <Gruppe titel="Wann sie auftaucht">
                    <Zeile label="Erst ab einem Tag im Vorrat">
                      <div className="flex items-center gap-1">
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className={cn("font-normal", !showFrom && "text-muted-foreground")}
                            >
                              {showFrom
                                ? format(new Date(showFrom), 'dd.MM.yyyy', { locale: de })
                                : 'sofort'}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="end">
                            <Calendar
                              mode="single"
                              selected={showFrom ? new Date(showFrom) : undefined}
                              onSelect={(date) => setShowFrom(date ? format(date, 'yyyy-MM-dd') : null)}
                              initialFocus
                              locale={de}
                            />
                            <p className="border-t border-border p-2 text-[11.5px] leading-snug text-muted-foreground">
                              Vorher taucht die Aufgabe gar nicht erst im Vorrat auf.
                            </p>
                          </PopoverContent>
                        </Popover>
                        {showFrom && (
                          <Button type="button" variant="ghost" size="sm" onClick={() => setShowFrom(null)}>
                            zurücksetzen
                          </Button>
                        )}
                      </div>
                    </Zeile>

                    <Zeile label="Wiedervorlage">
                      <div className="flex items-center gap-1">
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className={cn("font-normal", !followUpAt && "text-muted-foreground")}
                            >
                              {followUpAt
                                ? format(new Date(followUpAt), 'dd.MM.yyyy', { locale: de })
                                : 'keine'}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="end">
                            <Calendar
                              mode="single"
                              selected={followUpAt ? new Date(followUpAt) : undefined}
                              onSelect={(date) => setFollowUpAt(date ? format(date, 'yyyy-MM-dd') : null)}
                              initialFocus
                              locale={de}
                            />
                            <p className="border-t border-border p-2 text-[11.5px] leading-snug text-muted-foreground">
                              Die Aufgabe verschwindet bis zu diesem Tag und kommt dann von
                              selbst zurück.
                            </p>
                          </PopoverContent>
                        </Popover>
                        {followUpAt && (
                          <Button type="button" variant="ghost" size="sm" onClick={() => setFollowUpAt(null)}>
                            zurücksetzen
                          </Button>
                        )}
                      </div>
                    </Zeile>

                    <Zeile label="Wiederholt sich">
                      <Switch checked={isRecurring} onCheckedChange={setIsRecurring} aria-label="Wiederholt sich" />
                    </Zeile>

                    {isRecurring && (
                      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/40 p-2.5">
                        <span className="text-[12.5px] text-muted-foreground">alle</span>
                        <Input
                          type="number"
                          min={1}
                          value={recurrenceInterval}
                          onChange={(e) => setRecurrenceInterval(Math.max(1, Number(e.target.value) || 1))}
                          className="h-8 w-[62px] text-[13px]"
                          aria-label="Abstand der Wiederholung"
                        />
                        <Select
                          value={recurrencePattern}
                          onValueChange={(v) => setRecurrencePattern(v as typeof recurrencePattern)}
                        >
                          <SelectTrigger className="h-8 w-[118px] text-[13px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(['daily', 'weekly', 'monthly', 'yearly'] as const).map(p => (
                              <SelectItem key={p} value={p}>{WDH_TEXT[p]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <span className="text-[12.5px] text-muted-foreground">bis</span>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className={cn("h-8 font-normal", !recurrenceEndDate && "text-muted-foreground")}
                            >
                              {recurrenceEndDate
                                ? format(new Date(recurrenceEndDate), 'dd.MM.yyyy', { locale: de })
                                : 'ohne Ende'}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="end">
                            <Calendar
                              mode="single"
                              selected={recurrenceEndDate ? new Date(recurrenceEndDate) : undefined}
                              onSelect={(date) =>
                                setRecurrenceEndDate(date ? format(date, 'yyyy-MM-dd') : null)
                              }
                              initialFocus
                              locale={de}
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                    )}
                  </Gruppe>

                  <Gruppe titel="Wie sie abgearbeitet wird">
                    <Zeile label="Anleitung als Checkliste">
                      <Select
                        value={checklistTemplateId ?? 'none'}
                        onValueChange={(v) => setChecklistTemplateId(v === 'none' ? null : v)}
                      >
                        <SelectTrigger className="h-9 w-[180px] text-[13px]">
                          <SelectValue placeholder="keine" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">keine</SelectItem>
                          {templates.map((t) => (
                            <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Zeile>
                    {checklistTemplateId && (
                      <p className="text-[11.5px] leading-snug text-muted-foreground">
                        Übernimmt die Schritte der Anleitung als Checkliste — mit Erklärtext zum
                        Aufklappen.
                      </p>
                    )}

                    {mode === 'create' && (
                      <>
                        <InlineSubtasksCreator subtasks={subtasks} onChange={setSubtasks} />
                        <InlineAttachmentCreator files={files} onChange={setFiles} />
                      </>
                    )}
                  </Gruppe>

                  <Gruppe titel="Einsortierung">
                    <Zeile label="Kategorie">
                      <div className="flex items-center gap-1.5">
                        <Select
                          value={categoryId || 'none'}
                          onValueChange={(v) => setCategoryId(v === 'none' ? null : v)}
                        >
                          <SelectTrigger className="h-9 w-[160px] text-[13px]">
                            <SelectValue placeholder="keine" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">keine</SelectItem>
                            {categories.map((cat) => (
                              <SelectItem key={cat.id} value={cat.id}>
                                <div className="flex items-center gap-2">
                                  <div
                                    className="h-2 w-2 rounded-full"
                                    style={{ backgroundColor: cat.color }}
                                  />
                                  {cat.name}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-9 w-9 shrink-0"
                          onClick={() => setCategoryDialogOpen(true)}
                          aria-label="Neue Kategorie anlegen"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </Zeile>

                    <Zeile label="Priorität">
                      <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
                        <SelectTrigger className="h-9 w-[160px] text-[13px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">niedrig</SelectItem>
                          <SelectItem value="medium">mittel</SelectItem>
                          <SelectItem value="high">hoch</SelectItem>
                          <SelectItem value="urgent">dringend</SelectItem>
                        </SelectContent>
                      </Select>
                    </Zeile>

                    {profile?.role === 'admin' && (
                      <>
                        <Zeile label="Nur für Admins sichtbar">
                          <Switch
                            checked={isInternal}
                            onCheckedChange={(checked) => setIsInternal(checked === true)}
                            aria-label="Nur für Admins sichtbar"
                          />
                        </Zeile>
                        {isInternal && (
                          <p className="text-[11.5px] leading-snug text-muted-foreground">
                            Mitarbeiter sehen diese Aufgabe nicht.
                          </p>
                        )}
                      </>
                    )}
                  </Gruppe>
                </div>
              )}
            </form>
          </div>

          <div className="flex shrink-0 items-center gap-2.5 px-5 py-4">
            <span className="min-w-0 flex-1 text-[11.5px] text-muted-foreground">
              {mode === 'create'
                ? assignees.length === 0
                  ? 'Landet im Vorrat.'
                  : assignees.length === 1 && assignees[0] === user?.id
                    ? 'Landet sofort an deiner Wand.'
                    : `Landet an ${werText}.`
                : ''}
            </span>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              Abbrechen
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={!title.trim() || isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === 'create' ? (assignees.length > 0 ? 'Aufhängen' : 'Anlegen') : 'Speichern'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <CategoryDialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen} />
    </>
  );
}
