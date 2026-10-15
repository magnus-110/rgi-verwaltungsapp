import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { FileCode, FileText, Loader2, Trash2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PdfViewerModal } from "@/components/documents/PdfViewerModal";
import { ibanFormatiert } from "@/lib/bankInfo";
import { kontenNeuLaden } from "./BewegungsListe";

interface Ergebnis {
  datei: string;
  text: string;
  fehler?: boolean;
}

/**
 * Kontoauszug als Datei einlesen – die Notlösung, solange (oder falls) der
 * Abruf über die Bank nicht läuft.
 *
 * CAMT-Dateien (XML) brauchen keine Auswahl: die App erkennt die
 * Liegenschaft an der IBAN des Kontos. PDF-Auszüge werden nur abgelegt
 * (ohne Bewegungen) und brauchen deshalb die Liegenschaft.
 */
export function AuszugImport() {
  const queryClient = useQueryClient();
  const xmlRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);
  const [liegenschaft, setLiegenschaft] = useState<string>("auto");
  const [laeuft, setLaeuft] = useState<string | null>(null);
  const [ergebnisse, setErgebnisse] = useState<Ergebnis[]>([]);
  const [pdf, setPdf] = useState<{ url: string; name: string } | null>(null);

  const { data: gebaeude = [] } = useQuery({
    queryKey: ["auszug-import-gebaeude"],
    queryFn: async () => {
      const { data, error } = await supabase.from("buildings").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const namen: Record<string, string> = Object.fromEntries(gebaeude.map((g: any) => [g.id, g.name]));

  const { data: auszuege = [], isLoading } = useQuery({
    queryKey: ["auszug-import-liste", liegenschaft],
    queryFn: async () => {
      let q = supabase
        .from("bank_statements")
        .select("id, building_id, account_iban, file_name, file_path, source_format, statement_date_from, statement_date_to, closing_balance, import_date")
        .order("import_date", { ascending: false })
        .limit(25);
      if (liegenschaft !== "auto") q = q.eq("building_id", liegenschaft);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const neuLaden = () => {
    queryClient.invalidateQueries({ queryKey: ["auszug-import-liste"] });
    queryClient.invalidateQueries({ queryKey: ["bank-statements-list"] });
    queryClient.invalidateQueries({ queryKey: ["bank-reconciliations"] });
    kontenNeuLaden(queryClient);
  };

  const leseText = async (file: File): Promise<string> => {
    let text = await file.text();
    const enc = text.match(/<\?xml[^?]*encoding=["']([^"']+)["']/i)?.[1]?.toUpperCase();
    if (enc && enc !== "UTF-8") {
      text = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = () => reject(r.error);
        r.readAsText(file, enc);
      });
    }
    return text;
  };

  const camtEinlesen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const dateien = Array.from(e.target.files ?? []).filter((f) => /\.xml$/i.test(f.name));
    if (xmlRef.current) xmlRef.current.value = "";
    if (dateien.length === 0) {
      toast.error("Bitte CAMT-Dateien (.xml) wählen");
      return;
    }
    const neu: Ergebnis[] = [];
    for (let i = 0; i < dateien.length; i++) {
      const f = dateien[i];
      setLaeuft(`Datei ${i + 1} von ${dateien.length} …`);
      try {
        const xmlContent = await leseText(f);
        const { data, error } = await supabase.functions.invoke("parse-bank-statement", {
          body: { xmlContent, buildingId: liegenschaft === "auto" ? null : liegenschaft },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        const teile: string[] = [];
        for (const s of data.perStatement ?? []) {
          if (s.skipped) continue;
          const ort = s.buildingId ? namen[s.buildingId] ?? "Liegenschaft" : "?";
          teile.push(`${ort}: ${s.inserted} neu${s.duplicates ? `, ${s.duplicates} schon da` : ""}${s.matched ? `, ${s.matched} zugeordnet` : ""}`);
        }
        const warn = (data.warnings ?? []) as string[];
        neu.push({ datei: f.name, text: [...teile, ...warn].join(" · ") || "Keine neuen Bewegungen", fehler: teile.length === 0 && warn.length > 0 });
      } catch (err: any) {
        neu.push({ datei: f.name, text: err?.message || "Fehler beim Einlesen", fehler: true });
      }
    }
    setErgebnisse(neu);
    setLaeuft(null);
    neuLaden();
    const fehler = neu.filter((n) => n.fehler).length;
    (fehler ? toast.warning : toast.success)(fehler ? `${fehler} von ${neu.length} Dateien mit Hinweis` : "Auszüge eingelesen");
  };

  const pdfAblegen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const dateien = Array.from(e.target.files ?? []).filter((f) => /\.pdf$/i.test(f.name));
    if (pdfRef.current) pdfRef.current.value = "";
    if (liegenschaft === "auto") {
      toast.error("Für PDF-Auszüge bitte zuerst die Liegenschaft wählen");
      return;
    }
    let ok = 0;
    for (let i = 0; i < dateien.length; i++) {
      const f = dateien[i];
      setLaeuft(`Datei ${i + 1} von ${dateien.length} …`);
      try {
        const sicher = f.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
        const pfad = `bank-statements/${liegenschaft}/${Date.now()}_${sicher}`;
        const { error: upErr } = await supabase.storage.from("building-documents").upload(pfad, f, { contentType: "application/pdf" });
        if (upErr) throw upErr;
        const { error } = await supabase.from("bank_statements").insert({
          building_id: liegenschaft,
          fiscal_year: new Date().getFullYear(),
          source_format: "pdf",
          file_name: f.name,
          file_path: pfad,
        });
        if (error) throw error;
        ok++;
      } catch (err) {
        console.error("PDF-Auszug:", err);
      }
    }
    setLaeuft(null);
    neuLaden();
    if (ok === dateien.length) toast.success(`${ok} PDF${ok === 1 ? "" : "s"} abgelegt`);
    else toast.error(`${dateien.length - ok} von ${dateien.length} PDFs nicht gespeichert`);
  };

  const oeffnen = async (s: any) => {
    if (!s.file_path) {
      toast.error("Originaldatei nicht vorhanden");
      return;
    }
    const { data } = await supabase.storage.from("building-documents").createSignedUrl(s.file_path, 600);
    if (!data?.signedUrl) {
      toast.error("Datei konnte nicht geöffnet werden");
      return;
    }
    if (s.file_path.toLowerCase().endsWith(".pdf")) setPdf({ url: data.signedUrl, name: s.file_name });
    else window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const loeschen = async (s: any) => {
    const ok = window.confirm(
      `Auszug „${s.file_name}" löschen?\n\nDie Kontobewegungen daraus werden mitgelöscht. Fertige Buchungen bleiben, verlieren aber den Bezug zur Bewegung.`,
    );
    if (!ok) return;
    if (s.file_path) await supabase.storage.from("building-documents").remove([s.file_path]);
    const { error } = await supabase.from("bank_statements").delete().eq("id", s.id);
    if (error) {
      toast.error("Löschen fehlgeschlagen");
      return;
    }
    toast.success("Auszug gelöscht");
    neuLaden();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end gap-3">
        <div className="space-y-1.5 sm:w-72">
          <Label>Liegenschaft</Label>
          <Select value={liegenschaft} onValueChange={setLiegenschaft}>
            <SelectTrigger className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Automatisch über die IBAN</SelectItem>
              {gebaeude.map((g: any) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <input ref={xmlRef} type="file" accept=".xml" multiple className="hidden" onChange={camtEinlesen} />
        <input ref={pdfRef} type="file" accept=".pdf" multiple className="hidden" onChange={pdfAblegen} />
        <Button className="h-11" onClick={() => xmlRef.current?.click()} disabled={!!laeuft}>
          {laeuft ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileCode className="h-4 w-4 mr-2" />}
          {laeuft ?? "CAMT-Datei einlesen"}
        </Button>
        <Button variant="outline" className="h-11" onClick={() => pdfRef.current?.click()} disabled={!!laeuft || liegenschaft === "auto"} title={liegenschaft === "auto" ? "Für PDF bitte die Liegenschaft wählen" : undefined}>
          <FileText className="h-4 w-4 mr-2" /> PDF ablegen
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        CAMT-Dateien (.xml) bekommst du im Online-Banking unter „Umsätze exportieren". Die Bewegungen landen sofort auf der Seite Konten.
        PDF-Auszüge werden nur als Beleg abgelegt.
      </p>

      {ergebnisse.length > 0 && (
        <ul className="rounded-lg border divide-y text-sm">
          {ergebnisse.map((r, i) => (
            <li key={i} className={`px-3 py-2 ${r.fehler ? "text-amber-800 dark:text-amber-300" : ""}`}>
              <span className="font-medium">{r.datei}</span> — {r.text}
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-lg border">
        <div className="border-b px-3 py-2 text-sm font-medium">Zuletzt eingelesen</div>
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : auszuege.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">Noch keine Auszüge.</div>
        ) : (
          <ul className="divide-y">
            {auszuege.map((s: any) => (
              <li key={s.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="w-12 shrink-0 text-[11px] font-semibold uppercase text-muted-foreground">
                  {s.source_format === "pdf" ? "PDF" : s.source_format === "fints" ? "Bank" : "CAMT"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{namen[s.building_id] ?? "–"}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {s.account_iban ? ibanFormatiert(s.account_iban) : s.file_name}
                    {s.statement_date_from && s.statement_date_to
                      ? ` · ${format(new Date(s.statement_date_from), "dd.MM.")}–${format(new Date(s.statement_date_to), "dd.MM.yyyy")}`
                      : ""}
                  </span>
                </span>
                <span className="hidden sm:block text-xs text-muted-foreground whitespace-nowrap">
                  {s.import_date ? format(new Date(s.import_date), "dd.MM.yyyy HH:mm") : ""}
                </span>
                {s.file_path && (
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => oeffnen(s)} title="Öffnen">
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                )}
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => loeschen(s)} title="Löschen">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <PdfViewerModal isOpen={!!pdf} onClose={() => setPdf(null)} documentUrl={pdf?.url ?? null} documentName={pdf?.name ?? "Kontoauszug"} />
    </div>
  );
}
