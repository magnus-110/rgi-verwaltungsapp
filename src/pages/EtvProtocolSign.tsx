import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, FileText, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { SignaturePad } from "@/components/buildings/keys/SignaturePad";

type Info = {
  status: string;
  signer_name: string;
  role_label: string;
  signed_at: string | null;
  meeting: { title: string; meeting_date: string | null; location: string | null; building: string };
  pdf_url: string | null;
};

const call = async (body: any) => {
  const { data, error } = await supabase.functions.invoke("etv-protocol-sign", { body });
  if (error) {
    let msg = error.message;
    try { const b = await (error as any)?.context?.json?.(); if (b?.error) msg = b.error; } catch { /* Standardmeldung */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
};

/** Öffentliche Seite: Protokoll ansehen und per Finger oder Maus unterschreiben. */
export const EtvProtocolSign = () => {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [png, setPng] = useState<string | null>(null);
  const [read, setRead] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    call({ action: "get", token })
      .then((d) => { setInfo(d); setName(d.signer_name || ""); if (d.status === "unterschrieben") setDone(true); })
      .catch((e) => setError(e.message));
  }, [token]);

  const submit = async () => {
    setBusy(true);
    try {
      await call({ action: "sign", token, signer_name: name, signature_png: png });
      setDone(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const date = info?.meeting.meeting_date ? new Date(info.meeting.meeting_date).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "long", year: "numeric" }) : "";

  return (
    <div className="min-h-screen bg-[#f7f5f2]">
      <header className="border-b bg-white">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-4">
          <img src="/lovable-uploads/8c5a36ed-b686-4ac4-a6ec-5f337fd466b7.png" alt="RGI Immobilien" className="h-9 w-auto object-contain" />
          <span className="text-sm text-muted-foreground">Protokoll unterschreiben</span>
        </div>
      </header>
      <main className="mx-auto max-w-2xl space-y-5 px-4 py-8">
        {!info && !error && <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}

        {error && !info && (
          <div className="rounded-2xl border bg-white p-8 text-center">
            <h1 className="mb-2 text-xl font-semibold">Link nicht verfügbar</h1>
            <p className="text-muted-foreground">{error}</p>
          </div>
        )}

        {info && (
          <>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-primary">{info.meeting.building}</p>
              <h1 className="text-2xl font-semibold leading-tight tracking-tight">{info.meeting.title}{date ? ` am ${date}` : ""}</h1>
              <p className="text-sm text-muted-foreground">Unterschrift als {info.role_label}</p>
            </div>

            {done ? (
              <div className="rounded-2xl border bg-white p-8 text-center">
                <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-emerald-600" />
                <h2 className="mb-1 text-xl font-semibold">Vielen Dank!</h2>
                <p className="text-muted-foreground">Ihre Unterschrift wurde gespeichert. Sie können dieses Fenster jetzt schließen.</p>
              </div>
            ) : (
              <>
                <div className="space-y-3 rounded-2xl border bg-white p-5">
                  <h2 className="text-base font-semibold">1. Protokoll lesen</h2>
                  {info.pdf_url ? (
                    <>
                      <Button asChild variant="outline" className="w-full gap-2">
                        <a href={info.pdf_url} target="_blank" rel="noopener noreferrer"><FileText className="h-4 w-4" /> Protokoll öffnen (PDF)</a>
                      </Button>
                      <iframe title="Protokoll" src={info.pdf_url} className="hidden h-[520px] w-full rounded-lg border md:block" />
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">Das Protokoll wird gerade erstellt. Bitte laden Sie die Seite in einer Minute neu oder wenden Sie sich an die Verwaltung.</p>
                  )}
                  <label className="flex items-start gap-2.5 pt-1 text-sm">
                    <Checkbox className="mt-0.5" checked={read} onCheckedChange={(v) => setRead(!!v)} />
                    Ich habe das Protokoll gelesen.
                  </label>
                </div>

                <div className="space-y-4 rounded-2xl border bg-white p-5">
                  <h2 className="text-base font-semibold">2. Unterschreiben</h2>
                  <div className="space-y-1.5">
                    <Label htmlFor="sig-name">Vor- und Nachname</Label>
                    <Input id="sig-name" value={name} onChange={(e) => setName(e.target.value)} className="h-11" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Unterschrift (mit Finger oder Maus)</Label>
                    <SignaturePad value={png} onChange={setPng} height={200} />
                  </div>
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  <Button className="h-12 w-full text-base" disabled={!read || !png || name.trim().length < 2 || busy} onClick={submit}>
                    {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Unterschrift absenden
                  </Button>
                </div>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
};
