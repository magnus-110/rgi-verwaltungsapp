import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlarmClock, Check, CornerUpLeft, Forward, Loader2, Paperclip, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useComposeEmail } from "@/contexts/ComposeEmailContext";

export interface KiSchritt {
  typ: "anhang" | "weiterleiten" | "wiedervorlage";
  titel: string;
  datei_id?: string;
  name?: string;
  pfad?: string;
  bucket?: string;
  mime?: string;
  an_email?: string;
  an_name?: string;
  text?: string;
  datum?: string;
}

interface Props {
  email: {
    id: string;
    subject?: string | null;
    body_text?: string | null;
    body_html?: string | null;
    account_id: string;
    building_id?: string | null;
    message_id?: string | null;
  };
  stufe: string | null | undefined;
  entwurf: string | null | undefined;
  schritte: KiSchritt[] | null | undefined;
  /** Öffnet „Antworten“ mit dem KI-Entwurf, optional mit Anhängen */
  onAntworten: (anhaenge?: File[]) => void;
}

/**
 * „Vorgeschlagene Schritte“ unter einer Mail: Antwortentwurf, passender Anhang aus dem DMS,
 * Weiterleitung an Zuständige, Wiedervorlage. Nichts passiert ohne Klick; jeder Knopf öffnet
 * das bekannte Fenster bereits ausgefüllt.
 */
export function KiSchritte({ email, stufe, entwurf, schritte, onAntworten }: Props) {
  const { user } = useAuth();
  const { openCompose } = useComposeEmail();
  const queryClient = useQueryClient();
  const [laedt, setLaedt] = useState<string | null>(null);
  const [daten, setDaten] = useState<Record<number, string>>({});

  const { data: vorhandeneWv = [] } = useQuery({
    queryKey: ["ki-wiedervorlagen", email.id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("todos")
        .select("id, title")
        .eq("source_type", "email")
        .eq("source_id", email.id)
        .is("deleted_at", null);
      return (data || []) as { id: string; title: string }[];
    },
  });

  const mitEntwurf = (stufe === "gruen" || stufe === "gelb") && !!entwurf;
  const liste = schritte || [];
  if (!mitEntwurf && liste.length === 0) return null;

  const antwortMitAnhang = async (s: KiSchritt, key: string) => {
    if (!s.pfad) return;
    setLaedt(key);
    try {
      const { data, error } = await supabase.storage.from(s.bucket || "building-files").download(s.pfad);
      if (error || !data) throw error || new Error("Datei nicht gefunden");
      const name = s.name || s.pfad.split("/").pop() || "Anhang";
      onAntworten([new File([data], name, { type: s.mime || data.type || "application/octet-stream" })]);
    } catch (e: any) {
      toast.error("Anhang konnte nicht geladen werden: " + (e?.message || ""));
    } finally {
      setLaedt(null);
    }
  };

  const weiterleiten = (s: KiSchritt) => {
    const original = email.body_text || "";
    openCompose({
      forward: {
        email_id: email.id,
        message_id: email.message_id,
        subject: email.subject || "",
        body_text: original,
        body_html: email.body_html || "",
        account_id: email.account_id,
      } as any,
      prefill: {
        to: s.an_email || "",
        bodyText: `${(s.text || "").trim()}\n\n--- Weitergeleitete Nachricht ---\n${original}`,
      },
    });
  };

  const wiedervorlage = async (s: KiSchritt, i: number) => {
    if (!user?.id) return;
    setLaedt(`wv-${i}`);
    try {
      const { error } = await (supabase as any).from("todos").insert({
        title: s.titel.replace(/^Wiedervorlage:\s*/i, ""),
        description: [s.text, `Aus E-Mail: ${email.subject || ""}`].filter(Boolean).join("\n\n"),
        due_date: daten[i] || s.datum,
        created_by: user.id,
        assigned_to: user.id,
        building_id: email.building_id || null,
        source_type: "email",
        source_id: email.id,
        priority: "medium",
      });
      if (error) throw error;
      toast.success("Wiedervorlage angelegt");
      queryClient.invalidateQueries({ queryKey: ["ki-wiedervorlagen", email.id] });
      queryClient.invalidateQueries({ queryKey: ["todos"] });
    } catch (e: any) {
      toast.error("Wiedervorlage fehlgeschlagen: " + (e?.message || ""));
    } finally {
      setLaedt(null);
    }
  };

  const zeile = (icon: React.ReactNode, titel: string, unter: React.ReactNode, aktion: React.ReactNode, key: string) => (
    <div key={key} className="flex items-center gap-3 rounded-md border bg-background px-3 py-2">
      <span className="text-muted-foreground shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-sm truncate">{titel}</div>
        <div className="text-xs text-muted-foreground truncate">{unter}</div>
      </div>
      <div className="shrink-0">{aktion}</div>
    </div>
  );

  return (
    <div className="mx-4 mb-3 rounded-lg border bg-muted/30 p-3 space-y-2">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5" /> Vorgeschlagene Schritte
      </div>

      {mitEntwurf &&
        zeile(
          <CornerUpLeft className="h-4 w-4" />,
          stufe === "gruen" ? "Antwort vorbereitet" : "Antwortentwurf (bitte ergänzen)",
          `„${(entwurf || "").replace(/^[^\n]*,\s*\n+/, "").replace(/\s+/g, " ").slice(0, 110)}…“`,
          <Button size="sm" variant="outline" onClick={() => onAntworten()}>
            Antworten
          </Button>,
          "antwort",
        )}

      {liste.map((s, i) => {
        if (s.typ === "anhang")
          return zeile(
            <Paperclip className="h-4 w-4" />,
            s.titel,
            `Datei aus dem DMS: ${s.name || ""}`,
            <Button size="sm" variant="outline" disabled={laedt === `a-${i}`} onClick={() => antwortMitAnhang(s, `a-${i}`)}>
              {laedt === `a-${i}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Antworten mit Anhang"}
            </Button>,
            `a-${i}`,
          );
        if (s.typ === "weiterleiten")
          return zeile(
            <Forward className="h-4 w-4" />,
            s.titel,
            `an ${s.an_name ? `${s.an_name} ` : ""}<${s.an_email}>`,
            <Button size="sm" variant="outline" onClick={() => weiterleiten(s)}>
              Ansehen
            </Button>,
            `w-${i}`,
          );
        const schon = vorhandeneWv.length > 0;
        return zeile(
          <AlarmClock className="h-4 w-4" />,
          s.titel,
          s.text || "Aufgabe mit Fälligkeit, dir zugeordnet",
          schon ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Check className="h-3.5 w-3.5" /> angelegt
            </span>
          ) : (
            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                className="h-8 w-[8.5rem] text-xs"
                value={daten[i] || s.datum || ""}
                onChange={(e) => setDaten((d) => ({ ...d, [i]: e.target.value }))}
              />
              <Button size="sm" variant="outline" disabled={laedt === `wv-${i}`} onClick={() => wiedervorlage(s, i)}>
                {laedt === `wv-${i}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Anlegen"}
              </Button>
            </div>
          ),
          `v-${i}`,
        );
      })}

      <p className="text-[11px] text-muted-foreground">Nichts passiert ohne Klick – du kannst alles ändern oder schließen.</p>
    </div>
  );
}
