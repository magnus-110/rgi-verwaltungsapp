import React, { useState, useCallback } from "react";
import Papa from "papaparse";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, Sparkles, AlertTriangle, Check, Loader2, FileUp } from "lucide-react";
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
  "name2": "name2", "name 2": "name2",
  "name3": "name3", "name 3": "name3",
  "strasse geschäftlich": "strasse", "straße geschäftlich": "strasse", "strasse": "strasse", "straße": "strasse", "str. geschäftl.": "strasse",
  "plz geschäftlich": "plz", "plz": "plz",
  "ort geschäftlich": "ort", "ort": "ort", "stadt": "ort",
  "webseite geschäftlich": "webseite", "webseite": "webseite", "web": "webseite",
  "fax geschäftlich": "fax", "fax": "fax",
  "iban": "iban", "bic": "bic",
  "inhaber": "inhaber", "kontoinhaber": "inhaber",
  "kreditinstitut": "bank", "bank": "bank",
};

function mapHeaders(headers: string[]): Record<number, string> {
  const map: Record<number, string> = {};
  headers.forEach((h, i) => {
    const normalized = h.toLowerCase().trim();
    if (HEADER_MAP[normalized]) {
      map[i] = HEADER_MAP[normalized];
    } else if (/^(telefon|tel)\s*\d*$/i.test(normalized) || /^tel\.\s*\d*$/i.test(normalized)) {
      map[i] = `telefon_${i}`;
    } else if (/^e-?mail\s*\d*$/i.test(normalized)) {
      map[i] = `email_${i}`;
    }
  });
  return map;
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
        
        // Convert to structured rows
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

        // Start AI analysis
        setStep("analyzing");
        setProgress(10);

        try {
          const { data, error } = await supabase.functions.invoke("import-contacts-csv", {
            body: { action: "analyze", rows: csvRows },
          });

          if (error) throw error;
          
          const parsed = (data.contacts || []).map((c: any) => ({
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
      const { data, error } = await supabase.functions.invoke("import-contacts-csv", {
        body: { action: "import", rows: selected },
      });

      if (error) throw error;

      setImportResult({ imported: data.imported, errors: data.errors || [] });
      setStep("done");
      
      if (data.imported > 0) {
        onImported();
      }
    } catch (err: any) {
      console.error("Import error:", err);
      toast({ title: "Import-Fehler", description: err.message || "Import fehlgeschlagen", variant: "destructive" });
      setStep("preview");
    }
  }, [contacts, toast, onImported]);

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
            {step === "upload" && "Lade eine CSV-Datei aus deinem alten Verwaltungsprogramm hoch (max. 2 MB)."}
            {step === "analyzing" && "Die KI analysiert die Kontaktdaten..."}
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
              <Sparkles className="h-12 w-12 mx-auto text-primary animate-pulse" />
              <p className="text-lg font-medium">KI-Analyse läuft...</p>
              <p className="text-sm text-muted-foreground">Namen werden geparst, Telefonnummern bereinigt, Duplikate geprüft</p>
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
                      <TableRow
                        key={idx}
                        className={`${c.is_duplicate ? "bg-destructive/5" : ""} ${c.ai_corrections.length > 0 ? "bg-amber-50 dark:bg-amber-950/20" : ""}`}
                      >
                        <TableCell>
                          <Checkbox
                            checked={c._selected}
                            onCheckedChange={() => toggleContact(idx)}
                          />
                        </TableCell>
                        <TableCell className="text-sm font-medium truncate max-w-[120px]">
                          {c.short_name || "—"}
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
