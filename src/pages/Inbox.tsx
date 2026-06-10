import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Mail, Search, Flag, Archive, ArchiveRestore, Trash2, Inbox as InboxIcon, Send, FileEdit, ShieldAlert, Plus, RefreshCw, Settings, Loader2, MailOpen, Reply, Forward, Building2, User, Paperclip, ChevronDown, ChevronUp, PanelLeftClose, PanelLeftOpen, UserPlus, UserCheck, Undo2, Link2, Sparkles, Menu, ArrowLeft, Pin, PinOff, Vote, CalendarClock, Users, Printer } from "lucide-react";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useComposeEmail } from "@/contexts/ComposeEmailContext";
import { EmailAttachments } from "@/components/email/EmailAttachments";
import { AssignEmailDialog } from "@/components/email/AssignEmailDialog";
import { AiEmailSearchDialog } from "@/components/email/AiEmailSearchDialog";

import { EmailHtmlBody } from "@/components/email/EmailHtmlBody";
import { PrintEmailDialog } from "@/components/email/PrintEmailDialog";
import { ScheduledMailsPanel } from "@/components/email/ScheduledMailsPanel";
import { DraftsPanel } from "@/components/email/DraftsPanel";
import { EmailSettingsSection } from "@/components/email/EmailSettingsSection";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { useNavigate, useSearchParams } from "react-router-dom";

const folderIcons: Record<string, any> = {
  'inbox': InboxIcon,
  'send': Send,
  'file-edit': FileEdit,
  'archive': Archive,
  'shield-alert': ShieldAlert,
  'trash-2': Trash2,
  'calendar-clock': CalendarClock,
};

export const Inbox = () => {
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const { openCompose } = useComposeEmail();
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[] | null>(() => {
    try {
      const raw = localStorage.getItem("inbox-selected-accounts");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return null; // null = all accounts
  });
  const [accountsExpanded, setAccountsExpanded] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem("inbox-accounts-expanded");
      if (raw) return JSON.parse(raw) === true;
    } catch {}
    return true;
  });
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [aiSearchOpen, setAiSearchOpen] = useState(false);
  const [showEmailDetails, setShowEmailDetails] = useState(false);
  const [archiveEmailId, setArchiveEmailId] = useState<string | null>(null);
  const [filterBuildingId, setFilterBuildingId] = useState<string>("all");
  const [filterContactId, setFilterContactId] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterAssignedTo, setFilterAssignedTo] = useState<string>("all");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileFoldersOpen, setMobileFoldersOpen] = useState(false);
  const [newContactDialogOpen, setNewContactDialogOpen] = useState(false);
  const [newContactData, setNewContactData] = useState({ first_name: "", last_name: "", company_name: "", email: "" });
  const [contactSearchTerm, setContactSearchTerm] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedEmailIds, setSelectedEmailIds] = useState<Set<string>>(new Set());
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const isMobile = useIsMobile();

  // Virtual folder IDs
  const SCHEDULED_FOLDER_ID = "__scheduled__";
  const DRAFTS_FOLDER_ID = "__drafts__";

  // Fetch folders (auto-refresh every 60s)
  const { data: dbFolders = [] } = useQuery({
    queryKey: ["email-folders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_folders")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data;
    },
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  // Append virtual "Entwürfe" + "Geplant" folders
  const folders = useMemo(() => {
    return [
      ...dbFolders,
      {
        id: DRAFTS_FOLDER_ID,
        name: "Entwürfe",
        icon: "file-text",
        sort_order: 998,
        is_system: true,
        color: null,
        created_at: null,
      } as any,
      {
        id: SCHEDULED_FOLDER_ID,
        name: "Geplant",
        icon: "calendar-clock",
        sort_order: 999,
        is_system: true,
        color: null,
        created_at: null,
      } as any,
    ];
  }, [dbFolders]);

  // Fetch accounts
  const { data: accounts = [] } = useQuery({
    queryKey: ["email-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_accounts")
        .select("id, display_name, email_address, is_active, last_sync_at, short_code")
        .order("display_name");
      if (error) throw error;
      return data;
    },
  });

  // Fetch account-user assignments
  const { data: accountUsers = [] } = useQuery({
    queryKey: ["email-account-users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_account_users")
        .select("*");
      if (error) throw error;
      return data;
    },
  });

  // Fetch admin profiles for assignment
  const { data: adminProfiles = [] } = useQuery({
    queryKey: ["admin-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name, role")
        .in("role", ["admin", "employee"])
        .order("last_name");
      if (error) throw error;
      return data;
    },
  });

  // Get account IDs for the currently logged-in user
  const myAccountIds = useMemo(() => {
    if (!profile?.user_id) return [];
    return accountUsers
      .filter(au => au.user_id === profile.user_id)
      .map(au => au.account_id);
  }, [accountUsers, profile?.user_id]);

  // Buildings for archive filter
  const { data: buildings = [] } = useQuery({
    queryKey: ["buildings-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("buildings")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Contacts for archive filter
  const { data: contacts = [] } = useQuery({
    queryKey: ["contacts-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select("id, first_name, last_name, company_name")
        .order("last_name");
      if (error) throw error;
      return data;
    },
  });

  // Determine if archive folder is selected
  const isArchiveFolder = useMemo(() => {
    if (!selectedFolderId || folders.length === 0) return false;
    const folder = folders.find(f => f.id === selectedFolderId);
    return folder?.name === "Archiv";
  }, [selectedFolderId, folders]);

  // Determine if trash folder is selected
  const isTrashFolder = useMemo(() => {
    if (!selectedFolderId || folders.length === 0) return false;
    const folder = folders.find(f => f.id === selectedFolderId);
    return folder?.name === "Papierkorb";
  }, [selectedFolderId, folders]);

  // Determine if sent folder is selected
  const isSentFolder = useMemo(() => {
    if (!selectedFolderId || folders.length === 0) return false;
    const folder = folders.find(f => f.id === selectedFolderId);
    return folder?.name === "Gesendet";
  }, [selectedFolderId, folders]);

  // Unread counts per folder (auto-refresh every 30s) — nur abonnierte Postfächer
  const { data: folderCountsRaw = {} } = useQuery({
    queryKey: ["email-folder-counts", myAccountIds],
    queryFn: async () => {
      if (!myAccountIds || myAccountIds.length === 0) return {};
      const { data, error } = await supabase
        .from("emails")
        .select("folder_id, is_read, account_id")
        .eq("is_read", false)
        .eq("is_archived", false)
        .in("account_id", myAccountIds);
      if (error) throw error;
      const counts: Record<string, number> = {};
      data?.forEach(e => {
        if (e.folder_id) {
          counts[e.folder_id] = (counts[e.folder_id] || 0) + 1;
        }
      });
      return counts;
    },
    enabled: myAccountIds.length > 0,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  // Scheduled mails (single + bulk campaigns) — populates the virtual "Geplant" folder
  const { data: scheduledItems = [] } = useQuery({
    queryKey: ["scheduled-mails-virtual"],
    queryFn: async () => {
      const [singleRes, campaignRes] = await Promise.all([
        supabase
          .from("scheduled_emails")
          .select("id, subject, to_addresses, scheduled_at, status, account_id, body_text, body_html, attachments, error_message, created_at")
          .eq("status", "scheduled")
          .order("scheduled_at", { ascending: true }),
        supabase
          .from("comm_campaigns")
          .select("id, name, type, recipient_count, scheduled_at, status, email_account_id, subject_override, error_message, created_at")
          .eq("status", "scheduled")
          .order("scheduled_at", { ascending: true }),
      ]);
      const single = (singleRes.data || []).map((s: any) => ({
        id: `single-${s.id}`,
        kind: "single" as const,
        ref_id: s.id,
        subject: s.subject || "(Kein Betreff)",
        recipients: Array.isArray(s.to_addresses) ? s.to_addresses : [],
        recipient_count: Array.isArray(s.to_addresses) ? s.to_addresses.length : 0,
        scheduled_at: s.scheduled_at,
        account_id: s.account_id,
        error_message: s.error_message,
      }));
      const bulk = await Promise.all(
        (campaignRes.data || []).map(async (c: any) => {
          let resolved: Array<{ contact_id: string; display_name: string; email: string | null }> | undefined;
          try {
            const { data: prev } = await supabase.functions.invoke("comm-preview-recipients", {
              body: { campaign_id: c.id },
            });
            if (prev && Array.isArray((prev as any).recipients)) {
              resolved = (prev as any).recipients;
            }
          } catch {
            // leave resolved undefined → UI shows loading/fallback
          }
          return {
            id: `campaign-${c.id}`,
            kind: "campaign" as const,
            ref_id: c.id,
            subject: c.subject_override || c.name || "(Rundmail)",
            recipients: [],
            recipient_count: resolved ? resolved.length : (c.recipient_count || 0),
            scheduled_at: c.scheduled_at,
            account_id: c.email_account_id,
            campaign_type: c.type,
            error_message: c.error_message,
            resolved_recipients: resolved,
          };
        }),
      );
      return [...single, ...bulk].sort((a, b) => {
        const ad = a.scheduled_at ? new Date(a.scheduled_at).getTime() : 0;
        const bd = b.scheduled_at ? new Date(b.scheduled_at).getTime() : 0;
        return ad - bd;
      });
    },
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });


  // Drafts query (virtual "Entwürfe" folder)
  const { data: draftItems = [] } = useQuery({
    queryKey: ["email-drafts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_drafts")
        .select("id, account_id, to_addresses, cc_addresses, bcc_addresses, subject, body_text, attachments, updated_at")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    refetchOnWindowFocus: true,
  });

  // Merge counts: real folders + virtual folders
  const folderCounts = useMemo(() => {
    return {
      ...(folderCountsRaw as Record<string, number>),
      [SCHEDULED_FOLDER_ID]: scheduledItems.length,
      [DRAFTS_FOLDER_ID]: draftItems.length,
    };
  }, [folderCountsRaw, scheduledItems.length, draftItems.length]);

  const isScheduledFolder = selectedFolderId === SCHEDULED_FOLDER_ID;
  const isDraftsFolder = selectedFolderId === DRAFTS_FOLDER_ID;

  // Fetch emails for selected folder — slim columns; body wird lazy für Detail geladen
  const isSearching = searchTerm.trim().length >= 2;
  const [pageLimit, setPageLimit] = useState<number>(100);
  // Reset Pagination wenn sich Ordner / Filter / Suche ändern
  useEffect(() => {
    setPageLimit(isSearching ? 200 : 100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFolderId, searchTerm, selectedAccountIds, isArchiveFolder, filterBuildingId, filterContactId, filterAssignedTo]);

  const EMAIL_COLUMNS = "id, account_id, folder_id, subject, from_name, from_address, to_addresses, cc_addresses, date, is_read, is_starred, is_pinned, pinned_at, is_archived, has_attachments, ai_category, ai_priority, ai_summary, building_id, contact_id, assigned_to, deleted_at, case_id, message_id, is_etv_relevant, etv_meeting_id";

  const { data: emails = [], isLoading: emailsLoading, error: emailsError } = useQuery({
    queryKey: ["emails", selectedFolderId, searchTerm, selectedAccountIds, isArchiveFolder, filterBuildingId, filterContactId, filterAssignedTo, pageLimit],
    queryFn: async () => {
      // Suchmodus: serverseitige RPC (ordnerübergreifend, sucht zuverlässig auch in JSONB-Empfängern)
      if (isSearching) {
        const accountIds = selectedAccountIds === null ? null : selectedAccountIds;
        if (accountIds && accountIds.length === 0) return [] as any[];
        const assignedFilter =
          filterAssignedTo === "all" ? "all" : filterAssignedTo === "unassigned" ? "unassigned" : "user";
        const { data, error } = await supabase.rpc("search_emails" as any, {
          p_search: searchTerm.trim(),
          p_account_ids: accountIds,
          p_assigned_to: assignedFilter === "user" ? filterAssignedTo : null,
          p_assigned_filter: assignedFilter,
          p_limit: pageLimit,
          p_offset: 0,
        });
        if (error) throw error;
        return (data || []) as any[];
      }

      let query = supabase
        .from("emails")
        .select(EMAIL_COLUMNS)
        .order("date", { ascending: false })
        .limit(pageLimit);

      if (isArchiveFolder) {
        query = query.eq("is_archived", true);
        if (filterBuildingId === "none") query = query.is("building_id", null);
        else if (filterBuildingId !== "all") query = query.eq("building_id", filterBuildingId);
        if (filterContactId === "none") query = query.is("contact_id", null);
        else if (filterContactId !== "all") query = query.eq("contact_id", filterContactId);
      } else {
        query = query.eq("is_archived", false);
        if (selectedFolderId) query = query.eq("folder_id", selectedFolderId);
      }

      if (selectedAccountIds !== null) {
        if (selectedAccountIds.length === 0) return [];
        query = query.in("account_id", selectedAccountIds);
      }

      if (filterAssignedTo === "unassigned") {
        query = query.is("assigned_to", null);
      } else if (filterAssignedTo !== "all") {
        query = query.eq("assigned_to", filterAssignedTo);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !isScheduledFolder,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  // "Mehr laden": Anzahl entspricht aktuellem Limit -> wahrscheinlich gibt es mehr Treffer
  const canLoadMore = emails.length >= pageLimit;

  // Map: message_id of inbound email -> id of sent reply (latest)
  const inboundMessageIds = useMemo(
    () => emails.map(e => (e as any).message_id).filter((m): m is string => !!m),
    [emails],
  );
  const { data: replyMap = {} } = useQuery({
    queryKey: ["email-replies", inboundMessageIds],
    queryFn: async () => {
      if (inboundMessageIds.length === 0) return {} as Record<string, string>;
      const { data, error } = await supabase
        .from("emails")
        .select("id, in_reply_to, date")
        .in("in_reply_to", inboundMessageIds)
        .order("date", { ascending: false });
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const row of data || []) {
        const key = (row as any).in_reply_to as string;
        if (key && !map[key]) map[key] = (row as any).id;
      }
      return map;
    },
    enabled: inboundMessageIds.length > 0,
  });

  // All known categories (always shown). Wartung/Mahnung/Vertrag/Unkategorisiert -> Sonstiges; Newsletter -> Werbung.
  const ALL_CATEGORIES = ["Rechnung", "Anfrage", "Versicherung", "Werbung", "Sonstiges"];

  const normalizeCategory = (cat: string | null | undefined): string => {
    if (!cat) return "Sonstiges";
    if (cat === "Newsletter") return "Werbung";
    if (ALL_CATEGORIES.includes(cat)) return cat;
    return "Sonstiges";
  };

  const followUpCount = useMemo(() => emails.filter(e => e.is_starred).length, [emails]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const cat of ALL_CATEGORIES) counts[cat] = 0;
    for (const e of emails) {
      const cat = normalizeCategory(e.ai_category);
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  }, [emails]);

  const unreadCount = useMemo(() => emails.filter(e => !e.is_read).length, [emails]);

  const filteredEmails = useMemo(() => {
    let list: typeof emails;
    if (filterCategory === "followup") list = emails.filter(e => e.is_starred);
    else if (filterCategory === "unread") list = emails.filter(e => !e.is_read);
    else if (filterCategory === "all") list = emails;
    else list = emails.filter(e => normalizeCategory(e.ai_category) === filterCategory);
    // Pinned emails immer oben, dann nach Datum (DESC, wie aus Query)
    return [...list].sort((a, b) => {
      const ap = a.is_pinned ? 1 : 0;
      const bp = b.is_pinned ? 1 : 0;
      if (ap !== bp) return bp - ap;
      if (a.is_pinned && b.is_pinned) {
        const at = a.pinned_at ? new Date(a.pinned_at).getTime() : 0;
        const bt = b.pinned_at ? new Date(b.pinned_at).getTime() : 0;
        if (at !== bt) return bt - at;
      }
      const ad = a.date ? new Date(a.date).getTime() : 0;
      const bd = b.date ? new Date(b.date).getTime() : 0;
      return bd - ad;
    });
  }, [emails, filterCategory]);

  const selectedEmailMeta = filteredEmails.find(e => e.id === selectedEmailId) || emails.find(e => e.id === selectedEmailId);

  // Reset multi-selection when folder/filter/search changes
  useEffect(() => {
    setSelectedEmailIds(new Set());
  }, [selectedFolderId, filterCategory, filterBuildingId, filterContactId, filterAssignedTo, searchTerm]);

  // Drop selections that are no longer visible
  useEffect(() => {
    if (selectedEmailIds.size === 0) return;
    const visible = new Set(filteredEmails.map(e => e.id));
    let changed = false;
    const next = new Set<string>();
    selectedEmailIds.forEach(id => {
      if (visible.has(id)) next.add(id); else changed = true;
    });
    if (changed) setSelectedEmailIds(next);
  }, [filteredEmails, selectedEmailIds]);

  // Lazy-Load Email-Body nur für die selektierte E-Mail
  const { data: selectedEmailBody } = useQuery({
    queryKey: ["email-body", selectedEmailId],
    queryFn: async () => {
      if (!selectedEmailId) return null;
      const { data, error } = await supabase
        .from("emails")
        .select("body_html, body_text")
        .eq("id", selectedEmailId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!selectedEmailId,
    staleTime: 5 * 60 * 1000,
  });

  // Fallback: lade vollständige Email-Metadaten direkt, falls die Email nicht in der aktuellen Liste ist
  // (z.B. Deep-Link aus einem Vorgang in einen anderen Ordner / Account).
  const { data: selectedEmailDirect } = useQuery({
    queryKey: ["email-direct", selectedEmailId],
    queryFn: async () => {
      if (!selectedEmailId) return null;
      const { data, error } = await supabase
        .from("emails")
        .select(EMAIL_COLUMNS)
        .eq("id", selectedEmailId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!selectedEmailId && !selectedEmailMeta,
    staleTime: 5 * 60 * 1000,
  });

  const effectiveSelectedMeta = selectedEmailMeta || selectedEmailDirect;

  const selectedEmail = effectiveSelectedMeta
    ? { ...effectiveSelectedMeta, body_html: selectedEmailBody?.body_html ?? null, body_text: selectedEmailBody?.body_text ?? null }
    : undefined;

  // Auto-select inbox folder
  useEffect(() => {
    const inboxFolder = folders.find(f => f.name === "Eingang");
    if (inboxFolder && !selectedFolderId) {
      setSelectedFolderId(inboxFolder.id);
    }
  }, [folders, selectedFolderId]);

  // Mark as read when selecting an email
  useEffect(() => {
    if (selectedEmail && !selectedEmail.is_read) {
      supabase
        .from("emails")
        .update({ is_read: true })
        .eq("id", selectedEmail.id)
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ["emails"] });
          queryClient.invalidateQueries({ queryKey: ["email-folder-counts"] });
        });
    }
  }, [selectedEmailId]);

  // Deep-link: open email by ?email=<id>. Switches folder (incl. Archiv) and resets filters.
  useEffect(() => {
    const emailIdFromUrl = searchParams.get("email");
    if (!emailIdFromUrl || emailIdFromUrl === selectedEmailId || folders.length === 0) return;
    (async () => {
      const { data } = await supabase
        .from("emails")
        .select("id, folder_id, is_archived")
        .eq("id", emailIdFromUrl)
        .maybeSingle();
      if (data) {
        setFilterCategory("all");
        setFilterBuildingId("all");
        setFilterContactId("all");
        setFilterAssignedTo("all");
        if (data.is_archived) {
          const archive = folders.find((f) => f.name === "Archiv");
          if (archive) setSelectedFolderId(archive.id);
        } else if (data.folder_id) {
          setSelectedFolderId(data.folder_id);
        }
        setSelectedEmailId(data.id);
      }
      const next = new URLSearchParams(searchParams);
      next.delete("email");
      setSearchParams(next, { replace: true });
    })();
  }, [searchParams, selectedEmailId, folders, setSearchParams]);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-emails");
      if (error) throw error;
      
      // Check for per-account errors in the response
      if (data?.results) {
        const accountErrors = Object.entries(data.results)
          .filter(([_, v]: [string, any]) => v?.error)
          .map(([k, v]: [string, any]) => `${k}: ${v.error}`);
        if (accountErrors.length > 0) {
          toast.warning(`Sync teilweise erfolgreich. Fehler bei: ${accountErrors.join(", ")}`, { duration: 6000 });
        } else {
          toast.success("E-Mails synchronisiert");
        }
      } else {
        toast.success("E-Mails synchronisiert");
      }
      
      queryClient.invalidateQueries({ queryKey: ["emails"] });
      queryClient.invalidateQueries({ queryKey: ["email-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["email-folder-counts"] });
    } catch (err: any) {
      toast.error("Sync fehlgeschlagen: " + (err.message || "Unbekannter Fehler"));
    } finally {
      setIsSyncing(false);
    }
  };

  // Periodic silent IMAP sync every 5 minutes (no toast). Triggers right after mount once,
  // then on a fixed interval — independent of manual refresh button.
  useEffect(() => {
    let cancelled = false;
    const silentSync = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("fetch-emails");
        if (cancelled || error) return;
        queryClient.invalidateQueries({ queryKey: ["emails"] });
        queryClient.invalidateQueries({ queryKey: ["email-accounts"] });
        queryClient.invalidateQueries({ queryKey: ["email-folder-counts"] });
      } catch {
        // silent — periodic background fetch must never spam toasts
      }
    };
    // Trigger initial sync shortly after mount, then poll every 60 seconds
    const initialId = window.setTimeout(silentSync, 2_000);
    const id = window.setInterval(silentSync, 60 * 1000);
    return () => { cancelled = true; window.clearTimeout(initialId); window.clearInterval(id); };
  }, [queryClient]);

  const toggleFollowUp = async (emailId: string, currentStarred: boolean) => {
    await supabase.from("emails").update({ is_starred: !currentStarred }).eq("id", emailId);
    queryClient.invalidateQueries({ queryKey: ["emails"] });
  };

  const togglePin = async (emailId: string, currentPinned: boolean) => {
    const next = !currentPinned;
    await supabase.from("emails").update({
      is_pinned: next,
      pinned_at: next ? new Date().toISOString() : null,
    }).eq("id", emailId);
    queryClient.invalidateQueries({ queryKey: ["emails"] });
    toast.success(next ? "E-Mail oben angepinnt" : "Anpinnung entfernt");
  };

  const openArchiveDialog = (emailId: string) => {
    setArchiveEmailId(emailId);
    setArchiveDialogOpen(true);
  };

  const handleAssign = async (params: {
    emailId: string;
    buildingId: string | null;
    contactId: string | null;
    caseId: string | null;
    parentEventId: string | null;
    archive: boolean;
    isEtvRelevant: boolean;
    etvMeetingId: string | null;
  }) => {
    const update: any = {
      building_id: params.buildingId,
      contact_id: params.contactId,
      case_id: params.caseId,
      is_etv_relevant: params.isEtvRelevant,
      etv_meeting_id: params.etvMeetingId,
    };
    if (params.archive) update.is_archived = true;
    await supabase.from("emails").update(update).eq("id", params.emailId);

    // If linked to a case, create case event including attachments
    if (params.caseId) {
      const email = emails.find((e) => e.id === params.emailId);
      try {
        // Fetch latest ai_summary in case it was generated after initial load
        const { data: emailRow } = await supabase
          .from("emails")
          .select("ai_summary, subject, from_address, from_name, body_text")
          .eq("id", params.emailId)
          .maybeSingle();

        const { data: atts } = await supabase
          .from("email_attachments")
          .select("file_name, file_path, file_size, mime_type")
          .eq("email_id", params.emailId)
          .eq("is_inline", false);
        const attachments = (atts || [])
          .filter((a) => a.file_path)
          .map((a) => ({
            name: a.file_name,
            path: a.file_path,
            size: a.file_size,
            mime: a.mime_type,
            bucket: "email-attachments",
          }));

        const summary = emailRow?.ai_summary?.trim();
        const fallback = (emailRow?.body_text || "").substring(0, 500);

        await supabase.functions.invoke("case-add-event", {
          body: {
            case_id: params.caseId,
            event_type: "email",
            title: emailRow?.subject || email?.subject || "E-Mail",
            body: summary || fallback || null,
            source_table: "emails",
            source_id: params.emailId,
            attachments,
            extracted_data: {
              email_id: params.emailId,
              from_address: emailRow?.from_address || null,
              from_name: emailRow?.from_name || null,
              has_ai_summary: !!summary,
            },
            parent_event_id: params.parentEventId || null,
            trigger_summary: true,
          },
        });
      } catch (e) {
        console.error("case-add-event failed", e);
      }
    }

    if (params.archive && selectedEmailId === params.emailId) setSelectedEmailId(null);
    queryClient.invalidateQueries({ queryKey: ["emails"] });
    queryClient.invalidateQueries({ queryKey: ["email-folder-counts"] });
    queryClient.invalidateQueries({ queryKey: ["case-events"] });
    queryClient.invalidateQueries({ queryKey: ["etv-relevant-emails"] });
    toast.success(params.archive ? "E-Mail zugeordnet & archiviert" : "E-Mail zugeordnet");
  };

  const deleteEmail = async (emailId: string) => {
    const trashFolder = folders.find(f => f.name === "Papierkorb");
    if (trashFolder) {
      await supabase.from("emails").update({ folder_id: trashFolder.id, deleted_at: new Date().toISOString() }).eq("id", emailId);
    } else {
      await supabase.from("emails").delete().eq("id", emailId);
    }
    if (selectedEmailId === emailId) setSelectedEmailId(null);
    queryClient.invalidateQueries({ queryKey: ["emails"] });
    queryClient.invalidateQueries({ queryKey: ["email-folder-counts"] });
    toast.success("E-Mail in Papierkorb verschoben");
  };

  const restoreEmail = async (emailId: string) => {
    const inboxFolder = folders.find(f => f.name === "Eingang");
    if (inboxFolder) {
      await supabase.from("emails").update({ folder_id: inboxFolder.id, deleted_at: null }).eq("id", emailId);
    }
    queryClient.invalidateQueries({ queryKey: ["emails"] });
    queryClient.invalidateQueries({ queryKey: ["email-folder-counts"] });
    toast.success("E-Mail wiederhergestellt");
  };

  const permanentDeleteEmail = async (emailId: string) => {
    await supabase.from("email_attachments").delete().eq("email_id", emailId);
    await supabase.from("emails").delete().eq("id", emailId);
    if (selectedEmailId === emailId) setSelectedEmailId(null);
    queryClient.invalidateQueries({ queryKey: ["emails"] });
    queryClient.invalidateQueries({ queryKey: ["email-folder-counts"] });
    toast.success("E-Mail endgültig gelöscht");
  };

  const toggleSelectEmail = (emailId: string, checked: boolean) => {
    setSelectedEmailIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(emailId); else next.delete(emailId);
      return next;
    });
  };

  const clearSelection = () => setSelectedEmailIds(new Set());

  const bulkDeleteSelected = async () => {
    const ids = Array.from(selectedEmailIds);
    if (ids.length === 0) return;
    setBulkDeleting(true);
    try {
      if (isTrashFolder) {
        // Permanent delete
        await supabase.from("email_attachments").delete().in("email_id", ids);
        const { error } = await supabase.from("emails").delete().in("id", ids);
        if (error) throw error;
        toast.success(`${ids.length} E-Mail(s) endgültig gelöscht`);
      } else {
        const trashFolder = folders.find(f => f.name === "Papierkorb");
        if (trashFolder) {
          const { error } = await supabase
            .from("emails")
            .update({ folder_id: trashFolder.id, deleted_at: new Date().toISOString() })
            .in("id", ids);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("emails").delete().in("id", ids);
          if (error) throw error;
        }
        toast.success(`${ids.length} E-Mail(s) in Papierkorb verschoben`);
      }
      if (selectedEmailId && ids.includes(selectedEmailId)) setSelectedEmailId(null);
      clearSelection();
      queryClient.invalidateQueries({ queryKey: ["emails"] });
      queryClient.invalidateQueries({ queryKey: ["email-folder-counts"] });
    } catch (err: any) {
      toast.error("Fehler: " + (err.message || "Unbekannt"));
    } finally {
      setBulkDeleting(false);
    }
  };

  const toggleRead = async (emailId: string, currentRead: boolean) => {
    await supabase.from("emails").update({ is_read: !currentRead }).eq("id", emailId);
    queryClient.invalidateQueries({ queryKey: ["emails"] });
    queryClient.invalidateQueries({ queryKey: ["email-folder-counts"] });
  };

  const getContactName = (c: any) => {
    const parts = [c.first_name, c.last_name].filter(Boolean).join(" ");
    const name = parts || c.company_name || "Unbenannt";
    if (parts && c.company_name) return `${name} (${c.company_name})`;
    return name;
  };

  const senderHasContact = useMemo(() => {
    if (!selectedEmail?.from_address) return false;
    return selectedEmail.contact_id != null;
  }, [selectedEmail]);

  const openNewContactFromEmail = () => {
    if (!selectedEmail) return;
    const fromName = selectedEmail.from_name || "";
    const parts = fromName.split(" ");
    setNewContactData({
      first_name: parts.length > 1 ? parts.slice(0, -1).join(" ") : fromName,
      last_name: parts.length > 1 ? parts[parts.length - 1] : "",
      company_name: "",
      email: selectedEmail.from_address || "",
    });
    setNewContactDialogOpen(true);
  };

  const handleCreateContact = async () => {
    try {
      const contactType = newContactData.company_name ? "company" : "person";
      const { data: contact, error } = await supabase.from("contacts").insert({
        first_name: newContactData.first_name || null,
        last_name: newContactData.last_name || null,
        company_name: newContactData.company_name || null,
        contact_type: contactType as any,
      }).select("id").single();
      if (error) throw error;

      // Create a contact_person
      const { data: person } = await supabase.from("contact_persons").insert({
        contact_id: contact.id,
        first_name: newContactData.first_name || null,
        last_name: newContactData.last_name || null,
        is_primary: true,
      }).select("id").single();

      if (newContactData.email) {
        await supabase.from("contact_emails").insert({
          contact_id: contact.id,
          person_id: person?.id || null,
          email: newContactData.email,
          is_primary: true,
        });
      }

      // Link email to new contact
      if (selectedEmail) {
        await supabase.from("emails").update({ contact_id: contact.id }).eq("id", selectedEmail.id);
      }

      queryClient.invalidateQueries({ queryKey: ["contacts-list"] });
      queryClient.invalidateQueries({ queryKey: ["emails"] });
      setNewContactDialogOpen(false);
      toast.success("Kontakt erstellt und verknüpft");
    } catch (err: any) {
      toast.error("Fehler: " + err.message);
    }
  };

  const addEmailToExistingContact = async (contactId: string) => {
    if (!selectedEmail?.from_address) return;
    try {
      // Check if email already exists for this contact
      const { data: existing } = await supabase.from("contact_emails")
        .select("id").eq("contact_id", contactId).eq("email", selectedEmail.from_address);
      
      if (!existing || existing.length === 0) {
        // Get primary person for this contact
        const { data: primaryPerson } = await supabase.from("contact_persons")
          .select("id").eq("contact_id", contactId).eq("is_primary", true).limit(1).maybeSingle();
        
        await supabase.from("contact_emails").insert({
          contact_id: contactId,
          person_id: primaryPerson?.id || null,
          email: selectedEmail.from_address,
          is_primary: false,
        });
      }

      // Link email to contact
      await supabase.from("emails").update({ contact_id: contactId }).eq("id", selectedEmail.id);
      queryClient.invalidateQueries({ queryKey: ["emails"] });
      queryClient.invalidateQueries({ queryKey: ["contacts-list"] });
      toast.success("E-Mail-Adresse zum Kontakt hinzugefügt");
    } catch (err: any) {
      toast.error("Fehler: " + err.message);
    }
  };

  return (
    <div className="h-[calc(100dvh-8rem)] min-h-0 flex flex-col md:flex-row rounded-lg border bg-background overflow-hidden touch-pan-y">
      {/* Mobile-only header bar — shows hamburger + back button + sync */}
      <div className="md:hidden flex items-center justify-between px-2 py-2 border-b shrink-0 gap-2">
        {selectedEmailId ? (
          <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => setSelectedEmailId(null)} aria-label="Zurück">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        ) : (
          <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => setMobileFoldersOpen(true)} aria-label="Ordner öffnen">
            <Menu className="h-5 w-5" />
          </Button>
        )}
        <span className="font-medium text-sm truncate flex-1 text-center">
          {selectedEmailId
            ? (selectedEmail?.subject || "(Kein Betreff)")
            : (folders.find(f => f.id === selectedFolderId)?.name || "Postfach")}
        </span>
        {!selectedEmailId && (
          <>
            <Button variant="ghost" size="icon" className="h-10 w-10" onClick={handleSync} disabled={isSyncing} aria-label="Synchronisieren">
              {isSyncing ? <Loader2 className="h-5 w-5 animate-spin" /> : <RefreshCw className="h-5 w-5" />}
            </Button>
            <Button size="icon" className="h-10 w-10" onClick={() => openCompose()} aria-label="Neue E-Mail">
              <Plus className="h-5 w-5" />
            </Button>
          </>
        )}
        {selectedEmailId && <div className="w-10" />}
      </div>

      {/* Left: Folders & Accounts (Desktop only) — on mobile available via Sheet */}
      {sidebarCollapsed ? (
        <div className="hidden md:flex w-10 border-r flex-col items-center py-2 shrink-0">
          <Button variant="ghost" size="icon" className="h-8 w-8 mb-2" onClick={() => setSidebarCollapsed(false)} title="Navigation einblenden">
            <PanelLeftOpen className="h-4 w-4" />
          </Button>
          <Button size="icon" className="h-8 w-8 mb-1" onClick={() => openCompose()} title="Neue E-Mail">
            <Plus className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleSync} disabled={isSyncing} title="Synchronisieren">
            {isSyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
          <Separator className="my-2 w-6" />
          {folders.map(folder => {
            const Icon = folderIcons[folder.icon || 'inbox'] || Mail;
            const isActive = selectedFolderId === folder.id;
            const count = folderCounts[folder.id] || 0;
            return (
              <button
                key={folder.id}
                onClick={() => { setSelectedFolderId(folder.id); setSelectedEmailId(null); }}
                className={cn(
                  "relative h-8 w-8 flex items-center justify-center rounded-md transition-colors mb-0.5",
                  isActive ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"
                )}
                title={folder.name}
              >
                <Icon className="h-4 w-4" />
                {count > 0 && folder.name !== "Papierkorb" && (
                  <span className={cn(
                    "absolute -top-0.5 -right-0.5 h-3.5 min-w-[14px] rounded-full text-[9px] flex items-center justify-center px-0.5",
                    folder.id === SCHEDULED_FOLDER_ID
                      ? "bg-amber-500 text-white"
                      : "bg-destructive text-destructive-foreground"
                  )}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="hidden md:flex w-56 border-r flex-col shrink-0">
          <div className="p-3 border-b flex gap-2">
            <Button size="sm" className="flex-1 gap-2" onClick={() => openCompose()}>
              <Plus className="h-4 w-4" />
              Neue E-Mail
            </Button>
            <Button size="sm" variant="outline" onClick={handleSync} disabled={isSyncing}>
              {isSyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSidebarCollapsed(true)} title="Navigation einklappen">
              <PanelLeftClose className="h-4 w-4" />
            </Button>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-2">
              <p className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ordner</p>
              {folders.map(folder => {
                const Icon = folderIcons[folder.icon || 'inbox'] || Mail;
                const isActive = selectedFolderId === folder.id;
                const count = folderCounts[folder.id] || 0;
                return (
                  <button
                    key={folder.id}
                    onClick={() => { setSelectedFolderId(folder.id); setSelectedEmailId(null); }}
                    className={cn(
                      "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors",
                      isActive ? "bg-primary text-primary-foreground" : "hover:bg-muted text-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate flex-1 text-left">{folder.name}</span>
                    {count > 0 && folder.name !== "Papierkorb" && (
                      <Badge
                        variant={isActive ? "secondary" : (folder.id === SCHEDULED_FOLDER_ID ? "outline" : "default")}
                        className={cn(
                          "text-[10px] px-1.5 py-0 h-5 min-w-[20px] justify-center",
                          folder.id === SCHEDULED_FOLDER_ID && !isActive && "border-amber-400 text-amber-700 dark:text-amber-300"
                        )}
                      >
                        {count}
                      </Badge>
                    )}
                  </button>
                );
              })}
            </div>

            <Separator className="my-2" />

            <div className="p-2">
              <div className="flex items-center justify-between px-2 py-1">
                <button
                  onClick={() => setAccountsExpanded(v => {
                    const next = !v;
                    try { localStorage.setItem("inbox-accounts-expanded", JSON.stringify(next)); } catch {}
                    return next;
                  })}
                  className="flex items-center gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
                >
                  <ChevronDown className={cn("h-3 w-3 transition-transform", !accountsExpanded && "-rotate-90")} />
                  Konten
                </button>
                {isAdmin && (
                  <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setSettingsOpen(true)} title="E-Mail-Konten verwalten">
                    <Settings className="h-3 w-3 text-muted-foreground" />
                  </Button>
                )}
              </div>
              {accountsExpanded && (accounts.length === 0 ? (
                <p className="px-2 py-2 text-xs text-muted-foreground">
                  Noch keine E-Mail-Konten.
                </p>
              ) : (() => {
                const allIds = accounts.map(a => a.id);
                const isAccountChecked = (id: string) =>
                  selectedAccountIds === null || selectedAccountIds.includes(id);
                const allChecked =
                  selectedAccountIds === null ||
                  (selectedAccountIds.length === allIds.length && allIds.every(id => selectedAccountIds.includes(id)));
                const toggleAccount = (id: string) => {
                  const current = selectedAccountIds === null ? [...allIds] : [...selectedAccountIds];
                  const idx = current.indexOf(id);
                  if (idx >= 0) current.splice(idx, 1);
                  else current.push(id);
                  const next = current.length === allIds.length ? null : current;
                  setSelectedAccountIds(next);
                  try { localStorage.setItem("inbox-selected-accounts", JSON.stringify(next)); } catch {}
                };
                const toggleAll = () => {
                  const next = allChecked ? [] : null;
                  setSelectedAccountIds(next);
                  try { localStorage.setItem("inbox-selected-accounts", JSON.stringify(next)); } catch {}
                };

                const renderAccountRow = (acc: typeof accounts[number]) => (
                  <label
                    key={acc.id}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md transition-colors hover:bg-muted/50 text-muted-foreground cursor-pointer"
                  >
                    <Checkbox
                      checked={isAccountChecked(acc.id)}
                      onCheckedChange={() => toggleAccount(acc.id)}
                      className="shrink-0"
                    />
                    <span className="truncate text-left flex-1">{acc.display_name}</span>
                  </label>
                );

                return (
                  <>
                    <label className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md transition-colors hover:bg-muted/50 text-muted-foreground cursor-pointer">
                      <Checkbox
                        checked={allChecked}
                        onCheckedChange={toggleAll}
                        className="shrink-0"
                      />
                      <Mail className="h-4 w-4 shrink-0" />
                      <span className="truncate text-left flex-1 font-medium">Alle Konten</span>
                    </label>
                    {myAccountIds.length > 0 && (
                      <>
                        <p className="px-2 pt-2 pb-0.5 text-[10px] font-semibold text-muted-foreground">Meine Konten</p>
                        {accounts.filter(acc => myAccountIds.includes(acc.id)).map(renderAccountRow)}
                      </>
                    )}
                    {myAccountIds.length > 0 && accounts.some(acc => !myAccountIds.includes(acc.id)) && (
                      <p className="px-2 pt-2 pb-0.5 text-[10px] font-semibold text-muted-foreground">Weitere Konten</p>
                    )}
                    {accounts.filter(acc => myAccountIds.length === 0 || !myAccountIds.includes(acc.id)).map(renderAccountRow)}
                  </>
                );
              })())}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Main content area with tabs spanning full width */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        {isDraftsFolder ? (
          <DraftsPanel
            items={draftItems as any}
            accounts={accounts}
            onChanged={() => {
              queryClient.invalidateQueries({ queryKey: ["email-drafts"] });
              queryClient.invalidateQueries({ queryKey: ["email-folder-counts"] });
            }}
          />
        ) : isScheduledFolder ? (
          <ScheduledMailsPanel
            items={scheduledItems}
            accounts={accounts}
            onChanged={() => {
              queryClient.invalidateQueries({ queryKey: ["scheduled-mails-virtual"] });
              queryClient.invalidateQueries({ queryKey: ["email-folder-counts"] });
            }}
            onOpenCampaign={(id) => navigate(`/kommunikation?campaign=${id}`)}
          />
        ) : (
        <>
        {/* Category tabs - full width above both panels */}
        <div className="border-b shrink-0 overflow-x-auto overflow-y-hidden">
          <div className="flex min-w-max px-2 py-1 gap-0.5">
              <button
                onClick={() => setFilterCategory("all")}
                className={cn(
                  "px-2.5 py-1 rounded text-[11px] whitespace-nowrap transition-colors shrink-0",
                  filterCategory === "all" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"
                )}
              >
                Alle ({emails.length})
              </button>
              <button
                onClick={() => setFilterCategory(filterCategory === "unread" ? "all" : "unread")}
                className={cn(
                  "px-2.5 py-1 rounded text-[11px] whitespace-nowrap transition-colors shrink-0 flex items-center gap-1 font-medium",
                  filterCategory === "unread" ? "bg-blue-600 text-white" : "hover:bg-muted text-muted-foreground"
                )}
              >
                <span className="h-2 w-2 rounded-full bg-current" />
                Ungelesen ({unreadCount})
              </button>
              <button
                onClick={() => setFilterCategory(filterCategory === "followup" ? "all" : "followup")}
                className={cn(
                  "px-2.5 py-1 rounded text-[11px] whitespace-nowrap transition-colors shrink-0 flex items-center gap-1",
                  filterCategory === "followup" ? "bg-orange-500 text-white" : "hover:bg-muted text-muted-foreground"
                )}
              >
                <Flag className="h-3 w-3" />
                Nachverfolgung ({followUpCount})
              </button>
              {ALL_CATEGORIES.map(cat => (
                <button
                  key={cat}
                  onClick={() => setFilterCategory(filterCategory === cat ? "all" : cat)}
                  className={cn(
                    "px-2.5 py-1 rounded text-[11px] whitespace-nowrap transition-colors shrink-0",
                    filterCategory === cat ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"
                  )}
                >
                  {cat} ({categoryCounts[cat] || 0})
                </button>
              ))}
          </div>
        </div>

        <ResizablePanelGroup direction="horizontal" className="flex-1 min-h-0 overflow-hidden">
        {/* Middle: Email List — on mobile: hidden when an email is selected */}
        <ResizablePanel
          defaultSize={35}
          minSize={12}
          maxSize={75}
          className={cn(selectedEmailId ? "hidden md:block" : "block", "h-full overflow-hidden")}
        >
          <div className="flex flex-col h-full min-h-0">


            {/* Search - filters within selected category */}
            <div className="p-2 border-b space-y-2">
              <div className="relative flex items-center gap-1">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={filterCategory !== "all" ? `In "${filterCategory}" suchen...` : "E-Mails durchsuchen..."}
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="pl-9 h-9"
                  />
                </div>
                {isArchiveFolder && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    title="KI-Suche im Archiv"
                    onClick={() => setAiSearchOpen(true)}
                  >
                    <Sparkles className="h-4 w-4 text-primary" />
                  </Button>
                )}
              </div>
              {/* Archive filters */}
              {isArchiveFolder && (
                <div className="flex gap-2">
                  <Select value={filterBuildingId} onValueChange={setFilterBuildingId}>
                    <SelectTrigger className="h-8 text-xs flex-1">
                      <Building2 className="h-3 w-3 mr-1 shrink-0" />
                      <SelectValue placeholder="Liegenschaft" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alle Liegenschaften</SelectItem>
                      <SelectItem value="none">Ohne Liegenschaft</SelectItem>
                      {buildings.map(b => (
                        <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={filterContactId} onValueChange={setFilterContactId}>
                    <SelectTrigger className="h-8 text-xs flex-1">
                      <User className="h-3 w-3 mr-1 shrink-0" />
                      <SelectValue placeholder="Kontakt" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alle Kontakte</SelectItem>
                      <SelectItem value="none">Ohne Kontakt</SelectItem>
                      {contacts.map(c => (
                        <SelectItem key={c.id} value={c.id}>{getContactName(c)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {isTrashFolder && (
              <div className="px-3 py-2 bg-muted/50 border-b text-xs text-muted-foreground flex items-center gap-1.5">
                <Trash2 className="h-3 w-3" />
                E-Mails werden nach 30 Tagen automatisch endgültig gelöscht
              </div>
            )}

            {/* Bulk selection bar */}
            {filteredEmails.length > 0 && (
              <div className="px-3 py-1.5 border-b bg-muted/30 flex items-center gap-2">
                <Checkbox
                  checked={
                    selectedEmailIds.size > 0 && selectedEmailIds.size === filteredEmails.length
                      ? true
                      : selectedEmailIds.size > 0
                        ? "indeterminate"
                        : false
                  }
                  onCheckedChange={(checked) => {
                    if (checked) setSelectedEmailIds(new Set(filteredEmails.map(e => e.id)));
                    else clearSelection();
                  }}
                  aria-label="Alle auswählen"
                />
                {selectedEmailIds.size > 0 ? (
                  <>
                    <span className="text-xs text-muted-foreground">
                      {selectedEmailIds.size} ausgewählt
                    </span>
                    <div className="ml-auto flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={clearSelection}
                      >
                        Aufheben
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-7 px-2 text-xs gap-1"
                        disabled={bulkDeleting}
                        onClick={bulkDeleteSelected}
                      >
                        {bulkDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                        {isTrashFolder ? "Endgültig löschen" : "Löschen"}
                      </Button>
                    </div>
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Mehrere auswählen
                  </span>
                )}
              </div>
            )}

            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
              {emailsLoading ? (
                <div className="p-4 text-center text-sm text-muted-foreground">Laden...</div>
              ) : emailsError ? (
                <div className="p-8 text-center">
                  <Mail className="h-12 w-12 mx-auto text-destructive/40 mb-3" />
                  <p className="text-sm text-destructive">Suche fehlgeschlagen</p>
                  <p className="text-xs text-muted-foreground mt-1">{(emailsError as any)?.message || "Unbekannter Fehler"}</p>
                </div>
              ) : filteredEmails.length === 0 ? (
                <div className="p-8 text-center">
                  <Mail className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">
                    {isSearching ? "Keine Treffer gefunden" : "Keine E-Mails vorhanden"}
                  </p>
                </div>
              ) : (
                filteredEmails.map(email => (
                  <div
                    key={email.id}
                    className={cn(
                      "relative group border-b",
                      selectedEmailIds.has(email.id) && "bg-primary/5"
                    )}
                  >
                    <div
                      className={cn(
                        "absolute left-1 top-1/2 -translate-y-1/2 z-10 transition-opacity",
                        selectedEmailIds.size > 0 || selectedEmailIds.has(email.id)
                          ? "opacity-100"
                          : "opacity-0 group-hover:opacity-100 focus-within:opacity-100"
                      )}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Checkbox
                        checked={selectedEmailIds.has(email.id)}
                        onCheckedChange={(checked) => toggleSelectEmail(email.id, !!checked)}
                        aria-label="E-Mail auswählen"
                        className="bg-background"
                      />
                    </div>
                    <button
                      onClick={() => setSelectedEmailId(email.id)}
                      className={cn(
                        "w-full text-left pl-8 pr-3 py-2 transition-colors relative",
                        selectedEmailId === email.id ? "bg-accent" : "hover:bg-muted/50",
                        !email.is_read && "bg-primary/10 border-l-4 border-l-primary"
                      )}
                    >
                    <div className="flex items-center justify-between gap-1">
                      <span className={cn(
                        "text-sm truncate flex items-center gap-1.5",
                        !email.is_read ? "font-bold text-foreground" : "text-muted-foreground"
                      )}>
                        {!email.is_read && <span className="h-2 w-2 rounded-full bg-primary shrink-0" aria-hidden />}
                        {isSentFolder
                          ? (Array.isArray(email.to_addresses) && email.to_addresses.length > 0
                              ? email.to_addresses.join(", ")
                              : "Unbekannt")
                          : (email.from_name || email.from_address || "Unbekannt")}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        {(() => {
                          const replyId = (email as any).message_id ? (replyMap as any)[(email as any).message_id] : null;
                          if (!replyId) return null;
                          return (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                const sentFolder = folders.find(f => f.name === "Gesendet");
                                if (sentFolder) setSelectedFolderId(sentFolder.id);
                                setSelectedEmailId(replyId);
                              }}
                              title="Bereits beantwortet – zur gesendeten Antwort springen"
                              className="text-green-600 hover:text-green-700"
                            >
                              <Reply className="h-4 w-4" strokeWidth={2.5} />
                            </button>
                          );
                        })()}
                        {email.has_attachments && <Paperclip className="h-3 w-3 text-muted-foreground" />}
                        {email.is_starred && <Flag className="h-3 w-3 text-orange-500 fill-orange-500" />}
                        {email.is_pinned && <Pin className="h-3 w-3 text-primary fill-primary" />}
                        {email.is_etv_relevant && <Vote className="h-3 w-3 text-primary" />}
                        <span className={cn("text-[11px]", !email.is_read ? "text-foreground font-semibold" : "text-muted-foreground")}>
                          {email.date ? new Date(email.date).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }) : ""}
                        </span>
                      </div>
                    </div>
                    <p className={cn("text-xs truncate", !email.is_read ? "text-foreground font-semibold" : "text-muted-foreground")}>
                      {email.subject || "(Kein Betreff)"}
                    </p>
                    <div className="flex items-center justify-between gap-1 mt-0.5">
                      <div className="flex items-center gap-1 flex-1 min-w-0 flex-wrap">
                      {isArchiveFolder && email.building_id && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5">
                          <Building2 className="h-2.5 w-2.5" />
                          {buildings.find(b => b.id === email.building_id)?.name || ""}
                        </Badge>
                      )}
                      {isArchiveFolder && email.contact_id && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5">
                          <User className="h-2.5 w-2.5" />
                          {(() => { const c = contacts.find(c => c.id === email.contact_id); return c ? getContactName(c) : ""; })()}
                        </Badge>
                      )}
                      {email.ai_category && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          {email.ai_category}
                        </Badge>
                      )}
                      {email.ai_priority && (
                        <Badge 
                          variant={email.ai_priority === "hoch" ? "destructive" : "outline"} 
                          className={cn(
                            "text-[10px] px-1.5 py-0",
                            email.ai_priority === "mittel" && "border-orange-400 text-orange-600 dark:text-orange-400",
                            email.ai_priority === "niedrig" && "border-muted-foreground/30 text-muted-foreground"
                          )}
                        >
                          {email.ai_priority === "hoch" ? "Wichtig" : email.ai_priority === "mittel" ? "Mittel" : "Niedrig"}
                        </Badge>
                      )}
                      {isTrashFolder && email.deleted_at && (
                        <span className="text-[10px] text-muted-foreground">
                          {(() => {
                            const daysLeft = Math.max(0, 30 - Math.floor((Date.now() - new Date(email.deleted_at).getTime()) / (1000 * 60 * 60 * 24)));
                            return `${daysLeft} Tage verbleibend`;
                          })()}
                        </span>
                      )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {/* Assignment badge - clickable to change */}
                          {(() => {
                           const getShortCode = (userId: string) => {
                             const userAccountIds = accountUsers.filter(au => au.user_id === userId).map(au => au.account_id);
                             const acct = accounts.find(a => userAccountIds.includes(a.id) && a.short_code);
                             if (acct?.short_code) return acct.short_code as string;
                             const p = adminProfiles.find(pp => pp.user_id === userId);
                             return p ? [p.first_name, p.last_name].filter(Boolean).map(n => n?.[0]).join("") : "";
                           };
                           const assignedProfile = (email as any).assigned_to 
                             ? adminProfiles.find(p => p.user_id === (email as any).assigned_to) 
                             : null;
                           const initials = (email as any).assigned_to ? getShortCode((email as any).assigned_to) : "";

                           if (!initials && !(email as any).assigned_to) {
                             return (
                               <select
                                 className="h-5 w-5 rounded-full text-[9px] cursor-pointer border-0 appearance-none text-center bg-transparent text-transparent hover:bg-muted/50"
                                 value="none"
                                 onClick={e => e.stopPropagation()}
                                onChange={async (e) => {
                                    e.stopPropagation();
                                    const val = e.target.value === "none" ? null : e.target.value;
                                    const update: any = { assigned_to: val };
                                    if (val) {
                                      const targetAccountIds = accountUsers.filter(au => au.user_id === val).map(au => au.account_id);
                                      if (targetAccountIds.length > 0 && !targetAccountIds.includes(email.account_id)) {
                                        update.account_id = targetAccountIds[0];
                                      }
                                    }
                                    await supabase.from("emails").update(update).eq("id", email.id);
                                    queryClient.invalidateQueries({ queryKey: ["emails"] });
                                  }}
                                  title="Zuordnen"
                                 style={{ WebkitAppearance: 'none', MozAppearance: 'none', textAlignLast: 'center', padding: '0' }}
                               >
                                 <option value="none"> </option>
                                  {adminProfiles.map(p => (
                                    <option key={p.user_id} value={p.user_id}>
                                      {getShortCode(p.user_id)}
                                    </option>
                                  ))}

                               </select>
                             );
                           }
                           return (
                             <select
                               className="h-5 min-w-[20px] rounded-full text-[9px] font-normal cursor-pointer border-0 appearance-none text-center text-muted-foreground"
                               value={(email as any).assigned_to || "none"}
                               onClick={e => e.stopPropagation()}
                                onChange={async (e) => {
                                  e.stopPropagation();
                                  const val = e.target.value === "none" ? null : e.target.value;
                                  const update: any = { assigned_to: val };
                                  if (val) {
                                    const targetAccountIds = accountUsers.filter(au => au.user_id === val).map(au => au.account_id);
                                    if (targetAccountIds.length > 0 && !targetAccountIds.includes(email.account_id)) {
                                      update.account_id = targetAccountIds[0];
                                    }
                                  }
                                  await supabase.from("emails").update(update).eq("id", email.id);
                                  queryClient.invalidateQueries({ queryKey: ["emails"] });
                                }}
                               title={assignedProfile ? [assignedProfile.first_name, assignedProfile.last_name].filter(Boolean).join(" ") : "Zuordnen"}
                               style={{ WebkitAppearance: 'none', MozAppearance: 'none', textAlignLast: 'center', width: `${Math.max(24, initials.length * 9 + 10)}px`, padding: '0 2px' }}
                             >
                               <option value="none">—</option>
                                {adminProfiles.map(p => (
                                  <option key={p.user_id} value={p.user_id}>
                                    {getShortCode(p.user_id)}
                                  </option>
                                ))}

                             </select>
                           );
                         })()}
                      </div>
                    </div>
                    {isTrashFolder && (
                      <div className="flex items-center gap-0.5 mt-0.5">
                        <button
                          className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
                          onClick={(e) => { e.stopPropagation(); restoreEmail(email.id); }}
                        >
                          <Undo2 className="h-3 w-3" />
                          Wiederherstellen
                        </button>
                      </div>
                    )}
                    </button>
                  </div>
                ))
              )}
              {!emailsLoading && !emailsError && filteredEmails.length > 0 && canLoadMore && (
                <div className="p-3 flex justify-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPageLimit((n) => n + (isSearching ? 500 : 200))}
                  >
                    Mehr laden ({emails.length} geladen)
                  </Button>
                </div>
              )}
            </div>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle className="hidden md:flex w-1.5 bg-border hover:bg-primary/40 transition-colors" />

        {/* Right: Email Detail — on mobile: only visible when an email is selected */}
        <ResizablePanel
          defaultSize={65}
          className={cn(selectedEmailId ? "block" : "hidden md:block", "h-full overflow-hidden min-h-0")}
        >
          <div className="flex flex-col h-full min-h-0 min-w-0">
            {selectedEmail ? (
              <>
                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y" style={{ WebkitOverflowScrolling: 'touch' }}>
                  <div className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-4">
                      <h2 className="text-lg font-semibold truncate">{selectedEmail.subject || "(Kein Betreff)"}</h2>
                      <div className="flex items-center gap-1 shrink-0">
                        {isTrashFolder ? (
                          <>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => restoreEmail(selectedEmail.id)} title="Wiederherstellen">
                              <Undo2 className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-destructive" onClick={() => permanentDeleteEmail(selectedEmail.id)} title="Endgültig löschen">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleRead(selectedEmail.id, selectedEmail.is_read)} title={selectedEmail.is_read ? "Als ungelesen markieren" : "Als gelesen markieren"}>
                              <MailOpen className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleFollowUp(selectedEmail.id, selectedEmail.is_starred)} title={selectedEmail.is_starred ? "Nachverfolgung entfernen" : "Zur Nachverfolgung markieren"}>
                              <Flag className={cn("h-4 w-4", selectedEmail.is_starred && "text-orange-500 fill-orange-500")} />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => togglePin(selectedEmail.id, !!selectedEmail.is_pinned)} title={selectedEmail.is_pinned ? "Anpinnung entfernen" : "Oben anpinnen"}>
                              {selectedEmail.is_pinned ? <PinOff className="h-4 w-4 text-primary" /> : <Pin className="h-4 w-4" />}
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openArchiveDialog(selectedEmail.id)} title="Zuordnen / Archivieren">
                              <Link2 className="h-4 w-4" />
                            </Button>
                            
                            {selectedEmail.is_archived && (
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={async () => {
                                await supabase.from("emails").update({ is_archived: false }).eq("id", selectedEmail.id);
                                queryClient.invalidateQueries({ queryKey: ["emails"] });
                                queryClient.invalidateQueries({ queryKey: ["email-folder-counts"] });
                                toast.success("E-Mail aus Archiv entfernt");
                              }} title="Aus Archiv entfernen">
                                <ArchiveRestore className="h-4 w-4" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-destructive" onClick={() => deleteEmail(selectedEmail.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <button className="flex items-center gap-1.5 text-sm hover:underline cursor-pointer" onClick={() => setShowEmailDetails(prev => !prev)}>
                          <span className="font-medium text-foreground">{selectedEmail.from_name || selectedEmail.from_address}</span>
                          <span className="text-xs text-muted-foreground">
                            {selectedEmail.date && new Date(selectedEmail.date).toLocaleString("de-DE")}
                          </span>
                          {showEmailDetails ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                        </button>
                        {showEmailDetails && (
                          <div className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                            {selectedEmail.from_name && <div>Von: {selectedEmail.from_name} &lt;{selectedEmail.from_address}&gt;</div>}
                            {selectedEmail.to_addresses && (
                              <div>An: {Array.isArray(selectedEmail.to_addresses) ? (selectedEmail.to_addresses as string[]).join(", ") : String(selectedEmail.to_addresses)}</div>
                            )}
                            {selectedEmail.cc_addresses && (
                              <div>CC: {Array.isArray(selectedEmail.cc_addresses) ? (selectedEmail.cc_addresses as string[]).join(", ") : String(selectedEmail.cc_addresses)}</div>
                            )}
                          </div>
                        )}
                      </div>
                      {!senderHasContact && selectedEmail.from_address && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="h-7 gap-1 text-xs shrink-0">
                              <UserPlus className="h-3.5 w-3.5" />
                              Kontakt speichern
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-64">
                            <DropdownMenuItem onClick={openNewContactFromEmail}>
                              <UserPlus className="h-4 w-4 mr-2" />
                              Neuen Kontakt anlegen
                            </DropdownMenuItem>
                            {contacts.length > 0 && (
                              <>
                                <DropdownMenuSeparator />
                                <div className="px-2 py-1.5">
                                  <Input
                                    placeholder="Kontakt suchen..."
                                    value={contactSearchTerm}
                                    onChange={e => setContactSearchTerm(e.target.value)}
                                    className="h-7 text-xs"
                                    onClick={e => e.stopPropagation()}
                                    onKeyDown={e => e.stopPropagation()}
                                  />
                                </div>
                                <div className="max-h-48 overflow-y-auto">
                                  {contacts
                                    .filter(c => {
                                      if (!contactSearchTerm.trim()) return false;
                                      const name = getContactName(c).toLowerCase();
                                      return name.includes(contactSearchTerm.toLowerCase());
                                    })
                                    .map(c => (
                                      <DropdownMenuItem key={c.id} onClick={() => { addEmailToExistingContact(c.id); setContactSearchTerm(""); }}>
                                        <UserCheck className="h-3.5 w-3.5 mr-2 shrink-0" />
                                        {getContactName(c)}
                                      </DropdownMenuItem>
                                    ))
                                  }
                                  {contactSearchTerm.trim() && contacts.filter(c => getContactName(c).toLowerCase().includes(contactSearchTerm.toLowerCase())).length === 0 && (
                                    <p className="px-2 py-1.5 text-xs text-muted-foreground">Kein Kontakt gefunden</p>
                                  )}
                                </div>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {selectedEmail.building_id && (
                        <Badge variant="outline" className="gap-1">
                          <Building2 className="h-3 w-3" />
                          {buildings.find(b => b.id === selectedEmail.building_id)?.name || "Liegenschaft"}
                        </Badge>
                      )}
                      {selectedEmail.contact_id && (
                        <Badge variant="outline" className="gap-1">
                          <User className="h-3 w-3" />
                          {(() => { const c = contacts.find(c => c.id === selectedEmail.contact_id); return c ? getContactName(c) : "Kontakt"; })()}
                        </Badge>
                      )}
                      {(selectedEmail as any).case_id && (
                        <Badge variant="default" className="gap-1">
                          <Link2 className="h-3 w-3" />
                          Vorgang verknüpft
                        </Badge>
                      )}
                      {!(selectedEmail as any).case_id && (selectedEmail as any).ai_case_suggestion_id && (
                        <Badge variant="secondary" className="gap-1 cursor-pointer" onClick={() => openArchiveDialog(selectedEmail.id)}>
                          <Sparkles className="h-3 w-3" />
                          KI-Vorschlag: Vorgang ({Math.round(((selectedEmail as any).ai_case_confidence || 0) * 100)}%)
                        </Badge>
                      )}
                      {selectedEmail.ai_category && <Badge variant="outline">{selectedEmail.ai_category}</Badge>}
                      {selectedEmail.ai_priority && (
                        <Badge variant={selectedEmail.ai_priority === "hoch" ? "destructive" : "secondary"}>
                          Priorität: {selectedEmail.ai_priority}
                        </Badge>
                      )}
                    </div>
                    {selectedEmail.ai_summary && (
                      <p className="text-sm bg-muted/50 rounded-md p-2 italic">KI: {selectedEmail.ai_summary}</p>
                    )}
                  </div>

                  {selectedEmail.has_attachments && (
                    <div className="px-4 pb-2">
                      <EmailAttachments emailId={selectedEmail.id} />
                    </div>
                  )}

                  <Separator />

                  <div className="p-4">
                    {(() => {
                      const html = selectedEmail.body_html ?? "";
                      const stripped = html.replace(/<[^>]*>/g, "").replace(/&nbsp;/gi, " ").trim();
                      if (html && stripped.length > 0) {
                        return <EmailHtmlBody key={selectedEmail.id} html={html} emailId={selectedEmail.id} />;
                      }
                      return (
                        <pre className="text-sm whitespace-pre-wrap font-sans">{selectedEmail.body_text || "Kein Inhalt"}</pre>
                      );
                    })()}
                  </div>
                </div>
                <div className="p-3 border-t flex gap-2">
                  <Button size="sm" className="gap-1.5" onClick={() => {
                    openCompose({ replyTo: { id: selectedEmail.id, message_id: (selectedEmail as any).message_id, subject: selectedEmail.subject, from_address: selectedEmail.from_address, from_name: selectedEmail.from_name, body_text: selectedEmail.body_text, date: selectedEmail.date, account_id: selectedEmail.account_id } });
                  }}>
                    <Reply className="h-3.5 w-3.5" />
                    Antworten
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => {
                    openCompose({ forward: { email_id: selectedEmail.id, message_id: (selectedEmail as any).message_id, subject: selectedEmail.subject, body_text: selectedEmail.body_text, body_html: selectedEmail.body_html, account_id: selectedEmail.account_id } });
                  }}>
                    <Forward className="h-3.5 w-3.5" />
                    Weiterleiten
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 ml-auto" title="Drucken / als PDF" onClick={() => setPrintDialogOpen(true)}>
                    <Printer className="h-4 w-4" />
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <Mail className="h-16 w-16 mx-auto text-muted-foreground/20 mb-4" />
                  <p className="text-muted-foreground">Wählen Sie eine E-Mail aus</p>
                </div>
              </div>
            )}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
        </>
        )}
      </div>


      <AssignEmailDialog
        open={archiveDialogOpen}
        onOpenChange={setArchiveDialogOpen}
        emailId={archiveEmailId}
        onAssign={handleAssign}
        prefilledContactId={archiveEmailId ? (emails.find(e => e.id === archiveEmailId)?.contact_id || null) : null}
        prefilledBuildingId={archiveEmailId ? (emails.find(e => e.id === archiveEmailId)?.building_id || null) : null}
        prefilledCaseId={archiveEmailId ? ((emails.find(e => e.id === archiveEmailId) as any)?.case_id || (emails.find(e => e.id === archiveEmailId) as any)?.ai_case_suggestion_id || null) : null}
        prefilledIsEtvRelevant={archiveEmailId ? !!(emails.find(e => e.id === archiveEmailId) as any)?.is_etv_relevant : false}
        prefilledEtvMeetingId={archiveEmailId ? ((emails.find(e => e.id === archiveEmailId) as any)?.etv_meeting_id || null) : null}
      />

      <PrintEmailDialog
        open={printDialogOpen}
        onOpenChange={setPrintDialogOpen}
        email={selectedEmail as any}
      />

      <AiEmailSearchDialog
        open={aiSearchOpen}
        onOpenChange={setAiSearchOpen}
        accountIds={selectedAccountIds}
        onSelectEmail={async (emailId) => {
          setAiSearchOpen(false);
          const { data } = await supabase
            .from("emails")
            .select("id, folder_id, is_archived")
            .eq("id", emailId)
            .maybeSingle();
          if (data) {
            if (data.is_archived) {
              const archive = folders.find((f) => f.name === "Archiv");
              if (archive) setSelectedFolderId(archive.id);
            } else if (data.folder_id) {
              setSelectedFolderId(data.folder_id);
            }
            setSelectedEmailId(data.id);
          }
        }}
      />

      <Dialog open={newContactDialogOpen} onOpenChange={setNewContactDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Neuen Kontakt anlegen</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Vorname</Label>
                <Input value={newContactData.first_name} onChange={e => setNewContactData(prev => ({ ...prev, first_name: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Nachname</Label>
                <Input value={newContactData.last_name} onChange={e => setNewContactData(prev => ({ ...prev, last_name: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Firma</Label>
              <Input value={newContactData.company_name} onChange={e => setNewContactData(prev => ({ ...prev, company_name: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">E-Mail</Label>
              <Input value={newContactData.email} disabled className="bg-muted" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewContactDialogOpen(false)}>Abbrechen</Button>
            <Button onClick={handleCreateContact}>Kontakt erstellen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isAdmin && (
        <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
          <SheetContent className="sm:max-w-xl overflow-y-auto">
            <SheetHeader>
              <SheetTitle>E-Mail-Einstellungen</SheetTitle>
            </SheetHeader>
            <div className="mt-4">
              <EmailSettingsSection />
            </div>
          </SheetContent>
        </Sheet>
      )}

      {/* Mobile Folders Sheet — replaces the desktop folder sidebar on small screens */}
      <Sheet open={mobileFoldersOpen} onOpenChange={setMobileFoldersOpen}>
        <SheetContent side="left" className="w-[85vw] sm:max-w-sm p-0 flex flex-col">
          <SheetHeader className="p-3 border-b">
            <SheetTitle className="text-left">Postfach</SheetTitle>
          </SheetHeader>
          <ScrollArea className="flex-1">
            <div className="p-2">
              <p className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ordner</p>
              {folders.map(folder => {
                const Icon = folderIcons[folder.icon || 'inbox'] || Mail;
                const isActive = selectedFolderId === folder.id;
                const count = folderCounts[folder.id] || 0;
                return (
                  <button
                    key={folder.id}
                    onClick={() => {
                      setSelectedFolderId(folder.id);
                      setSelectedEmailId(null);
                      setMobileFoldersOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-3 rounded-md text-sm transition-colors",
                      isActive ? "bg-primary text-primary-foreground" : "hover:bg-muted text-foreground"
                    )}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <span className="truncate flex-1 text-left">{folder.name}</span>
                    {count > 0 && folder.name !== "Papierkorb" && (
                      <Badge
                        variant={isActive ? "secondary" : (folder.id === SCHEDULED_FOLDER_ID ? "outline" : "default")}
                        className={cn(
                          "text-xs",
                          folder.id === SCHEDULED_FOLDER_ID && !isActive && "border-amber-400 text-amber-700 dark:text-amber-300"
                        )}
                      >
                        {count}
                      </Badge>
                    )}
                  </button>
                );
              })}
            </div>

            <Separator className="my-2" />

            <div className="p-2">
              <div className="flex items-center justify-between px-2 py-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Konten</p>
                {isAdmin && (
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setSettingsOpen(true); setMobileFoldersOpen(false); }} title="E-Mail-Konten verwalten">
                    <Settings className="h-4 w-4 text-muted-foreground" />
                  </Button>
                )}
              </div>
              {accounts.length === 0 ? (
                <p className="px-2 py-2 text-xs text-muted-foreground">Noch keine E-Mail-Konten.</p>
              ) : (
                accounts.map(acc => {
                  const checked = selectedAccountIds === null || selectedAccountIds.includes(acc.id);
                  return (
                    <label key={acc.id} className="w-full flex items-center gap-2 px-2 py-2.5 text-sm rounded-md hover:bg-muted/50 cursor-pointer">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => {
                          const allIds = accounts.map(a => a.id);
                          const current = selectedAccountIds === null ? [...allIds] : [...selectedAccountIds];
                          const idx = current.indexOf(acc.id);
                          if (idx >= 0) current.splice(idx, 1);
                          else current.push(acc.id);
                          const next = current.length === allIds.length ? null : current;
                          setSelectedAccountIds(next);
                          try { localStorage.setItem("inbox-selected-accounts", JSON.stringify(next)); } catch {}
                        }}
                      />
                      <span className="truncate flex-1">{acc.display_name}</span>
                    </label>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  );
};