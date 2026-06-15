import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, MessageSquare, MessageCircle, FileText, Users, Scale, Phone, Mail, MapPin, Check, ChevronRight, ChevronDown, Building2, MessageSquarePlus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useStammdatenName } from "@/hooks/useStammdatenName";
import { supabase } from "@/integrations/supabase/client";
import { useHasVisibleFiles } from "@/hooks/useHasVisibleFiles";
import { OwnerAnnualCycleWidget } from "@/components/dashboard/OwnerAnnualCycleWidget";
import { EmergencyContactsWidget } from "@/components/forum/EmergencyContactsWidget";
import { PROPERTY_MANAGER_FALLBACK } from "@/lib/emergencyContactInfo";
import { cn } from "@/lib/utils";
import { useAutoStartPageTour } from "@/components/weg-owner/onboarding/GuidedTourProvider";

interface Building { id: string; name: string; address: string | null }

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <h2 className="font-display text-[11px] font-semibold uppercase tracking-[0.6px] text-muted-foreground/80 px-1 mb-2">
    {children}
  </h2>
);

const LS_PREFIX = "rgi:lastSeen";
const lsKey = (kind: "forum" | "files" | "meetings", userId: string) =>
  `${LS_PREFIX}:${kind}:${userId}`;

const getLastSeen = (kind: "forum" | "files" | "meetings", userId: string): string => {
  try {
    const existing = localStorage.getItem(lsKey(kind, userId));
    if (existing) return existing;
    const now = new Date().toISOString();
    localStorage.setItem(lsKey(kind, userId), now);
    return now;
  } catch {
    return new Date().toISOString();
  }
};

const markSeen = (kind: "forum" | "files" | "meetings", userId: string) => {
  try {
    localStorage.setItem(lsKey(kind, userId), new Date().toISOString());
  } catch {
    /* noop */
  }
};

export const WegOwnerDashboard = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { firstName } = useStammdatenName();
  const hasVisibleFiles = useHasVisibleFiles(profile?.user_id);
  useAutoStartPageTour("dashboard", { delayMs: 1200 });
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [contactOpen, setContactOpen] = useState(false);
  const [openReports, setOpenReports] = useState(0);
  const [openResolutions, setOpenResolutions] = useState(0);
  const [unreadForum, setUnreadForum] = useState(0);
  const [unreadFiles, setUnreadFiles] = useState(0);
  const [unreadMeetings, setUnreadMeetings] = useState(0);

  useEffect(() => {
    if (!profile?.user_id) return;
    const userId = profile.user_id;
    const load = async () => {
      try {
        const { data: assignments } = await supabase
          .from("weg_owner_buildings")
          .select("building_id")
          .eq("user_id", userId);
        const bIds = (assignments || []).map((a: any) => a.building_id as string);

        let bs: Building[] = [];
        if (bIds.length) {
          const { data: bData } = await supabase
            .from("buildings")
            .select("id, name, address")
            .in("id", bIds);
          bs = (bData || []) as Building[];
        }
        setBuildings(bs);

        const { data: reports } = await supabase
          .from("weg_reports")
          .select("id")
          .eq("reported_by", userId)
          .eq("status", "open");
        setOpenReports(reports?.length || 0);

        if (bIds.length) {
          const { data: res } = await supabase
            .from("etv_resolutions")
            .select("id")
            .in("building_id", bIds)
            .eq("is_actionable", true)
            .eq("published", true)
            .neq("actionable_status", "completed");
          setOpenResolutions(res?.length || 0);

          const forumSeen = getLastSeen("forum", userId);
          const meetingsSeen = getLastSeen("meetings", userId);

          const [forumRes, meetingsRes] = await Promise.all([
            supabase
              .from("forum_posts")
              .select("id", { count: "exact", head: true })
              .in("building_id", bIds)
              .eq("management_mode", "weg")
              .gt("created_at", forumSeen),
            supabase
              .from("etv_meetings")
              .select("id", { count: "exact", head: true })
              .in("building_id", bIds)
              .gt("created_at", meetingsSeen),
          ]);
          setUnreadForum(forumRes.count ?? 0);
          setUnreadMeetings(meetingsRes.count ?? 0);
        }

        const filesSeen = getLastSeen("files", userId);
        const [personalRes, buildingRes] = await Promise.all([
          supabase
            .from("building_files")
            .select("id", { count: "exact", head: true })
            .eq("assigned_user_id", userId)
            .eq("visible_to_users", true)
            .gt("created_at", filesSeen),
          supabase
            .from("building_files")
            .select("id", { count: "exact", head: true })
            .is("assigned_user_id", null)
            .eq("visible_to_users", true)
            .gt("created_at", filesSeen),
        ]);
        setUnreadFiles((personalRes.count ?? 0) + (buildingRes.count ?? 0));
      } catch (err) {
        console.error("Dashboard load failed", err);
      }
    };
    load();
  }, [profile?.user_id]);

  const buildingIds = buildings.map((b) => b.id);


  const handleActionClick = (path: string, kind?: "forum" | "files" | "meetings") => {
    if (kind && profile?.user_id) {
      markSeen(kind, profile.user_id);
      if (kind === "forum") setUnreadForum(0);
      if (kind === "files") setUnreadFiles(0);
      if (kind === "meetings") setUnreadMeetings(0);
    }
    navigate(path);
  };

  const actions: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    path: string;
    kind?: "forum" | "files" | "meetings";
    unread?: number;
  }[] = [
    ...(hasVisibleFiles
      ? [{ icon: FileText, label: "Dokumente", path: "/weg-owner/files", kind: "files" as const, unread: unreadFiles }]
      : []),
    { icon: MessageCircle, label: "KI-Chat", path: "/weg-owner/chatbot" },
    { icon: MessageSquare, label: "Schwarzes Brett", path: "/weg-owner/forum", kind: "forum", unread: unreadForum },
    { icon: Users, label: "Versammlungen", path: "/weg-owner/meetings", kind: "meetings", unread: unreadMeetings },
  ];

  const phoneHref = `tel:${PROPERTY_MANAGER_FALLBACK.phone.replace(/\s+/g, "")}`;
  const mailHref = `mailto:${PROPERTY_MANAGER_FALLBACK.email}`;
  const mapsHref = "https://maps.app.goo.gl/nnWb3Dz5Rid1xzzv7";

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-xl md:max-w-2xl mx-auto px-4 py-5 space-y-5">
        {/* Welcome */}
        <div className="space-y-2 pt-1">
          <h1 className="font-display text-2xl font-semibold text-foreground leading-tight tracking-tight">
            Willkommen zurück, {firstName ?? profile?.first_name}
          </h1>
          {buildings.length > 0 && (
            <div className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
              <Building2 className="h-3.5 w-3.5" />
              {buildings.map((b) => b.name).join(", ")}
            </div>
          )}
        </div>

        {/* Stat tiles */}
        <div className="grid grid-cols-2 gap-3" data-tour="dashboard-tiles">
          <StatTile
            icon={AlertTriangle}
            label="Offene Meldungen"
            count={openReports}
            accentBg="bg-orange-500/10"
            accentText="text-orange-600"
            onClick={() => navigate("/weg-owner/reports")}
          />
          <StatTile
            icon={Scale}
            label="Offene Beschlüsse"
            count={openResolutions}
            accentBg="bg-orange-500/10"
            accentText="text-orange-600"
            onClick={() => navigate("/weg-owner/resolutions")}
          />
        </div>

        {/* Annual cycle */}
        {buildings.length > 0 && (
          <div data-tour="dashboard-cycle">
            <OwnerAnnualCycleWidget buildings={buildings} />
          </div>
        )}

        {/* Quick actions */}
        <section>
          <SectionLabel>Schnellzugriff</SectionLabel>
          {hasVisibleFiles === null ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="min-h-[96px] rounded-[14px] border border-border/60 bg-card animate-pulse"
                />
              ))}
            </div>
          ) : (
            <div className={cn(
              "grid gap-3",
              actions.length === 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"
            )}>
              {actions.map((a) => (
                <button
                  key={a.path}
                  onClick={() => handleActionClick(a.path, a.kind)}
                  aria-label={a.unread && a.unread > 0 ? `${a.label} – ${a.unread} neue Einträge` : a.label}
                  className="relative flex flex-col items-center justify-center gap-2.5 min-h-[96px] rounded-[14px] border border-border/60 bg-card p-3 shadow-sm transition-all hover:border-primary/40 hover:shadow active:scale-[0.98]"
                >
                  {a.unread !== undefined && a.unread > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 z-10 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-semibold tabular-nums shadow ring-2 ring-background">
                      {a.unread > 99 ? "99+" : a.unread}
                    </span>
                  )}
                  <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    <a.icon className="h-6 w-6 text-primary" />
                  </div>
                  <span className="text-[13px] font-medium text-center leading-tight">{a.label}</span>
                </button>
              ))}
            </div>
          )}
        </section>


        {/* Contact & emergency */}
        <section data-tour="dashboard-contact">
          <SectionLabel>Kontakt & Notfall</SectionLabel>
          <div className="bg-card rounded-[14px] border border-border/60 overflow-hidden shadow-sm">
            <button
              type="button"
              onClick={() => setContactOpen((v) => !v)}
              aria-expanded={contactOpen}
              className="w-full flex items-center gap-3 px-4 pt-3.5 pb-3 text-left transition-colors hover:bg-muted/40"
            >
              <div className="flex-1 min-w-0">
                <div className="font-display text-[15px] font-semibold text-foreground tracking-tight truncate">{PROPERTY_MANAGER_FALLBACK.name}</div>
                <div className="text-[13px] text-muted-foreground">Ihre Hausverwaltung · Mo–Fr 10:00–15:00</div>
              </div>
              <ChevronDown className={cn("h-5 w-5 text-muted-foreground/60 shrink-0 transition-transform", contactOpen && "rotate-180")} />
            </button>
            {contactOpen && (
              <>
                <div className="h-px bg-foreground/[0.055]" />
                <ContactRow icon={MessageSquarePlus} title="Meldung erstellen" subtitle="Anliegen direkt an die Hausverwaltung" href="/weg-owner/reports" />
                <div className="h-px bg-foreground/[0.055]" />
                <ContactRow icon={Phone} title="Anrufen" subtitle={PROPERTY_MANAGER_FALLBACK.phone} href={phoneHref} />
                <div className="h-px bg-foreground/[0.055]" />
                <ContactRow icon={Mail} title="E-Mail schreiben" subtitle={PROPERTY_MANAGER_FALLBACK.email} href={mailHref} />
                <div className="h-px bg-foreground/[0.055]" />
                <ContactRow icon={MapPin} title="Adresse & Route" subtitle="Vilstalstr. 4, 87459 Pfronten" href={mapsHref} external />
              </>
            )}
          </div>
        </section>


        {buildingIds.length > 0 && (
          <section>
            <SectionLabel>Notfallkontakte</SectionLabel>
            <EmergencyContactsWidget buildingIds={buildingIds} />
          </section>
        )}
      </div>
    </div>
  );
};

// --- Sub-components ---

interface StatTileProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: number;
  accentBg: string;
  accentText: string;
  onClick: () => void;
}

const StatTile = ({ icon: Icon, label, count, accentBg, accentText, onClick }: StatTileProps) => {
  return (
    <button
      onClick={onClick}
      className="text-left rounded-[14px] border border-border/60 bg-card p-4 shadow-sm transition-all hover:border-primary/40 hover:shadow active:scale-[0.99] min-h-[112px] flex flex-col justify-between"
    >
      <div className="flex items-start w-full">
        <div className={cn("h-11 w-11 rounded-xl flex items-center justify-center shrink-0", accentBg)}>
          <Icon className={cn("h-5 w-5 shrink-0", accentText)} />
        </div>
        <span className={cn("text-3xl font-bold tabular-nums leading-none ml-auto shrink-0", accentText)}>{count}</span>
      </div>
      <div className="text-[13px] font-medium text-foreground mt-3">{label}</div>
    </button>
  );
};

interface ContactRowProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  href: string;
  external?: boolean;
}

const ContactRow = ({ icon: Icon, title, subtitle, href, external }: ContactRowProps) => (
  <a
    href={href}
    {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    className="flex items-center gap-4 px-4 py-3.5 min-h-[64px] transition-colors hover:bg-muted/40 active:bg-muted/60"
  >
    <div className="h-11 w-11 shrink-0 rounded-xl bg-primary/10 flex items-center justify-center">
      <Icon className="h-5 w-5 text-primary" />
    </div>
    <div className="flex-1 min-w-0">
      <div className="text-[15px] font-medium text-foreground leading-tight">{title}</div>
      <div className="text-[13px] text-muted-foreground mt-0.5 truncate">{subtitle}</div>
    </div>
    <ChevronRight className="h-5 w-5 text-muted-foreground/60 shrink-0" />
  </a>
);
