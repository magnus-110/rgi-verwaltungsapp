/**
 * Gemeinsame Kontaktauswahl aus „Adressen“: Suche (Name, Personen, Telefon, E-Mail – über public.aehnliche_kontakte),
 * Ergebnisliste und „Neu anlegen“ (mit Dubletten-Warnung im Formular).
 * Alter Freitext (z. B. aus building_service_providers.name) wird angezeigt, solange nichts verknüpft ist.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, Check, ChevronsUpDown, Link2Off, Loader2, Plus, Search, User, Wrench } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CreateContactDialog, type CreateContactPrefill } from "./CreateContactDialog";
import { aehnlicheKontakte, kontaktAnzeigename, sucheAusText } from "@/lib/kontaktSuche";

export interface GewaehlterKontakt {
  id: string;
  name: string;
}

interface Props {
  /** contacts.id oder null */
  value: string | null;
  onChange: (contactId: string | null, kontakt?: GewaehlterKontakt) => void;
  /** Alter Freitext – wird angezeigt, solange kein Kontakt verknüpft ist. */
  freitext?: string | null;
  placeholder?: string;
  /** Vorbelegung für „Neu anlegen“ (Name aus dem Suchfeld wird ergänzt). */
  neuVorbelegung?: CreateContactPrefill;
  neuTitel?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  /** „Neu anlegen“ anbieten (Standard: ja) */
  neuAnlegen?: boolean;
  /** Diese Kontakte nicht in der Ergebnisliste zeigen */
  ausschliessen?: string[];
}

export function useKontaktName(contactId: string | null | undefined) {
  return useQuery({
    queryKey: ["kontakt-name", contactId],
    enabled: !!contactId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("contacts")
        .select("id, company_name, short_name, first_name, last_name, address_city")
        .eq("id", contactId!)
        .maybeSingle();
      return data ? { name: kontaktAnzeigename(data), ort: (data as any).address_city as string | null } : null;
    },
  });
}

export function KontaktAuswahl({
  value,
  onChange,
  freitext,
  placeholder = "Aus Adressen wählen …",
  neuVorbelegung,
  neuTitel,
  disabled,
  className,
  id,
  neuAnlegen = true,
  ausschliessen,
}: Props) {
  const [offen, setOffen] = useState(false);
  const [text, setText] = useState("");
  const [suche, setSuche] = useState("");
  const [neuOffen, setNeuOffen] = useState(false);
  const { data: gewaehlt } = useKontaktName(value);

  // Beim Öffnen: alten Freitext als Suchbegriff vorschlagen
  useEffect(() => {
    if (offen) setText(!value && freitext ? freitext : "");
  }, [offen, value, freitext]);

  useEffect(() => {
    const t = setTimeout(() => setSuche(text.trim()), 250);
    return () => clearTimeout(t);
  }, [text]);

  const { data: treffer = [], isFetching } = useQuery({
    queryKey: ["kontakt-auswahl", suche],
    enabled: offen && suche.length >= 2,
    staleTime: 30_000,
    queryFn: () => aehnlicheKontakte(sucheAusText(suche), 12),
    select: (l) => (ausschliessen?.length ? l.filter((k) => !ausschliessen.includes(k.contact_id)) : l),
  });

  const waehlen = (contactId: string, name: string) => {
    onChange(contactId, { id: contactId, name });
    setOffen(false);
  };

  const neuPrefill = (): CreateContactPrefill => {
    const n = text.trim() || freitext?.trim() || "";
    const art = sucheAusText(n);
    const firma = (neuVorbelegung?.contactType ?? "company") !== "person";
    return {
      contactType: "company",
      ...neuVorbelegung,
      ...(art.name ? (firma ? { companyName: art.name } : { lastName: art.name }) : {}),
      ...(art.email ? { email: art.email } : {}),
      ...(art.telefon ? { phone: art.telefon } : {}),
    };
  };

  const anzeige = value ? gewaehlt?.name ?? "…" : null;

  return (
    <>
      <Popover open={offen} onOpenChange={setOffen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={offen}
            disabled={disabled}
            className={cn("w-full justify-between font-normal", className)}
          >
            <span className="min-w-0 truncate text-left">
              {anzeige ? (
                <span className="flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <span className="truncate">{anzeige}</span>
                  {gewaehlt?.ort && <span className="truncate text-xs text-muted-foreground">· {gewaehlt.ort}</span>}
                </span>
              ) : freitext?.trim() ? (
                <span className="text-muted-foreground">
                  „{freitext.trim()}“ <span className="text-xs">(nicht verknüpft)</span>
                </span>
              ) : (
                <span className="text-muted-foreground">{placeholder}</span>
              )}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[300px] p-0" align="start">
          <div className="border-b border-border p-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Name, Telefon oder E-Mail …"
                className="h-9 pl-8"
              />
              {isFetching && (
                <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
              )}
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto p-1">
            {suche.length < 2 ? (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">Mindestens 2 Zeichen eingeben</p>
            ) : !isFetching && treffer.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">Nichts gefunden</p>
            ) : (
              treffer.map((k) => {
                const Icon = k.dienstleister ? Wrench : k.kontakt_typ === "person" ? User : Building2;
                return (
                  <button
                    key={k.contact_id}
                    type="button"
                    onClick={() => waehlen(k.contact_id, k.anzeige)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left hover:bg-muted",
                      value === k.contact_id && "bg-primary/10",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{k.anzeige}</span>
                      {k.ort && <span className="block truncate text-xs text-muted-foreground">{k.ort}</span>}
                    </span>
                    {value === k.contact_id && <Check className="h-4 w-4 shrink-0 text-primary" />}
                  </button>
                );
              })
            )}
          </div>
          {(neuAnlegen || value) && (
          <div className="flex flex-wrap gap-1 border-t border-border p-1">
            {neuAnlegen && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="flex-1 justify-start"
              onClick={() => {
                setOffen(false);
                setNeuOffen(true);
              }}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              {text.trim() ? <>„{text.trim()}“ neu anlegen</> : "Neu anlegen"}
            </Button>
            )}
            {value && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => {
                  onChange(null);
                  setOffen(false);
                }}
              >
                <Link2Off className="mr-1.5 h-4 w-4" /> Lösen
              </Button>
            )}
          </div>
          )}
        </PopoverContent>
      </Popover>

      <CreateContactDialog
        open={neuOffen}
        onOpenChange={setNeuOffen}
        title={neuTitel ?? "Neuer Kontakt"}
        prefill={neuOffen ? neuPrefill() : undefined}
        onCreated={async (cid) => {
          if (!cid) return;
          const { data } = await supabase
            .from("contacts")
            .select("company_name, short_name, first_name, last_name")
            .eq("id", cid)
            .maybeSingle();
          onChange(cid, { id: cid, name: kontaktAnzeigename(data) });
        }}
      />
    </>
  );
}
