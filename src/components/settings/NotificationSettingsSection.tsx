/**
 * Einstellungen › Benachrichtigungen (Neugestaltung 16.10.2026).
 *
 * 1. Dieses Gerät: Push an/aus (Fehlersuche eingeklappt darunter)
 * 2. Eine Übersicht „Worüber?" mit zwei Spalten: Handy/PC (Push) und In der App
 * 3. Postfächer: pro Postfach dieselben zwei Schalter
 */
import { useEffect, useState } from "react";
import { AlertCircle, Bell, BellOff, BellRing, Calendar, CheckCircle2, CheckSquare, ChevronDown, Mail, Monitor, Send, Smartphone, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePushSubscription } from "@/hooks/usePushSubscription";
import { showInAppToast } from "@/lib/inAppToast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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

const VORLAUF = [
  { v: 0, t: "Zur Fälligkeit" },
  { v: 15, t: "15 Min. vorher" },
  { v: 30, t: "30 Min. vorher" },
  { v: 60, t: "1 Std. vorher" },
  { v: 120, t: "2 Std. vorher" },
  { v: 1440, t: "1 Tag vorher" },
];

function VorlaufWahl({ wert, onChange, disabled }: { wert: number; onChange: (v: number) => void; disabled?: boolean }) {
  const optionen = VORLAUF.some((o) => o.v === wert) ? VORLAUF : [...VORLAUF, { v: wert, t: `${wert} Min. vorher` }];
  return (
    <Select value={String(wert)} onValueChange={(v) => onChange(Number(v))} disabled={disabled}>
      <SelectTrigger className="h-8 w-[150px] text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {optionen.map((o) => (
          <SelectItem key={o.v} value={String(o.v)}>
            {o.t}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function StatusRow({ ok, label, hint }: { ok: boolean | null; label: string; hint?: string }) {
  const Icon = ok === true ? CheckCircle2 : ok === false ? XCircle : AlertCircle;
  const color = ok === true ? "text-green-600" : ok === false ? "text-red-600" : "text-amber-600";
  return (
    <div className="flex items-start gap-2 text-sm">
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${color}`} />
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
  const [pushPostfaecher, setPushPostfaecher] = useState<Set<string>>(new Set());
  const [appPostfaecher, setAppPostfaecher] = useState<Set<string>>(new Set());
  const [testErgebnis, setTestErgebnis] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: p }, { data: accs }, { data: subs }, { data: inAppSubs }] = await Promise.all([
        supabase.from("notification_preferences").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("email_accounts").select("id, display_name, email_address").eq("is_active", true).order("display_name"),
        supabase.from("email_account_subscriptions").select("account_id").eq("user_id", user.id),
        (supabase as any).from("in_app_email_subscriptions").select("account_id").eq("user_id", user.id),
      ]);
      if (p)
        setPrefs({
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
      setPushPostfaecher(new Set((subs ?? []).map((s) => s.account_id)));
      setAppPostfaecher(new Set(((inAppSubs as any[]) ?? []).map((s: any) => s.account_id)));
    })();
  }, [user]);

  async function setze(teil: Partial<Prefs>) {
    if (!user) return;
    const next = { ...prefs, ...teil };
    setPrefs(next);
    const { error } = await supabase.from("notification_preferences").upsert({ user_id: user.id, ...next });
    if (error) toast.error("Speichern fehlgeschlagen: " + error.message);
  }

  async function postfachUmschalten(art: "push" | "app", accountId: string, an: boolean) {
    if (!user) return;
    const tabelle = art === "push" ? "email_account_subscriptions" : "in_app_email_subscriptions";
    const alt = art === "push" ? pushPostfaecher : appPostfaecher;
    const next = new Set(alt);
    if (an) {
      const { error } = await (supabase as any).from(tabelle).insert({ user_id: user.id, account_id: accountId });
      if (error) return toast.error(error.message);
      next.add(accountId);
    } else {
      await (supabase as any).from(tabelle).delete().eq("user_id", user.id).eq("account_id", accountId);
      next.delete(accountId);
    }
    (art === "push" ? setPushPostfaecher : setAppPostfaecher)(next);
  }

  async function serverTest() {
    if (!user) return;
    setTestErgebnis(null);
    const { data, error } = await supabase.functions.invoke("send-push", {
      body: {
        user_ids: [user.id],
        dedup_key: `test:${user.id}:${Date.now()}:${Math.random().toString(36).slice(2)}`,
        type: "test",
        title: "Test-Benachrichtigung",
        body: "Wenn du das siehst, funktioniert es.",
        url: "/",
        requireInteraction: true,
      },
    });
    if (error) {
      setTestErgebnis("Fehler: " + error.message);
      return toast.error("Test fehlgeschlagen: " + error.message);
    }
    const me = (data as any)?.results?.[user.id];
    const status = me?.status ?? "unbekannt";
    const geraete = Array.isArray(me?.devices) ? me.devices : [];
    setTestErgebnis(
      `Antwort: ${status}` +
        (geraete.length ? " · " + geraete.map((d: any) => `${d.device_label || "Gerät"}: ${d.status}${d.error ? ` (${d.error})` : ""}`).join(", ") : ""),
    );
    if (typeof status === "string" && status.startsWith("sent:")) toast.success("Gesendet – die Nachricht sollte gleich erscheinen.");
    else toast.warning(`Nicht zugestellt: ${status}`);
  }

  const zuletzt = (iso?: string | number | null) => (iso ? new Date(iso).toLocaleTimeString("de-DE") : null);
  const pushAus = !push.subscribed;

  const Zeile = ({
    icon: Icon, titel, hinweis, pushWert, onPush, appWert, onApp, extra,
  }: {
    icon: any; titel: string; hinweis: string;
    pushWert?: boolean; onPush?: (v: boolean) => void;
    appWert?: boolean; onApp?: (v: boolean) => void;
    extra?: React.ReactNode;
  }) => (
    <div className="grid grid-cols-[minmax(0,1fr)_64px_64px] items-center gap-2 px-5 py-3.5 sm:grid-cols-[minmax(0,1fr)_96px_96px]">
      <div className="min-w-0">
        <div className="flex items-center gap-2 font-medium">
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" /> {titel}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">{hinweis}</div>
        {extra && <div className="mt-2">{extra}</div>}
      </div>
      <div className="flex justify-center">
        {onPush ? <Switch checked={!!pushWert} onCheckedChange={onPush} aria-label={`${titel} aufs Handy/den PC`} /> : <span className="text-muted-foreground">–</span>}
      </div>
      <div className="flex justify-center">
        {onApp ? <Switch checked={!!appWert} onCheckedChange={onApp} aria-label={`${titel} in der App`} /> : <span className="text-muted-foreground">–</span>}
      </div>
    </div>
  );

  const Kopf = ({ links }: { links: string }) => (
    <div className="grid grid-cols-[minmax(0,1fr)_64px_64px] gap-2 border-b bg-muted/40 px-5 py-2 text-xs font-medium text-muted-foreground sm:grid-cols-[minmax(0,1fr)_96px_96px]">
      <span>{links}</span>
      <span className="flex items-center justify-center gap-1 text-center"><Smartphone className="hidden h-3.5 w-3.5 sm:block" /> Handy/PC</span>
      <span className="flex items-center justify-center gap-1 text-center"><Monitor className="hidden h-3.5 w-3.5 sm:block" /> In der App</span>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* 1. Dieses Gerät */}
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-4 space-y-0">
          <div className="flex min-w-0 items-center gap-3">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${push.subscribed ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300" : "bg-muted text-muted-foreground"}`}>
              {push.subscribed ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
            </div>
            <div className="min-w-0">
              <CardTitle className="text-base">Benachrichtigungen auf diesem Gerät</CardTitle>
              <CardDescription>
                {!push.supported
                  ? "Dieser Browser kann leider keine Benachrichtigungen anzeigen."
                  : push.subscribed
                    ? "An – dieses Gerät meldet sich auch, wenn die App geschlossen ist."
                    : push.permission === "denied"
                      ? "Im Browser blockiert. Beim Schloss-Symbol neben der Adresse „Benachrichtigungen“ erlauben."
                      : "Aus – jedes Gerät (PC, Handy) muss einmal eingeschaltet werden."}
              </CardDescription>
            </div>
          </div>
          {push.supported &&
            (push.subscribed ? (
              <Button variant="outline" onClick={push.unsubscribe} disabled={push.loading}>
                Ausschalten
              </Button>
            ) : (
              <Button onClick={push.subscribe} disabled={push.loading || push.permission === "denied"}>
                <Bell className="mr-1.5 h-4 w-4" /> Einschalten
              </Button>
            ))}
        </CardHeader>
        {push.supported && (
          <CardContent className="pt-0">
            <details className="group rounded-lg border">
              <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2.5 text-sm text-muted-foreground">
                Kommt nichts an? Hier testen
                <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
              </summary>
              <div className="space-y-4 border-t px-4 py-4">
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={serverTest} disabled={pushAus}>
                    <Send className="mr-1.5 h-4 w-4" /> Test aufs Gerät schicken
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      showInAppToast({ icon: <Mail className="h-4 w-4" />, title: "Neue E-Mail", subtitle: "Max Mustermann", detail: "Test – so sieht ein Hinweis in der App aus." })
                    }
                  >
                    <BellRing className="mr-1.5 h-4 w-4" /> Hinweis in der App testen
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => push.hardReset()} disabled={push.loading}>
                    Gerät neu anmelden
                  </Button>
                </div>
                {testErgebnis && <p className="text-xs text-muted-foreground">{testErgebnis}</p>}
                <div className="grid gap-2 sm:grid-cols-2">
                  <StatusRow
                    ok={push.permission === "granted" ? true : push.permission === "denied" ? false : null}
                    label={push.permission === "granted" ? "Browser erlaubt Benachrichtigungen" : push.permission === "denied" ? "Browser blockiert Benachrichtigungen" : "Browser hat noch nicht gefragt"}
                  />
                  <StatusRow ok={push.subscribed} label={push.subscribed ? "Gerät ist angemeldet" : "Gerät ist nicht angemeldet"} />
                  <StatusRow ok={push.diagnostics.swActive} label={push.diagnostics.swActive ? "Hintergrund-Dienst läuft" : "Hintergrund-Dienst läuft nicht"} hint={!push.diagnostics.swActive ? "„Gerät neu anmelden“ drücken." : undefined} />
                  <StatusRow
                    ok={zuletzt(push.diagnostics.lastPushShownAt) ? true : push.diagnostics.lastPushShowError ? false : null}
                    label={zuletzt(push.diagnostics.lastPushShownAt) ? `Zuletzt angezeigt um ${zuletzt(push.diagnostics.lastPushShownAt)}` : "Seit dem Öffnen noch nichts angezeigt"}
                    hint={push.diagnostics.lastPushShowError ?? undefined}
                  />
                </div>
                {push.lastError && <p className="text-xs text-red-600">Letzter Fehler: {push.lastError}</p>}
              </div>
            </details>
          </CardContent>
        )}
      </Card>

      {/* 2. Worüber? */}
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="text-base">Worüber möchtest du informiert werden?</CardTitle>
          <CardDescription>„Handy/PC“ meldet sich auch bei geschlossener App. „In der App“ ist ein kleiner Hinweis unten rechts, während du arbeitest.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Kopf links="Ereignis" />
          <div className="divide-y">
            <Zeile icon={Mail} titel="Neue E-Mails" hinweis="Für die Postfächer, die du unten auswählst." pushWert={prefs.email_enabled} onPush={(v) => setze({ email_enabled: v })} appWert={prefs.in_app_email_enabled} onApp={(v) => setze({ in_app_email_enabled: v })} />
            <Zeile icon={AlertCircle} titel="Neue Meldungen" hinweis="Wenn ein Eigentümer oder Mieter etwas meldet." appWert={prefs.in_app_report_enabled} onApp={(v) => setze({ in_app_report_enabled: v })} />
            <Zeile
              icon={CheckSquare}
              titel="Aufgaben"
              hinweis="Handy/PC: kurz vor Fälligkeit · In der App: sobald dir eine zugewiesen wird."
              pushWert={prefs.todo_enabled}
              onPush={(v) => setze({ todo_enabled: v })}
              appWert={prefs.in_app_todo_enabled}
              onApp={(v) => setze({ in_app_todo_enabled: v })}
              extra={prefs.todo_enabled && <VorlaufWahl wert={prefs.todo_lead_minutes} onChange={(v) => setze({ todo_lead_minutes: v })} />}
            />
            <Zeile
              icon={Calendar}
              titel="Termine"
              hinweis="Erinnerung vor Beginn."
              pushWert={prefs.calendar_enabled}
              onPush={(v) => setze({ calendar_enabled: v })}
              extra={prefs.calendar_enabled && <VorlaufWahl wert={prefs.calendar_lead_minutes} onChange={(v) => setze({ calendar_lead_minutes: v })} />}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t bg-muted/20 px-5 py-3.5 text-sm">
            <span className="font-medium">Ruhezeit</span>
            <span className="text-xs text-muted-foreground">keine Meldungen aufs Handy/den PC von</span>
            <Input type="time" value={prefs.quiet_hours_start ?? ""} onChange={(e) => setze({ quiet_hours_start: e.target.value || null })} className="h-8 w-28" />
            <span className="text-xs text-muted-foreground">bis</span>
            <Input type="time" value={prefs.quiet_hours_end ?? ""} onChange={(e) => setze({ quiet_hours_end: e.target.value || null })} className="h-8 w-28" />
            {(prefs.quiet_hours_start || prefs.quiet_hours_end) && (
              <Button size="sm" variant="ghost" className="h-8" onClick={() => setze({ quiet_hours_start: null, quiet_hours_end: null })}>
                Keine Ruhezeit
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 3. Postfächer */}
      {accounts.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base">Bei neuen E-Mails in diesen Postfächern</CardTitle>
            <CardDescription>Ist bei „In der App“ keines ausgewählt, meldet sich jedes Postfach.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Kopf links="Postfach" />
            <div className="divide-y">
              {accounts.map((a) => (
                <div key={a.id} className="grid grid-cols-[minmax(0,1fr)_64px_64px] items-center gap-2 px-5 py-3 sm:grid-cols-[minmax(0,1fr)_96px_96px]">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{a.display_name || a.email_address}</div>
                    <div className="truncate text-xs text-muted-foreground">{a.email_address}</div>
                  </div>
                  <div className="flex justify-center">
                    <Switch checked={pushPostfaecher.has(a.id)} onCheckedChange={(v) => postfachUmschalten("push", a.id, v)} disabled={!prefs.email_enabled} aria-label={`${a.email_address} aufs Handy/den PC`} />
                  </div>
                  <div className="flex justify-center">
                    <Switch checked={appPostfaecher.has(a.id)} onCheckedChange={(v) => postfachUmschalten("app", a.id, v)} disabled={!prefs.in_app_email_enabled} aria-label={`${a.email_address} in der App`} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
