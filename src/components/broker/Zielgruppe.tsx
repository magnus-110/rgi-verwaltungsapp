import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ZIELGRUPPEN, type Zielgruppe } from "@/lib/makler";
import { useGebaeudeAuswahl } from "@/hooks/useGesuche";

/** „Wer soll es sehen?“ – für Angebote und Gesuche in der Nutzer-App. */
export function ZielgruppeFelder({
  idPrefix,
  zielgruppe,
  orte,
  gebaeude,
  onChange,
}: {
  idPrefix: string;
  zielgruppe: Zielgruppe;
  orte: string[];
  gebaeude: string[];
  onChange: (patch: { zielgruppe?: Zielgruppe; orte?: string[]; gebaeude?: string[] }) => void;
}) {
  const { data: haeuser = [] } = useGebaeudeAuswahl();
  const [orteText, setOrteText] = useState(orte.join(", "));
  useEffect(() => setOrteText(orte.join(", ")), [orte.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-zg`}>Wer soll es sehen?</Label>
        <Select value={zielgruppe} onValueChange={(v) => onChange({ zielgruppe: v as Zielgruppe })}>
          <SelectTrigger id={`${idPrefix}-zg`} className="h-11"><SelectValue /></SelectTrigger>
          <SelectContent>
            {ZIELGRUPPEN.map((z) => <SelectItem key={z.key} value={z.key} className="min-h-10">{z.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {zielgruppe === "orte" && (
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-orte`}>Orte</Label>
          <Input
            id={`${idPrefix}-orte`}
            className="h-11"
            value={orteText}
            placeholder="z. B. Pfronten, Nesselwang"
            onChange={(e) => setOrteText(e.target.value)}
            onBlur={() => onChange({ orte: orteText.split(",").map((x) => x.trim()).filter(Boolean) })}
          />
          <p className="text-xs text-muted-foreground">Mit Komma trennen. Es zählt der Ort des Hauses.</p>
        </div>
      )}
      {zielgruppe === "gebaeude" && (
        <div className="space-y-1.5">
          <Label>Häuser</Label>
          <div className="max-h-52 overflow-y-auto rounded-lg border divide-y">
            {haeuser.map((h) => {
              const an = gebaeude.includes(h.id);
              return (
                <label key={h.id} className="flex min-h-11 cursor-pointer items-center gap-3 px-3 text-sm">
                  <Checkbox
                    checked={an}
                    onCheckedChange={(v) => onChange({ gebaeude: v ? [...gebaeude, h.id] : gebaeude.filter((x) => x !== h.id) })}
                  />
                  <span className="min-w-0 truncate">{h.name}</span>
                  {h.city && <span className="ml-auto shrink-0 text-xs text-muted-foreground">{h.city}</span>}
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
