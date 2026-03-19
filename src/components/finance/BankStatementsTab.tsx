import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, FileText, Loader2, ChevronDown, ChevronUp, CheckCircle2, FileQuestion, LayoutTemplate, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { de } from "date-fns/locale";

const MATCH_STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  matched_invoice: { label: "Rechnung", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200", icon: CheckCircle2 },
  matched_template: { label: "Vorlage", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200", icon: LayoutTemplate },
  manually_matched: { label: "Manuell", color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200", icon: CheckCircle2 },
  unmatched: { label: "Unbekannt", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200", icon: FileQuestion },
  ignored: { label: "Ignoriert", color: "bg-muted text-muted-foreground", icon: EyeOff },
};

export function BankStatementsTab() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedBuilding, setSelectedBuilding] = useState<string>("all");
  const [expandedStatement, setExpandedStatement] = useState<string | null>(null);

  const { data: buildings = [] } = useQuery({
    queryKey: ["buildings-list-finance"],
    queryFn: async () => {
      const { data, error } = await supabase.from("buildings").select("id, name, building_code").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: statements = [], isLoading } = useQuery({
    queryKey: ["bank-statements", selectedBuilding],
    queryFn: async () => {
      let query = supabase
        .from("bank_statements")
        .select("*")
        .order("import_date", { ascending: false });
      if (selectedBuilding !== "all") {
        query = query.eq("building_id", selectedBuilding);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ["bank-transactions", expandedStatement],
    queryFn: async () => {
      if (!expandedStatement) return [];
      const { data, error } = await supabase
        .from("bank_transactions")
        .select("*")
        .eq("statement_id", expandedStatement)
        .order("booking_date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!expandedStatement,
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xml")) {
      toast.error("Bitte eine CAMT.053 XML-Datei hochladen");
      return;
    }

    setUploading(true);
    try {
      const xmlContent = await file.text();
      const { data, error } = await supabase.functions.invoke("parse-bank-statement", {
        body: {
          xmlContent,
          buildingId: selectedBuilding !== "all" ? selectedBuilding : null,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(
        `${data.totalTransactions} Transaktionen importiert, davon ${data.matchedCount} automatisch zugeordnet`
      );
      queryClient.invalidateQueries({ queryKey: ["bank-statements"] });
      if (data.statementId) setExpandedStatement(data.statementId);
    } catch (err: any) {
      console.error(err);
      toast.error("Fehler beim Import: " + (err.message || "Unbekannter Fehler"));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const updateMatchStatus = async (txnId: string, status: string) => {
    const { error } = await supabase
      .from("bank_transactions")
      .update({ match_status: status })
      .eq("id", txnId);
    if (error) {
      toast.error("Fehler beim Aktualisieren");
    } else {
      queryClient.invalidateQueries({ queryKey: ["bank-transactions"] });
    }
  };

  const getMatchCounts = (stmtId: string) => {
    if (expandedStatement !== stmtId) return null;
    const matched = transactions.filter((t) => t.match_status !== "unmatched" && t.match_status !== "ignored").length;
    return { total: transactions.length, matched, unmatched: transactions.length - matched };
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle className="text-lg">Kontoauszüge</CardTitle>
            <div className="flex items-center gap-2">
              <Select value={selectedBuilding} onValueChange={setSelectedBuilding}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Alle Liegenschaften" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Liegenschaften</SelectItem>
                  {buildings.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xml"
                className="hidden"
                onChange={handleFileUpload}
              />
              <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                CAMT.053 importieren
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : statements.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Noch keine Kontoauszüge importiert</p>
              <p className="text-sm mt-1">Laden Sie eine CAMT.053 XML-Datei hoch</p>
            </div>
          ) : (
            <div className="space-y-2">
              {statements.map((stmt: any) => {
                const isExpanded = expandedStatement === stmt.id;
                const counts = getMatchCounts(stmt.id);
                return (
                  <div key={stmt.id} className="border rounded-lg">
                    <button
                      className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors text-left"
                      onClick={() => setExpandedStatement(isExpanded ? null : stmt.id)}
                    >
                      <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="font-medium text-sm">
                            {stmt.account_iban || "Kontoauszug"}{" "}
                            {stmt.statement_date_from && (
                              <span className="text-muted-foreground font-normal">
                                ({format(new Date(stmt.statement_date_from), "dd.MM.yyyy", { locale: de })}
                                {stmt.statement_date_to && ` – ${format(new Date(stmt.statement_date_to), "dd.MM.yyyy", { locale: de })}`})
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Importiert am {format(new Date(stmt.import_date), "dd.MM.yyyy HH:mm", { locale: de })}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {counts && (
                          <div className="flex gap-1">
                            <Badge variant="outline" className="text-xs bg-green-50 dark:bg-green-950">
                              {counts.matched} zugeordnet
                            </Badge>
                            {counts.unmatched > 0 && (
                              <Badge variant="outline" className="text-xs bg-yellow-50 dark:bg-yellow-950">
                                {counts.unmatched} offen
                              </Badge>
                            )}
                          </div>
                        )}
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t px-4 pb-4">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Datum</TableHead>
                              <TableHead>Name</TableHead>
                              <TableHead>Verwendungszweck</TableHead>
                              <TableHead className="text-right">Betrag</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Aktionen</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {transactions.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                                  Keine Transaktionen
                                </TableCell>
                              </TableRow>
                            ) : (
                              transactions.map((txn: any) => {
                                const config = MATCH_STATUS_CONFIG[txn.match_status] || MATCH_STATUS_CONFIG.unmatched;
                                const Icon = config.icon;
                                const name = txn.amount < 0 ? txn.creditor_name : txn.debtor_name;
                                return (
                                  <TableRow key={txn.id}>
                                    <TableCell className="text-sm whitespace-nowrap">
                                      {format(new Date(txn.booking_date), "dd.MM.yyyy")}
                                    </TableCell>
                                    <TableCell className="text-sm max-w-[150px] truncate">
                                      {name || "–"}
                                    </TableCell>
                                    <TableCell className="text-sm max-w-[200px] truncate">
                                      {txn.purpose || "–"}
                                    </TableCell>
                                    <TableCell className={`text-sm text-right font-mono whitespace-nowrap ${txn.amount < 0 ? "text-destructive" : "text-green-600"}`}>
                                      {txn.amount < 0 ? "" : "+"}{Number(txn.amount).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €
                                    </TableCell>
                                    <TableCell>
                                      <Badge className={`text-xs gap-1 ${config.color}`} variant="outline">
                                        <Icon className="h-3 w-3" />
                                        {config.label}
                                      </Badge>
                                    </TableCell>
                                    <TableCell>
                                      {txn.match_status === "unmatched" && (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="text-xs"
                                          onClick={() => updateMatchStatus(txn.id, "ignored")}
                                        >
                                          <EyeOff className="h-3 w-3 mr-1" />
                                          Ignorieren
                                        </Button>
                                      )}
                                      {txn.match_status === "ignored" && (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="text-xs"
                                          onClick={() => updateMatchStatus(txn.id, "unmatched")}
                                        >
                                          Wiederherstellen
                                        </Button>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                );
                              })
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
