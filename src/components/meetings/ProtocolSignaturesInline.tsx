import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { SignaturePad } from "@/components/buildings/keys/SignaturePad";
import { Archive, CheckCircle2, Loader2, Maximize2 } from "lucide-react";
import { toast } from "sonner";

const ROLES = [
  { key: "eigentuemer", label: "Eigentümer" },
  { key: "leiter", label: "Versammlungsleiter" },
  { key: "protokollant", label: "Protokollführer" },
] as const;

type RoleKey = typeof ROLES[number]["key"];

const INLINE_HEIGHT = 160;
const FULL_HEIGHT = 320;

function SignatureColumn({
  meetingId,
  role,
  label,
  existing,
  onSaved,
}: {
  meetingId: string;
  role: RoleKey;
  label: string;
  existing?: { signer_name: string; signature_png: string } | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState(existing?.signer_name || "");
  const [png, setPng] = useState<string | null>(existing?.signature_png || null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setName(existing?.signer_name || "");
    setPng(existing?.signature_png || null);
  }, [existing?.signer_name, existing?.signature_png]);

  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim() || !png) return;
      await supabase.from("etv_protocol_signatures").delete().eq("meeting_id", meetingId).eq("role", role);
      const { error } = await supabase.from("etv_protocol_signatures").insert({
        meeting_id: meetingId, role, signer_name: name.trim(), signature_png: png,
      });
      if (error) throw error;
    },
    onSuccess: () => { onSaved(); toast.success(`${label}: Unterschrift gespeichert`); },
    onError: (e: any) => toast.error(e.message),
  });

  const isSigned = !!existing;

  const handleSaveAndClose = () => {
    if (name.trim() && png) {
      save.mutate(undefined, {
        onSuccess: () => setOpen(false),
      });
    } else {
      setOpen(false);
    }
  };

  return (
    <div className="rounded-lg border bg-card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium">{label}</div>
        {isSigned && <Badge variant="secondary" className="gap-1 h-5 text-[10px]"><CheckCircle2 className="h-3 w-3" />signiert</Badge>}
      </div>
      <div className="relative">
        <SignaturePad value={png} onChange={setPng} height={INLINE_HEIGHT} />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="absolute top-1 right-1 h-7 w-7 p-0 opacity-60 hover:opacity-100"
          onClick={() => setOpen(true)}
          title="Vergrößern"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Vor- und Nachname"
        className="h-8 text-xs"
        onBlur={() => { if (name.trim() && png && (name !== existing?.signer_name || png !== existing?.signature_png)) save.mutate(); }}
      />
      <Button
        size="sm" variant="outline" className="w-full h-7 text-xs"
        disabled={!name.trim() || !png || save.isPending}
        onClick={() => save.mutate()}
      >
        {save.isPending && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
        Speichern
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">{label} — Unterschrift</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <SignaturePad value={png} onChange={setPng} height={FULL_HEIGHT} />
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Vor- und Nachname"
              className="h-9 text-sm"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Abbrechen</Button>
            <Button size="sm" disabled={!name.trim() || !png || save.isPending} onClick={handleSaveAndClose}>
              {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
              Speichern & Schließen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function ProtocolSignaturesInline({ meetingId }: { meetingId: string }) {
  const qc = useQueryClient();
  const { data: signatures = [] } = useQuery({
    queryKey: ["etv-protocol-signatures", meetingId],
    queryFn: async () => {
      const { data } = await supabase.from("etv_protocol_signatures").select("*").eq("meeting_id", meetingId);
      return data || [];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["etv-protocol-signatures", meetingId] });

  const allSigned = ROLES.every((r) => signatures.some((s: any) => s.role === r.key));

  const finalize = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("etv-finalize-signed-protocol", { body: { meeting_id: meetingId } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { signed_url: string; dms_file_id: string | null };
    },
    onSuccess: (d) => {
      toast.success(d.dms_file_id ? "Im DMS abgelegt" : "Erstellt");
      if (d.signed_url) window.open(d.signed_url, "_blank");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <div className="text-sm font-medium">Unterschriften</div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {ROLES.map((r) => (
          <SignatureColumn
            key={r.key}
            meetingId={meetingId}
            role={r.key}
            label={r.label}
            existing={signatures.find((s: any) => s.role === r.key) || null}
            onSaved={invalidate}
          />
        ))}
      </div>
      <div className="flex items-center justify-between pt-1">
        <Badge variant={allSigned ? "default" : "outline"} className="text-[10px]">
          {signatures.length} / 3 unterschrieben
        </Badge>
        <Button
          size="sm" variant={allSigned ? "default" : "ghost"}
          disabled={!allSigned || finalize.isPending}
          onClick={() => finalize.mutate()}
          className="gap-2"
        >
          {finalize.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
          Final signieren & im DMS ablegen
        </Button>
      </div>
    </div>
  );
}
