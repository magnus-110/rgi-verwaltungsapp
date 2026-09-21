import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KeyRound, RotateCcw, Send, X } from "lucide-react";
import type { KeyType } from "@/components/buildings/keys/types";
import type { GlobalKeyTag } from "./useGlobalKeys";
import { matchTagNumber } from "./matchTagNumber";

interface Props {
  tags: GlobalKeyTag[];
  types: KeyType[];
  loanByTag: Record<string, any>;
  onOpen: (tag: GlobalKeyTag) => void;
  onIssue: (tag: GlobalKeyTag) => void;
  onReturn: (tag: GlobalKeyTag, loan: any) => void;
}

export const KeyQuickFind = ({ tags, types, loanByTag, onOpen, onIssue, onReturn }: Props) => {
  const [typeId, setTypeId] = useState<string | null>(null);
  const [num, setNum] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Nur am Desktop automatisch fokussieren – auf dem Handy würde sonst
  // beim Seitenaufruf die Tastatur aufspringen.
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) {
      inputRef.current?.focus();
    }
  }, []);

  const hits = useMemo(() => matchTagNumber(tags, typeId, num), [tags, typeId, num]);
  const hit = hits.length === 1 ? hits[0] : null;
  const hitLoan = hit ? loanByTag[hit.id] : null;

  const reset = () => {
    setTypeId(null);
    setNum("");
    inputRef.current?.focus();
  };

  const keyContent = (tag: GlobalKeyTag) => {
    const list = tag.keys ?? [];
    if (!list.length) return "kein Schlüssel erfasst";
    const first = list[0].key_number || "Schlüssel";
    return list.length > 1 ? `${first} + ${list.length - 1} weitere` : first;
  };

  return (
    <Card className="border-2 border-primary/70 shadow-sm">
      <CardContent className="p-4 md:p-5 space-y-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <div className="flex items-center gap-2 font-semibold">
            <KeyRound className="h-4 w-4 text-primary" /> Schlüssel finden
          </div>
          <span className="text-xs text-muted-foreground">
            Farbe wählen, Nummer eintippen – Enter öffnet den Anhänger
          </span>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Farbe</Label>
            <div className="flex gap-2">
              {types.map((t) => {
                const active = typeId === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setTypeId(active ? null : t.id)}
                    className={`flex h-[58px] w-[88px] flex-col items-center justify-center gap-1.5 rounded-xl border-2 text-sm font-medium transition-colors ${
                      active ? "border-primary bg-primary/10" : "border-border hover:bg-muted"
                    }`}
                  >
                    <span
                      className="h-4 w-4 rounded-full border border-black/10"
                      style={{ background: t.color_hex ?? "#999" }}
                    />
                    {t.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5 min-w-[240px] flex-1 max-w-[320px]">
            <Label htmlFor="key-quick-number" className="text-xs uppercase tracking-wide text-muted-foreground">
              Anhängernummer
            </Label>
            <Input
              id="key-quick-number"
              ref={inputRef}
              value={num}
              autoComplete="off"
              placeholder="z.B. 036-02"
              onChange={(e) => setNum(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && hit) onOpen(hit);
                if (e.key === "Escape") reset();
              }}
              className="h-[58px] font-mono text-2xl font-bold tracking-wider"
            />
          </div>

          {(num || typeId) && (
            <Button variant="outline" className="h-[58px]" onClick={reset}>
              <X className="h-4 w-4 mr-1" /> Zurücksetzen
            </Button>
          )}

          <p className="ml-auto hidden max-w-[260px] text-right text-xs text-muted-foreground lg:block">
            Erkennt <span className="font-mono">036-02</span>, <span className="font-mono">36 2</span> und{" "}
            <span className="font-mono">K/036-02</span>. Objekt- und lfd. Nummer werden aufgefüllt.
          </p>
        </div>

        {hit && (
          <div className="flex flex-wrap items-center gap-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
            <div
              className="h-12 w-1.5 shrink-0 rounded-full"
              style={{ background: types.find((t) => t.id === hit.key_type_id)?.color_hex ?? "#999" }}
            />
            <div className="min-w-[140px]">
              <div className="font-mono text-2xl font-bold leading-tight">{hit.tag_number}</div>
              <div className="text-xs text-muted-foreground">
                {types.find((t) => t.id === hit.key_type_id)?.name ?? "—"}
              </div>
            </div>
            <div className="min-w-[180px] flex-1">
              <div className="font-medium">{hit.buildings?.name ?? "—"}</div>
              <div className="truncate text-sm text-muted-foreground">{keyContent(hit)}</div>
            </div>
            <div className="text-sm font-medium">
              {hitLoan ? (
                <span className="text-destructive">Verliehen an {hitLoan.borrower_name ?? "—"}</span>
              ) : (
                <span className="text-emerald-600">Im Haus</span>
              )}
            </div>
            <div className="ml-auto flex gap-2">
              <Button variant="outline" onClick={() => onOpen(hit)}>
                Öffnen
              </Button>
              {hitLoan ? (
                <Button onClick={() => onReturn(hit, hitLoan)}>
                  <RotateCcw className="h-4 w-4 mr-1" /> Zurücknehmen
                </Button>
              ) : (
                <Button onClick={() => onIssue(hit)}>
                  <Send className="h-4 w-4 mr-1" /> Ausgeben
                </Button>
              )}
            </div>
          </div>
        )}

        {hits.length > 1 && (
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">{hits.length} Anhänger passen – bitte wählen:</div>
            <div className="flex flex-wrap gap-2">
              {hits.slice(0, 12).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onOpen(t)}
                  className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm hover:bg-muted"
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: types.find((x) => x.id === t.key_type_id)?.color_hex ?? "#999" }}
                  />
                  <span className="font-mono font-semibold">{t.tag_number}</span>
                  <span className="text-muted-foreground">{t.buildings?.name ?? "—"}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {hits.length === 0 && num.trim().length > 0 && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            Kein Anhänger gefunden. Farbe und Nummer prüfen – oder den Anhänger neu anlegen.
          </div>
        )}
      </CardContent>
    </Card>
  );
};
