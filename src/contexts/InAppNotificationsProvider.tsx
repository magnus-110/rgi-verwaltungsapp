import { createContext, useContext, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Mail, ClipboardList, CheckSquare, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type Prefs = {
  in_app_email_enabled: boolean;
  in_app_report_enabled: boolean;
  in_app_todo_enabled: boolean;
};

const DEFAULTS: Prefs = {
  in_app_email_enabled: true,
  in_app_report_enabled: true,
  in_app_todo_enabled: true,
};

const Ctx = createContext<null>(null);
export const useInAppNotifications = () => useContext(Ctx);

const truncate = (s: string | null | undefined, n = 70) =>
  !s ? "" : s.length > n ? s.slice(0, n - 1) + "…" : s;

function showToast(opts: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  detail?: string;
  url: string;
  navigate: (u: string) => void;
}) {
  toast.custom(
    (t) => (
      <div
        onClick={() => {
          opts.navigate(opts.url);
          toast.dismiss(t);
        }}
        className="group relative flex w-[360px] cursor-pointer items-start gap-3 rounded-lg border bg-background p-3 pr-9 shadow-lg ring-1 ring-black/5 transition hover:bg-muted/40"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          {opts.icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold leading-tight">{opts.title}</div>
          {opts.subtitle && (
            <div className="mt-0.5 truncate text-xs font-medium text-foreground/80">{opts.subtitle}</div>
          )}
          {opts.detail && (
            <div className="mt-0.5 truncate text-xs text-muted-foreground">{opts.detail}</div>
          )}
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toast.dismiss(t);
          }}
          className="absolute right-2 top-2 rounded p-1 text-muted-foreground opacity-60 hover:bg-muted hover:opacity-100"
          aria-label="Schließen"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    ),
    { duration: 4000, position: "bottom-right" }
  );
}

export function InAppNotificationsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const prefsRef = useRef<Prefs>(DEFAULTS);
  const accountIdsRef = useRef<Set<string>>(new Set());
  const mountedAtRef = useRef<number>(Date.now());
  const seenIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    mountedAtRef.current = Date.now();
    seenIdsRef.current = new Set();

    const loadPrefs = async () => {
      const { data } = await supabase
        .from("notification_preferences")
        .select("in_app_email_enabled,in_app_report_enabled,in_app_todo_enabled")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!cancelled && data) {
        prefsRef.current = {
          in_app_email_enabled: data.in_app_email_enabled ?? true,
          in_app_report_enabled: data.in_app_report_enabled ?? true,
          in_app_todo_enabled: data.in_app_todo_enabled ?? true,
        };
      }
    };
    const loadAccounts = async () => {
      const { data } = await (supabase as any)
        .from("in_app_email_subscriptions")
        .select("account_id")
        .eq("user_id", user.id);
      if (!cancelled) accountIdsRef.current = new Set((data ?? []).map((s: any) => s.account_id));
    };

    loadPrefs();
    loadAccounts();

    const dedupe = (id: string) => {
      if (seenIdsRef.current.has(id)) return true;
      seenIdsRef.current.add(id);
      return false;
    };
    const isFresh = (created_at?: string) => {
      if (!created_at) return true;
      return new Date(created_at).getTime() >= mountedAtRef.current - 2000;
    };

    const channel = supabase
      .channel("inapp-notifications")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "emails" }, (payload) => {
        const row: any = payload.new;
        if (!prefsRef.current.in_app_email_enabled) return;
        if (row.is_draft) return;
        if (accountIdsRef.current.size > 0 && !accountIdsRef.current.has(row.account_id)) return;
        if (!isFresh(row.created_at) || dedupe(row.id)) return;
        showToast({
          icon: <Mail className="h-4 w-4" />,
          title: "Neue E-Mail",
          subtitle: truncate(row.from_name || row.from_address || "Unbekannt", 50),
          detail: truncate(row.subject || "(Kein Betreff)"),
          url: "/postfach",
          navigate,
        });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "weg_reports" }, (payload) => {
        const row: any = payload.new;
        if (!prefsRef.current.in_app_report_enabled) return;
        if (!isFresh(row.created_at) || dedupe("wr:" + row.id)) return;
        showToast({
          icon: <ClipboardList className="h-4 w-4" />,
          title: "Neue WEG-Meldung",
          subtitle: truncate(row.title || "Ohne Titel"),
          detail: truncate(row.contact_name || row.description, 80),
          url: "/tickets",
          navigate,
        });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "miete_reports" }, (payload) => {
        const row: any = payload.new;
        if (!prefsRef.current.in_app_report_enabled) return;
        if (!isFresh(row.created_at) || dedupe("mr:" + row.id)) return;
        showToast({
          icon: <ClipboardList className="h-4 w-4" />,
          title: "Neue Miet-Meldung",
          subtitle: truncate(row.title || "Ohne Titel"),
          detail: truncate(row.contact_name || row.description, 80),
          url: "/tickets",
          navigate,
        });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "todos" }, (payload) => {
        const row: any = payload.new;
        if (!prefsRef.current.in_app_todo_enabled) return;
        if (!isFresh(row.created_at) || dedupe("t:" + row.id)) return;
        if (row.assigned_to !== user.id && row.created_by === user.id) return;
        if (row.assigned_to && row.assigned_to !== user.id) return;
        showToast({
          icon: <CheckSquare className="h-4 w-4" />,
          title: "Neue Aufgabe",
          subtitle: truncate(row.title || "Ohne Titel"),
          detail: row.due_date ? `Fällig: ${new Date(row.due_date).toLocaleDateString("de-DE")}` : undefined,
          url: "/todos",
          navigate,
        });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "todo_assignees", filter: `user_id=eq.${user.id}` }, async (payload) => {
        const row: any = payload.new;
        if (!prefsRef.current.in_app_todo_enabled) return;
        if (!isFresh(row.created_at) || dedupe("ta:" + row.id)) return;
        const { data: todo } = await supabase.from("todos").select("title,due_date,created_by").eq("id", row.todo_id).maybeSingle();
        if (!todo) return;
        if ((todo as any).created_by === user.id) return;
        showToast({
          icon: <CheckSquare className="h-4 w-4" />,
          title: "Aufgabe zugewiesen",
          subtitle: truncate((todo as any).title || "Ohne Titel"),
          detail: (todo as any).due_date ? `Fällig: ${new Date((todo as any).due_date).toLocaleDateString("de-DE")}` : undefined,
          url: "/todos",
          navigate,
        });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notification_preferences", filter: `user_id=eq.${user.id}` }, (payload) => {
        const row: any = payload.new;
        prefsRef.current = {
          in_app_email_enabled: row.in_app_email_enabled ?? true,
          in_app_report_enabled: row.in_app_report_enabled ?? true,
          in_app_todo_enabled: row.in_app_todo_enabled ?? true,
        };
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "in_app_email_subscriptions", filter: `user_id=eq.${user.id}` }, () => {
        loadAccounts();
      })
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user, navigate]);

  return <Ctx.Provider value={null}>{children}</Ctx.Provider>;
}
