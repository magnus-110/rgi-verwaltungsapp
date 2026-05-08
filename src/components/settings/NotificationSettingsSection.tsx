import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Bell, BellOff, Mail, CheckSquare, Calendar, Smartphone, CheckCircle2, XCircle, AlertCircle, BellRing, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePushSubscription } from "@/hooks/usePushSubscription";
import { toast } from "sonner";

interface Prefs {
  email_enabled: boolean;
  todo_enabled: boolean;
  calendar_enabled: boolean;
  todo_lead_minutes: number;
  calendar_lead_minutes: number;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  in_app_email_enabled: boolean;
  in_app_report_enabled: boolean;
  in_app_todo_enabled: boolean;
}

interface MailAccount { id: string; display_name: string | null; email_address: string }

const DEFAULT_PREFS: Prefs = {
  email_enabled: true,
  todo_enabled: true,
  calendar_enabled: true,
  todo_lead_minutes: 60,
  calendar_lead_minutes: 30,
  quiet_hours_start: null,
  quiet_hours_end: null,
  in_app_email_enabled: true,
  in_app_report_enabled: true,
  in_app_todo_enabled: true,
};

function StatusRow({ ok, label, hint }: { ok: boolean | null; label: string; hint?: string }) {
  const Icon = ok === true ? CheckCircle2 : ok === false ? XCircle : AlertCircle;
  const color = ok === true ? "text-green-600" : ok === false ? "text-red-600" : "text-amber-600";
  return (
    <div className="flex items-start gap-2 text-sm">
      <Icon className={`w-4 h-4 mt-0.5 ${color}`} />
      <div>
        <div>{label}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
    </div>
  );
}

export function NotificationSettingsSection() {
  const { user } = useAuth();
  const push = usePushSubscription();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [accounts, setAccounts] = useState<MailAccount[]>([]);
  const [subscribedAccountIds, setSubscribedAccountIds] = useState<Set<string>>(new Set());
  const [inAppAccountIds, setInAppAccountIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [lastTestResult, setLastTestResult] = useState<string | null>(null);
  const [lastTestDevices, setLastTestDevices] = useState<any[] | null>(null);
  const [serverVapidFp, setServerVapidFp] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: p }, { data: accs }, { data: subs }] = await Promise.all([
        supabase.from("notification_preferences").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("email_accounts").select("id, display_name, email_address").eq("is_active", true).order("display_name"),
        supabase.from("email_account_subscriptions").select("account_id").eq("user_id", user.id),
      ]);
      if (p) setPrefs({
        email_enabled: p.email_enabled,
        todo_enabled: p.todo_enabled,
        calendar_enabled: p.calendar_enabled,
        todo_lead_minutes: p.todo_lead_minutes,
        calendar_lead_minutes: p.calendar_lead_minutes,
        quiet_hours_start: p.quiet_hours_start,
        quiet_hours_end: p.quiet_hours_end,
        in_app_email_enabled: (p as any).in_app_email_enabled ?? true,
        in_app_report_enabled: (p as any).in_app_report_enabled ?? true,
        in_app_todo_enabled: (p as any).in_app_todo_enabled ?? true,
      });
      setAccounts(accs ?? []);
      setSubscribedAccountIds(new Set((subs ?? []).map((s) => s.account_id)));
    })();
  }, [user]);

  async function savePrefs(next: Prefs) {
    if (!user) return;
    setPrefs(next);
    setSaving(true);
    const { error } = await supabase.from("notification_preferences").upsert({
      user_id: user.id,
      ...next,
    });
    setSaving(false);
    if (error) toast.error("Speichern fehlgeschlagen: " + error.message);
  }

  async function toggleAccount(accountId: string, on: boolean) {
    if (!user) return;
    const next = new Set(subscribedAccountIds);
    if (on) {
      next.add(accountId);
      const { error } = await supabase.from("email_account_subscriptions").insert({ user_id: user.id, account_id: accountId });
      if (error) { toast.error(error.message); return; }
    } else {
      next.delete(accountId);
      await supabase.from("email_account_subscriptions").delete().eq("user_id", user.id).eq("account_id", accountId);
    }
    setSubscribedAccountIds(next);
  }

  async function localTest() {
    const res = await push.showLocalTest();
    if (res.error) toast.error("Lokaler Test fehlgeschlagen: " + res.error);
    else toast.success("Lokale Notification ausgelöst – siehst du sie?");
  }

  async function serverTest() {
    if (!user) return;
    setLastTestResult(null);
    setLastTestDevices(null);
    const { data, error } = await supabase.functions.invoke("send-push", {
      body: {
        user_ids: [user.id],
        dedup_key: `test:${user.id}:${Date.now()}:${Math.random().toString(36).slice(2)}`,
        type: "test",
        title: "Test-Benachrichtigung",
        body: "Wenn du das siehst, funktioniert Push einwandfrei.",
        url: "/",
        requireInteraction: true,
      },
    });
    if (error) {
      toast.error("Server-Test fehlgeschlagen: " + error.message);
      setLastTestResult("Fehler: " + error.message);
      return;
    }
    const me = (data as any)?.results?.[user.id];
    const status = me?.status ?? "unbekannt";
    setServerVapidFp(me?.server_vapid_fp ?? null);
    setLastTestDevices(Array.isArray(me?.devices) ? me.devices : null);
    setLastTestResult(`Server-Antwort: ${status} (gesamt ausgeliefert: ${(data as any)?.totalSent ?? 0})`);
    if (typeof status === "string" && status.startsWith("sent:")) {
      toast.success("Server-Push gesendet. Warte 1–2 Sek. auf Anzeige.");
    } else {
      toast.warning(`Server hat nicht zugestellt: ${status}`);
    }
  }

  const lastReceived = push.diagnostics.lastPushReceivedAt
    ? new Date(push.diagnostics.lastPushReceivedAt).toLocaleTimeString("de-DE")
    : null;
  const lastShown = push.diagnostics.lastPushShownAt
    ? new Date(push.diagnostics.lastPushShownAt).toLocaleTimeString("de-DE")
    : null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="w-5 h-5" />
            Push-Benachrichtigungen auf diesem Gerät
          </CardTitle>
          <CardDescription>
            Aktiviere Push, um neue E-Mails, fällige Aufgaben und anstehende Termine direkt auf Windows oder Android zu erhalten.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!push.supported ? (
            <p className="text-sm text-muted-foreground">Dein Browser unterstützt keine Web-Push-Benachrichtigungen.</p>
          ) : push.subscribed ? (
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Badge variant="default" className="bg-green-600 hover:bg-green-600"><Bell className="w-3 h-3 mr-1" />Aktiv</Badge>
                <span className="text-sm text-muted-foreground">Dieses Gerät erhält Benachrichtigungen.</span>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" variant="outline" onClick={localTest}>
                  <BellRing className="w-4 h-4 mr-1.5" />
                  Lokaler Test
                </Button>
                <Button size="sm" variant="outline" onClick={serverTest}>
                  <Send className="w-4 h-4 mr-1.5" />
                  Server-Test
                </Button>
                <Button size="sm" variant="outline" onClick={() => push.hardReset()} disabled={push.loading}>
                  Service Worker neu registrieren
                </Button>
                <Button size="sm" variant="outline" onClick={push.unsubscribe} disabled={push.loading}>
                  <BellOff className="w-4 h-4 mr-1" /> Deaktivieren
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <span className="text-sm text-muted-foreground">
                {push.permission === "denied"
                  ? "Benachrichtigungen wurden im Browser blockiert. Bitte in den Browser-Einstellungen freischalten."
                  : "Dieses Gerät ist noch nicht angemeldet."}
              </span>
              <Button onClick={push.subscribe} disabled={push.loading || push.permission === "denied"}>
                <Bell className="w-4 h-4 mr-1" /> Aktivieren
              </Button>
            </div>
          )}

          <Separator />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <StatusRow ok={push.supported} label="Browser unterstützt Push" />
            <StatusRow
              ok={push.permission === "granted" ? true : push.permission === "denied" ? false : null}
              label={`Berechtigung: ${push.permission}`}
              hint={push.permission === "denied" ? "Im Chrome bei Schloss-Symbol → Benachrichtigungen erlauben." : undefined}
            />
            <StatusRow ok={push.diagnostics.swRegistered} label="Service Worker registriert" />
            <StatusRow ok={push.diagnostics.swActive} label="Service Worker aktiv" />
            <StatusRow ok={push.subscribed} label="Gerät als Push-Empfänger registriert" />
            <StatusRow
              ok={push.diagnostics.swVersion ? (/rgi-sw-v[5-9]/.test(push.diagnostics.swVersion) ? true : null) : null}
              label={push.diagnostics.swVersion ? `SW-Version: ${push.diagnostics.swVersion}` : "SW-Version unbekannt"}
              hint={push.diagnostics.swVersion && !/rgi-sw-v[5-9]/.test(push.diagnostics.swVersion)
                ? "Veraltete SW-Version aktiv – bitte 'Service Worker neu registrieren' klicken."
                : undefined}
            />
            <StatusRow
              ok={lastReceived ? true : null}
              label={lastReceived ? `Letzter Push empfangen: ${lastReceived}` : "Noch kein Push in dieser Session empfangen"}
              hint="Wird gesetzt, sobald der Service Worker einen Push aus dem Netz erhält."
            />
            <StatusRow
              ok={lastShown ? true : push.diagnostics.lastPushShowError ? false : null}
              label={lastShown ? `Letzte Server-Notification angezeigt: ${lastShown}` : "Noch keine Server-Notification angezeigt"}
              hint={push.diagnostics.lastPushShowError ?? "Wenn empfangen grün ist, aber dies rot bleibt, blockiert Chrome/Windows die Anzeige."}
            />
          </div>
          {lastTestResult && (
            <p className="text-xs text-muted-foreground">{lastTestResult}</p>
          )}
          {serverVapidFp && push.diagnostics.vapidFingerprint && serverVapidFp !== push.diagnostics.vapidFingerprint && (
            <p className="text-xs text-red-600">
              VAPID-Schlüssel-Mismatch erkannt (Server {serverVapidFp} vs. Browser {push.diagnostics.vapidFingerprint}).
              Bitte „Service Worker neu registrieren“ klicken.
            </p>
          )}
          {lastTestDevices && lastTestDevices.length > 0 && (
            <div className="rounded-md border bg-muted/30 p-3 space-y-2">
              <div className="text-xs font-medium">Server-Test pro Gerät</div>
              {lastTestDevices.map((d: any) => (
                <div key={d.id} className="text-xs flex flex-wrap gap-x-3 gap-y-0.5">
                  <span className={
                    d.status === "sent" ? "text-green-600 font-medium"
                    : d.status?.startsWith("removed") ? "text-amber-600"
                    : d.status?.startsWith("invalid_fresh") ? "text-red-600 font-medium"
                    : d.status === "vapid_mismatch" ? "text-red-600 font-medium"
                    : "text-red-600"
                  }>{d.status}</span>
                  <span>{d.device_label || "Gerät"}</span>
                  <span className="text-muted-foreground truncate max-w-[200px]">{d.user_agent}</span>
                  <span className="text-muted-foreground">VAPID: {d.sub_vapid_fp ?? "—"} / {d.server_vapid_fp}</span>
                  {d.error && <span className="text-red-600">{d.error}</span>}
                </div>
              ))}
              <p className="text-[11px] text-muted-foreground">
                „sent“ heißt: Push-Dienst hat angenommen. Steht hier „vapid_mismatch“, wurde dieses Gerät mit einem anderen Schlüssel angemeldet — bitte neu registrieren.
              </p>
            </div>
          )}
          {push.lastError && (
            <p className="text-xs text-red-600">Letzter Fehler: {push.lastError}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Benachrichtigungsarten</CardTitle>
          <CardDescription>Lege fest, wofür du Push erhalten möchtest.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="flex items-center gap-2"><Mail className="w-4 h-4" /> Neue E-Mails</Label>
              <p className="text-xs text-muted-foreground">Nur für die unten ausgewählten Postfächer.</p>
            </div>
            <Switch checked={prefs.email_enabled} onCheckedChange={(v) => savePrefs({ ...prefs, email_enabled: v })} />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="flex items-center gap-2"><CheckSquare className="w-4 h-4" /> Fällige Aufgaben</Label>
              <p className="text-xs text-muted-foreground">Vorlauf in Minuten vor Fälligkeit.</p>
            </div>
            <div className="flex items-center gap-3">
              <Input
                type="number" min={0} max={1440} className="w-20"
                value={prefs.todo_lead_minutes}
                onChange={(e) => savePrefs({ ...prefs, todo_lead_minutes: Number(e.target.value) || 0 })}
                disabled={!prefs.todo_enabled}
              />
              <Switch checked={prefs.todo_enabled} onCheckedChange={(v) => savePrefs({ ...prefs, todo_enabled: v })} />
            </div>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="flex items-center gap-2"><Calendar className="w-4 h-4" /> Anstehende Termine</Label>
              <p className="text-xs text-muted-foreground">Vorlauf in Minuten. Mit Aufgabe verknüpfte Termine senden nur einmal.</p>
            </div>
            <div className="flex items-center gap-3">
              <Input
                type="number" min={0} max={1440} className="w-20"
                value={prefs.calendar_lead_minutes}
                onChange={(e) => savePrefs({ ...prefs, calendar_lead_minutes: Number(e.target.value) || 0 })}
                disabled={!prefs.calendar_enabled}
              />
              <Switch checked={prefs.calendar_enabled} onCheckedChange={(v) => savePrefs({ ...prefs, calendar_enabled: v })} />
            </div>
          </div>
          <Separator />
          <div>
            <Label className="text-sm font-medium">Ruhezeiten (optional)</Label>
            <p className="text-xs text-muted-foreground mb-2">In diesem Zeitraum werden keine Push-Benachrichtigungen gesendet.</p>
            <div className="flex items-center gap-3 flex-wrap">
              <Input type="time" value={prefs.quiet_hours_start ?? ""} onChange={(e) => savePrefs({ ...prefs, quiet_hours_start: e.target.value || null })} className="w-32" />
              <span className="text-muted-foreground">bis</span>
              <Input type="time" value={prefs.quiet_hours_end ?? ""} onChange={(e) => savePrefs({ ...prefs, quiet_hours_end: e.target.value || null })} className="w-32" />
              {(prefs.quiet_hours_start || prefs.quiet_hours_end) && (
                <Button size="sm" variant="ghost" onClick={() => savePrefs({ ...prefs, quiet_hours_start: null, quiet_hours_end: null })}>Zurücksetzen</Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Mail className="w-5 h-5" /> E-Mail-Postfächer abonnieren</CardTitle>
          <CardDescription>Wähle gezielt aus, für welche Postfächer du Push-Benachrichtigungen bei eingehenden Mails erhalten möchtest.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {accounts.length === 0 && <p className="text-sm text-muted-foreground">Keine aktiven E-Mail-Konten gefunden.</p>}
          {accounts.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-4 p-3 rounded-md border bg-card">
              <div className="min-w-0">
                <p className="font-medium truncate">{a.display_name || a.email_address}</p>
                <p className="text-xs text-muted-foreground truncate">{a.email_address}</p>
              </div>
              <Switch
                checked={subscribedAccountIds.has(a.id)}
                onCheckedChange={(v) => toggleAccount(a.id, v)}
                disabled={!prefs.email_enabled}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><BellRing className="w-5 h-5" /> In-App-Benachrichtigungen</CardTitle>
          <CardDescription>
            Kleine Pop-ups unten rechts während du in der App arbeitest. Erscheinen 4 Sekunden lang und sind manuell schließbar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2"><Mail className="w-4 h-4" /> Neue E-Mails</Label>
            <Switch checked={prefs.in_app_email_enabled} onCheckedChange={(v) => savePrefs({ ...prefs, in_app_email_enabled: v })} />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2"><AlertCircle className="w-4 h-4" /> Neue Meldungen</Label>
            <Switch checked={prefs.in_app_report_enabled} onCheckedChange={(v) => savePrefs({ ...prefs, in_app_report_enabled: v })} />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2"><CheckSquare className="w-4 h-4" /> Neue Aufgaben</Label>
            <Switch checked={prefs.in_app_todo_enabled} onCheckedChange={(v) => savePrefs({ ...prefs, in_app_todo_enabled: v })} />
          </div>
        </CardContent>
      </Card>

      {saving && <p className="text-xs text-muted-foreground text-right">Speichern…</p>}
    </div>
  );
}
