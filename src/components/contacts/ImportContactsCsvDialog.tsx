import React, { useState, useCallback } from "react";
import Papa from "papaparse";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, Sparkles, AlertTriangle, Check, Loader2, FileUp, ChevronDown, ChevronRight, Phone, Mail, Building2, CreditCard, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ParsedContact {
  short_name: string | null;
  salutation: string | null;
  contact_type: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  address_street: string | null;
  address_zip: string | null;
  address_city: string | null;
  notes: string | null;
  persons: Array<{ salutation: string | null; first_name: string | null; last_name: string | null; is_primary: boolean }>;
  phones: Array<{ phone_number: string; label: string; note: string | null }>;
  emails: Array<{ email: string; label: string; note: string | null }>;
  bank: { iban: string | null; bic: string | null; account_holder: string | null; bank_name: string | null } | null;
  ai_corrections: string[];
  is_duplicate: boolean;
  _selected: boolean;
}

type Step = "upload" | "analyzing" | "preview" | "importing" | "done";

// Map CSV headers to our structure
const HEADER_MAP: Record<string, string> = {
  "stichwörter": "stichwort", "stichwort": "stichwort", "kurzname": "stichwort",
  "anrede": "anrede",
  "nachname": "nachname", "name": "nachname", "name1": "nachname",
  "vorname": "vorname",
  "firma": "firma",
  "typ": "typ",
  "name2": "name2", "name 2": "name2",
  "name3": "name3", "name 3": "name3",
  "strasse geschäftlich": "strasse", "straße geschäftlich": "strasse", "strasse": "strasse", "straße": "strasse", "str. geschäftl.": "strasse",
  "plz geschäftlich": "plz", "postleitzahl geschäftlich": "plz", "plz": "plz",
  "ort geschäftlich": "ort", "ort": "ort", "stadt": "ort",
  "webseite geschäftlich": "webseite", "webseite": "webseite", "web": "webseite",
  "fax geschäftlich": "fax", "fax": "fax",
  "e-mail-adresse": "email_0",
  "iban": "iban", "bic": "bic",
  "inhaber": "inhaber", "kontoinhaber": "inhaber",
  "kreditinstitut": "bank", "bank": "bank",
  "telefon 1": "telefon_1", "telefon 1 notiz": "telefon_1_notiz",
  "telefon 2": "telefon_2", "telefon 2 notiz": "telefon_2_notiz",
  "telefon 3": "telefon_3", "telefon 3 notiz": "telefon_3_notiz",
  "e-mail 1": "email_1", "e-mail 1 notiz": "email_1_notiz",
  "e-mail 2": "email_2", "e-mail 2 notiz": "email_2_notiz",
  "person 2 anrede": "person2_anrede",
  "person 2 vorname": "person2_vorname",
  "person 2 nachname": "person2_nachname",
  "person 3 vorname": "person3_vorname",
  "person 3 nachname": "person3_nachname",
  "notizen": "notizen",
};

// Check if CSV has the new structured format
function isStructuredFormat(headers: string[]): boolean {
  const normalized = headers.map(h => h.toLowerCase().trim());
  return normalized.includes("vorname") && normalized.includes("firma");
}

function mapHeaders(headers: string[]): Record<number, string> {
  const map: Record<number, string> = {};
  headers.forEach((h, i) => {
    const normalized = h.toLowerCase().trim();
    if (HEADER_MAP[normalized]) {
      map[i] = HEADER_MAP[normalized];
    } else if (/^(telefon|tel)[\s.\-]*(geschäftlich\s*)?(\d*)$/i.test(normalized) || /^tel\.\s*\d*$/i.test(normalized)) {
      map[i] = `telefon_${i}`;
    } else if (/^e-?mail[-\s]*(\d*)[:\s]*(adresse)?$/i.test(normalized)) {
      map[i] = `email_${i}`;
    }
  });
  return map;
}

function parseStructuredRow(row: Record<string, string>): ParsedContact {
  const isCompany = (row.typ || "").toLowerCase() === "company" || (row.anrede || "").toLowerCase() === "firma";
  const isService = (row.typ || "").toLowerCase() === "service_provider";
  const contactType = isCompany ? "company" : isService ? "service_provider" : "person";

  // Build persons
  const persons: ParsedContact["persons"] = [];
  if (!isCompany && (row.vorname || row.nachname)) {
    persons.push({ salutation: row.anrede || null, first_name: row.vorname || null, last_name: row.nachname || null, is_primary: true });
  } else if (isCompany && (row.vorname || row.nachname)) {
    persons.push({ salutation: row.anrede || null, first_name: row.vorname || null, last_name: row.nachname || null, is_primary: true });
  }
  if (row.person2_vorname || row.person2_nachname) {
    persons.push({ salutation: row.person2_anrede || null, first_name: row.person2_vorname || null, last_name: row.person2_nachname || null, is_primary: false });
  }
  if (row.person3_vorname || row.person3_nachname) {
    persons.push({ salutation: null, first_name: row.person3_vorname || null, last_name: row.person3_nachname || null, is_primary: false });
  }

  // Build phones
  const phones: ParsedContact["phones"] = [];
  if (row.telefon_1) phones.push({ phone_number: row.telefon_1, label: "Festnetz", note: row.telefon_1_notiz || null });
  if (row.telefon_2) phones.push({ phone_number: row.telefon_2, label: "Mobil", note: row.telefon_2_notiz || null });
  if (row.telefon_3) phones.push({ phone_number: row.telefon_3, label: "Sonstige", note: row.telefon_3_notiz || null });
  if (row.fax) phones.push({ phone_number: row.fax, label: "Fax", note: null });

  // Build emails
  const emails: ParsedContact["emails"] = [];
  if (row.email_1) emails.push({ email: row.email_1, label: "Geschäftlich", note: row.email_1_notiz || null });
  if (row.email_2) emails.push({ email: row.email_2, label: "Privat", note: row.email_2_notiz || null });

  // Bank
  const bank = (row.iban || row.bic || row.inhaber || row.bank) ? {
    iban: row.iban || null,
    bic: row.bic || null,
    account_holder: row.inhaber || null,
    bank_name: row.bank || null,
  } : null;

  // Notes
  const noteParts: string[] = [];
  if (row.notizen) noteParts.push(row.notizen);
  if (row.webseite) noteParts.push(`Webseite: ${row.webseite}`);

  return {
    short_name: row.stichwort || null,
    salutation: row.anrede || null,
    contact_type: contactType,
    first_name: isCompany ? null : (row.vorname || null),
    last_name: isCompany ? null : (row.nachname || null),
    company_name: isCompany ? (row.firma || row.nachname || null) : (row.firma || null),
    address_street: row.strasse || null,
    address_zip: row.plz || null,
    address_city: row.ort || null,
    notes: noteParts.length > 0 ? noteParts.join("\n") : null,
    persons,
    phones,
    emails,
    bank,
    ai_corrections: [],
    is_duplicate: false,
    _selected: true,
  };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

export function ImportContactsCsvDialog({ open, onOpenChange, onImported }: Props) {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("upload");
  const [contacts, setContacts] = useState<ParsedContact[]>([]);
  const [progress, setProgress] = useState(0);
  const [importResult, setImportResult] = useState<{ imported: number; errors: string[] } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const reset = useCallback(() => {
    setStep("upload");
    setContacts([]);
    setProgress(0);
    setImportResult(null);
  }, []);

  const handleClose = useCallback((val: boolean) => {
    if (!val) reset();
    onOpenChange(val);
  }, [onOpenChange, reset]);

  const parseCsvFile = useCallback((file: File) => {
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Datei zu groß", description: "Maximale Dateigröße: 2 MB", variant: "destructive" });
      return;
    }

    Papa.parse(file, {
      header: false,
      delimiter: ";",
      encoding: "UTF-8",
      skipEmptyLines: true,
      complete: async (result) => {
        const rawRows = result.data as string[][];
        if (rawRows.length < 2) {
          toast({ title: "Leere Datei", description: "Die CSV enthält keine Daten", variant: "destructive" });
          return;
        }

        const headerRow = rawRows[0];
        const headerMapping = mapHeaders(headerRow);
        const structured = isStructuredFormat(headerRow);

        if (structured) {
          // Direct parsing — no AI needed
          setStep("analyzing");
          setProgress(30);

          const fieldIndices: Record<string, number> = {};
          headerRow.forEach((h, i) => {
            const normalized = h.toLowerCase().trim();
            if (HEADER_MAP[normalized]) {
              fieldIndices[HEADER_MAP[normalized]] = i;
            }
          });

          let existingNames = new Set<string>();
          try {
            const { data: existingContacts } = await supabase
              .from("contacts")
              .select("short_name, company_name, first_name, last_name");
            existingNames = new Set(
              (existingContacts || []).map(c =>
                (c.short_name || c.company_name || `${c.last_name}_${c.first_name}`).toLowerCase().trim()
              )
            );
          } catch {}

          setProgress(50);

          const parsed: ParsedContact[] = rawRows.slice(1).map(row => {
            const obj: Record<string, string> = {};
            for (const [field, colIdx] of Object.entries(fieldIndices)) {
              const v = row[colIdx]?.trim() || "";
              if (v) obj[field] = v;
            }
            return obj;
          })
          .filter(r => r.nachname || r.stichwort || r.strasse || r.firma)
          .map(row => {
            const contact = parseStructuredRow(row);
            const checkName = (contact.short_name || contact.company_name || `${contact.last_name}_${contact.first_name}`).toLowerCase().trim();
            contact.is_duplicate = existingNames.has(checkName);
            contact._selected = !contact.is_duplicate;
            return contact;
          });

          if (parsed.length === 0) {
            toast({ title: "Keine Daten", description: "Es konnten keine Kontakte aus der CSV extrahiert werden", variant: "destructive" });
            setStep("upload");
            return;
          }

          setContacts(parsed);
          setStep("preview");
          setProgress(100);
          return;
        }

        // Legacy: AI analysis
        const csvRows = rawRows.slice(1).map(row => {
          const obj: any = {};
          const phones: string[] = [];
          const emails: string[] = [];
          
          row.forEach((val, colIdx) => {
            const field = headerMapping[colIdx];
            if (!field) return;
            const v = val?.trim() || "";
            if (!v) return;
            
            if (field.startsWith("telefon_")) {
              phones.push(v);
            } else if (field.startsWith("email_")) {
              emails.push(v);
            } else {
              obj[field] = v;
            }
          });
          
          obj.telefon = phones;
          obj.emails = emails;
          return obj;
        }).filter(r => r.nachname || r.stichwort || r.strasse);

        if (csvRows.length === 0) {
          toast({ title: "Keine Daten", description: "Es konnten keine Kontakte aus der CSV extrahiert werden", variant: "destructive" });
          return;
        }

        setStep("analyzing");
        setProgress(10);

        try {
          const batchSize = 100;
          const allContacts: any[] = [];
          
          for (let i = 0; i < csvRows.length; i += batchSize) {
            const batch = csvRows.slice(i, i + batchSize);
            const { data, error } = await supabase.functions.invoke("import-contacts-csv", {
              body: { action: "analyze", rows: batch },
            });

            if (error) throw error;
            
            allContacts.push(...(data.contacts || []));
            setProgress(10 + Math.round(((i + batch.length) / csvRows.length) * 85));
          }
          
          const parsed = allContacts.map((c: any) => ({
            ...c,
            _selected: !c.is_duplicate,
          }));
          
          setContacts(parsed);
          setStep("preview");
          setProgress(100);
        } catch (err: any) {
          console.error("Analysis error:", err);
          toast({ title: "Analyse-Fehler", description: err.message || "KI-Analyse fehlgeschlagen", variant: "destructive" });
          setStep("upload");
        }
      },
      error: (err) => {
        toast({ title: "CSV-Fehler", description: err.message, variant: "destructive" });
      },
    });
  }, [toast]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseCsvFile(file);
  }, [parseCsvFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith(".csv") || file.type === "text/csv")) {
      parseCsvFile(file);
    } else {
      toast({ title: "Ungültiges Format", description: "Bitte eine CSV-Datei hochladen", variant: "destructive" });
    }
  }, [parseCsvFile, toast]);

  const toggleContact = useCallback((idx: number) => {
    setContacts(prev => prev.map((c, i) => i === idx ? { ...c, _selected: !c._selected } : c));
  }, []);

  const toggleAll = useCallback((checked: boolean) => {
    setContacts(prev => prev.map(c => ({ ...c, _selected: checked })));
  }, []);

  const handleImport = useCallback(async () => {
    const selected = contacts.filter(c => c._selected);
    if (selected.length === 0) {
      toast({ title: "Keine Auswahl", description: "Bitte wähle mindestens einen Kontakt aus", variant: "destructive" });
      return;
    }

    setStep("importing");
    setProgress(0);

    try {
      const batchSize = 50;
      let totalImported = 0;
      const allErrors: string[] = [];

      for (let i = 0; i < selected.length; i += batchSize) {
        const batch = selected.slice(i, i + batchSize).map(({ _selected, ...rest }) => rest);
        
        const { data, error } = await supabase.functions.invoke("import-contacts-csv", {
          body: { action: "import", rows: batch },
        });

        if (error) throw error;

        totalImported += data.imported || 0;
        if (data.errors?.length) allErrors.push(...data.errors);
        setProgress(Math.round(((i + batch.length) / selected.length) * 100));
      }

      setImportResult({ imported: totalImported, errors: allErrors });
      setStep("done");
      
      if (totalImported > 0) {
        onImported();
      }
    } catch (err: any) {
      console.error("Import error:", err);
      toast({ title: "Import-Fehler", description: err.message || "Import fehlgeschlagen", variant: "destructive" });
      setStep("preview");
    }
  }, [contacts, toast, onImported]);

  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const selectedCount = contacts.filter(c => c._selected).length;
  const duplicateCount = contacts.filter(c => c.is_duplicate).length;
  const aiCorrectedCount = contacts.filter(c => c.ai_corrections.length > 0).length;

  const getDisplayName = (c: ParsedContact) => {
    if (c.company_name) return c.company_name;
    return [c.last_name, c.first_name].filter(Boolean).join(", ") || c.short_name || "—";
  };

  const getTypeLabel = (t: string) => {
    if (t === "company") return "Firma";
    if (t === "service_provider") return "Dienstleister";
    return "Person";
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileUp className="h-5 w-5" />
            CSV-Kontakte importieren
          </DialogTitle>
          <DialogDescription>
            {step === "upload" && "Lade eine CSV-Datei hoch (max. 2 MB). Strukturierte CSVs werden direkt geparst."}
            {step === "analyzing" && "Kontaktdaten werden verarbeitet..."}
            {step === "preview" && `${contacts.length} Kontakte erkannt — ${selectedCount} ausgewählt zum Import`}
            {step === "importing" && "Kontakte werden importiert..."}
            {step === "done" && `Import abgeschlossen: ${importResult?.imported} von ${contacts.length} importiert`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {/* Upload Step */}
          {step === "upload" && (
            <div
              className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
                dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25"
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-lg font-medium mb-2">CSV-Datei hierher ziehen</p>
              <p className="text-sm text-muted-foreground mb-4">oder klicke um eine Datei auszuwählen</p>
              <Button variant="outline" asChild>
                <label className="cursor-pointer">
                  Datei auswählen
                  <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileChange} />
                </label>
              </Button>
            </div>
          )}

          {/* Analyzing Step */}
          {step === "analyzing" && (
            <div className="py-12 text-center space-y-4">
              <Loader2 className="h-12 w-12 mx-auto text-primary animate-spin" />
              <p className="text-lg font-medium">Daten werden verarbeitet...</p>
              <p className="text-sm text-muted-foreground">Kontakte werden geparst und auf Duplikate geprüft</p>
              <Progress value={progress} className="max-w-sm mx-auto" />
            </div>
          )}

          {/* Preview Step */}
          {step === "preview" && (
            <div className="space-y-3">
              {/* Stats bar */}
              <div className="flex gap-2 flex-wrap">
                <Badge variant="outline">{contacts.length} Kontakte</Badge>
                {duplicateCount > 0 && (
                  <Badge variant="destructive" className="flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> {duplicateCount} Duplikate
                  </Badge>
                )}
                {aiCorrectedCount > 0 && (
                  <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 flex items-center gap-1">
                    <Sparkles className="h-3 w-3" /> {aiCorrectedCount} KI-korrigiert
                  </Badge>
                )}
              </div>

              <ScrollArea className="h-[50vh] border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={selectedCount === contacts.length}
                          onCheckedChange={(checked) => toggleAll(!!checked)}
                        />
                      </TableHead>
                      <TableHead>Stichwort</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Typ</TableHead>
                      <TableHead>Adresse</TableHead>
                      <TableHead className="text-center">Tel</TableHead>
                      <TableHead className="text-center">Mail</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contacts.map((c, idx) => (
                      <React.Fragment key={idx}>
                        <TableRow
                          className={`cursor-pointer hover:bg-muted/50 ${c.is_duplicate ? "bg-destructive/5" : ""} ${c.ai_corrections.length > 0 ? "bg-amber-50 dark:bg-amber-950/20" : ""}`}
                          onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
                        >
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={c._selected}
                              onCheckedChange={() => toggleContact(idx)}
                            />
                          </TableCell>
                          <TableCell className="text-sm font-medium truncate max-w-[120px]">
                            <span className="flex items-center gap-1">
                              {expandedIdx === idx ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
                              {c.short_name || "—"}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm truncate max-w-[160px]">
                            {getDisplayName(c)}
                            {c.persons.length > 1 && (
                              <span className="text-xs text-muted-foreground ml-1">+{c.persons.length - 1}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={c.contact_type === "company" ? "default" : "secondary"} className="text-xs">
                              {getTypeLabel(c.contact_type)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground truncate max-w-[180px]">
                            {[c.address_street, c.address_zip, c.address_city].filter(Boolean).join(", ") || "—"}
                          </TableCell>
                          <TableCell className="text-center text-sm">{c.phones.length || "—"}</TableCell>
                          <TableCell className="text-center text-sm">{c.emails.length || "—"}</TableCell>
                          <TableCell>
                            {c.is_duplicate && (
                              <Badge variant="destructive" className="text-xs">Duplikat</Badge>
                            )}
                            {c.ai_corrections.length > 0 && (
                              <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 text-xs" title={c.ai_corrections.join(", ")}>
                                KI
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                        {expandedIdx === idx && (
                          <TableRow className="bg-muted/30 hover:bg-muted/30">
                            <TableCell colSpan={8} className="p-0">
                              <div className="px-6 py-4 space-y-3 text-sm">
                                {/* Personen */}
                                <div>
                                  <p className="font-medium flex items-center gap-1.5 mb-1.5 text-foreground">
                                    <User className="h-3.5 w-3.5" /> Personen ({c.persons.length})
                                  </p>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 pl-5">
                                    {c.persons.map((p, pi) => (
                                      <div key={pi} className="text-muted-foreground">
                                        {p.salutation && <span className="mr-1">{p.salutation}</span>}
                                        {p.first_name} {p.last_name}
                                        {p.is_primary && <Badge variant="outline" className="ml-1.5 text-[10px] py-0">Haupt</Badge>}
                                      </div>
                                    ))}
                                    {c.persons.length === 0 && <span className="text-muted-foreground italic">Keine Personen</span>}
                                  </div>
                                </div>

                                {/* Adresse */}
                                <div>
                                  <p className="font-medium flex items-center gap-1.5 mb-1 text-foreground">
                                    <Building2 className="h-3.5 w-3.5" /> Adresse
                                  </p>
                                  <p className="pl-5 text-muted-foreground">
                                    {c.address_street || "—"}, {c.address_zip || "—"} {c.address_city || "—"}
                                  </p>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  {/* Telefon */}
                                  <div>
                                    <p className="font-medium flex items-center gap-1.5 mb-1.5 text-foreground">
                                      <Phone className="h-3.5 w-3.5" /> Telefon ({c.phones.length})
                                    </p>
                                    <div className="space-y-0.5 pl-5">
                                      {c.phones.map((ph, phi) => (
                                        <div key={phi} className="text-muted-foreground">
                                          <span>{ph.phone_number}</span>
                                          <span className="text-xs ml-1.5 text-muted-foreground/70">{ph.label}</span>
                                          {ph.note && <span className="text-xs ml-1 italic text-amber-600 dark:text-amber-400">({ph.note})</span>}
                                        </div>
                                      ))}
                                      {c.phones.length === 0 && <span className="text-muted-foreground italic">Keine Telefonnummern</span>}
                                    </div>
                                  </div>

                                  {/* E-Mail */}
                                  <div>
                                    <p className="font-medium flex items-center gap-1.5 mb-1.5 text-foreground">
                                      <Mail className="h-3.5 w-3.5" /> E-Mail ({c.emails.length})
                                    </p>
                                    <div className="space-y-0.5 pl-5">
                                      {c.emails.map((em, emi) => (
                                        <div key={emi} className="text-muted-foreground">
                                          <span>{em.email}</span>
                                          <span className="text-xs ml-1.5 text-muted-foreground/70">{em.label}</span>
                                          {em.note && <span className="text-xs ml-1 italic text-amber-600 dark:text-amber-400">({em.note})</span>}
                                        </div>
                                      ))}
                                      {c.emails.length === 0 && <span className="text-muted-foreground italic">Keine E-Mail-Adressen</span>}
                                    </div>
                                  </div>
                                </div>

                                {/* Bank */}
                                {c.bank && (c.bank.iban || c.bank.account_holder) && (
                                  <div>
                                    <p className="font-medium flex items-center gap-1.5 mb-1 text-foreground">
                                      <CreditCard className="h-3.5 w-3.5" /> Bankverbindung
                                    </p>
                                    <div className="pl-5 text-muted-foreground text-xs space-y-0.5">
                                      {c.bank.account_holder && <p>Inhaber: {c.bank.account_holder}</p>}
                                      {c.bank.iban && <p>IBAN: {c.bank.iban}</p>}
                                      {c.bank.bic && <p>BIC: {c.bank.bic}</p>}
                                      {c.bank.bank_name && <p>Bank: {c.bank.bank_name}</p>}
                                    </div>
                                  </div>
                                )}

                                {/* KI-Korrekturen */}
                                {c.ai_corrections.length > 0 && (
                                  <div>
                                    <p className="font-medium flex items-center gap-1.5 mb-1 text-amber-700 dark:text-amber-400">
                                      <Sparkles className="h-3.5 w-3.5" /> KI-Korrekturen
                                    </p>
                                    <ul className="pl-5 text-xs text-amber-600 dark:text-amber-400 list-disc list-inside">
                                      {c.ai_corrections.map((corr, ci) => <li key={ci}>{corr}</li>)}
                                    </ul>
                                  </div>
                                )}

                                {/* Notizen */}
                                {c.notes && (
                                  <div>
                                    <p className="font-medium mb-1 text-foreground">Notizen</p>
                                    <p className="pl-5 text-xs text-muted-foreground">{c.notes}</p>
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>
          )}

          {/* Importing Step */}
          {step === "importing" && (
            <div className="py-12 text-center space-y-4">
              <Loader2 className="h-12 w-12 mx-auto text-primary animate-spin" />
              <p className="text-lg font-medium">Importiere {selectedCount} Kontakte...</p>
              <Progress value={progress} className="max-w-sm mx-auto" />
            </div>
          )}

          {/* Done Step */}
          {step === "done" && importResult && (
            <div className="py-8 text-center space-y-4">
              <Check className="h-16 w-16 mx-auto text-green-500" />
              <p className="text-xl font-semibold">{importResult.imported} Kontakte importiert</p>
              {importResult.errors.length > 0 && (
                <div className="text-left max-w-md mx-auto">
                  <p className="text-sm font-medium text-destructive mb-2">{importResult.errors.length} Fehler:</p>
                  <ScrollArea className="h-32 border rounded p-2">
                    {importResult.errors.map((e, i) => (
                      <p key={i} className="text-xs text-muted-foreground">{e}</p>
                    ))}
                  </ScrollArea>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          {step === "preview" && (
            <div className="flex gap-2 w-full justify-between">
              <Button variant="outline" onClick={reset}>Zurück</Button>
              <Button onClick={handleImport} disabled={selectedCount === 0}>
                <Upload className="h-4 w-4 mr-2" />
                {selectedCount} Kontakte importieren
              </Button>
            </div>
          )}
          {step === "done" && (
            <Button onClick={() => handleClose(false)}>Schließen</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
