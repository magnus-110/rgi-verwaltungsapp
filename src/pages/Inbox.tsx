import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Mail, Search, Star, Archive, Trash2, Inbox as InboxIcon, Send, FileEdit, ShieldAlert, Plus, RefreshCw, Settings, Loader2, MailOpen, Reply, Forward, Building2, User, Paperclip, ChevronDown, ChevronUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ComposeEmailDialog } from "@/components/email/ComposeEmailDialog";
import { EmailAttachments } from "@/components/email/EmailAttachments";
import { ArchiveEmailDialog } from "@/components/email/ArchiveEmailDialog";
import { EmailHtmlBody } from "@/components/email/EmailHtmlBody";
import { useNavigate } from "react-router-dom";

const folderIcons: Record<string, any> = {
  'inbox': InboxIcon,
  'send': Send,
  'file-edit': FileEdit,
  'archive': Archive,
  'shield-alert': ShieldAlert,
  'trash-2': Trash2,
};

export const Inbox = () => {
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeReplyTo, setComposeReplyTo] = useState<any>(null);
  const [composeForward, setComposeForward] = useState<any>(null);
  const [filterAccountId, setFilterAccountId] = useState<string>("all");
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archiveEmailId, setArchiveEmailId] = useState<string | null>(null);
  const [filterBuildingId, setFilterBuildingId] = useState<string>("all");
  const [filterContactId, setFilterContactId] = useState<string>("all");
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Fetch folders
  const { data: folders = [] } = useQuery({
    queryKey: ["email-folders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_folders")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  // Fetch accounts
  const { data: accounts = [] } = useQuery({
    queryKey: ["email-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_accounts")
        .select("id, display_name, email_address, is_active, last_sync_at")
        .order("display_name");
      if (error) throw error;
      return data;
    },
  });

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

  // Unread counts per folder
  const { data: folderCounts = {} } = useQuery({
    queryKey: ["email-folder-counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("emails")
        .select("folder_id, is_read")
        .eq("is_read", false)
        .eq("is_archived", false);
      if (error) throw error;
      const counts: Record<string, number> = {};
      data?.forEach(e => {
        if (e.folder_id) {
          counts[e.folder_id] = (counts[e.folder_id] || 0) + 1;
        }
      });
      return counts;
    },
  });

  // Fetch emails for selected folder
  const { data: emails = [], isLoading: emailsLoading } = useQuery({
    queryKey: ["emails", selectedFolderId, searchTerm, filterAccountId, isArchiveFolder, filterBuildingId, filterContactId],
    queryFn: async () => {
      let query = supabase
        .from("emails")
        .select("*")
        .order("date", { ascending: false })
        .limit(200);

      if (isArchiveFolder) {
        // Archive: show archived emails
        query = query.eq("is_archived", true);
        
        if (filterBuildingId !== "all") {
          query = query.eq("building_id", filterBuildingId);
        }
        if (filterContactId !== "all") {
          query = query.eq("contact_id", filterContactId);
        }
      } else {
        // Normal folders: exclude archived
        query = query.eq("is_archived", false);
        
        if (selectedFolderId) {
          query = query.eq("folder_id", selectedFolderId);
        }
      }

      if (filterAccountId !== "all") {
        query = query.eq("account_id", filterAccountId);
      }

      if (searchTerm.trim()) {
        query = query.or(`subject.ilike.%${searchTerm}%,from_name.ilike.%${searchTerm}%,from_address.ilike.%${searchTerm}%,body_text.ilike.%${searchTerm}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const selectedEmail = emails.find(e => e.id === selectedEmailId);

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

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-emails");
      if (error) throw error;
      toast.success("E-Mails synchronisiert");
      queryClient.invalidateQueries({ queryKey: ["emails"] });
      queryClient.invalidateQueries({ queryKey: ["email-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["email-folder-counts"] });
    } catch (err: any) {
      toast.error("Sync fehlgeschlagen: " + (err.message || "Unbekannter Fehler"));
    } finally {
      setIsSyncing(false);
    }
  };

  const toggleStar = async (emailId: string, currentStarred: boolean) => {
    await supabase.from("emails").update({ is_starred: !currentStarred }).eq("id", emailId);
    queryClient.invalidateQueries({ queryKey: ["emails"] });
  };

  const openArchiveDialog = (emailId: string) => {
    setArchiveEmailId(emailId);
    setArchiveDialogOpen(true);
  };

  const handleArchiveWithAssignment = async (emailId: string, buildingId: string | null, contactId: string | null) => {
    await supabase.from("emails").update({
      is_archived: true,
      building_id: buildingId,
      contact_id: contactId,
    }).eq("id", emailId);
    if (selectedEmailId === emailId) setSelectedEmailId(null);
    queryClient.invalidateQueries({ queryKey: ["emails"] });
    queryClient.invalidateQueries({ queryKey: ["email-folder-counts"] });
    toast.success("E-Mail archiviert");
  };

  const deleteEmail = async (emailId: string) => {
    const trashFolder = folders.find(f => f.name === "Papierkorb");
    if (trashFolder) {
      await supabase.from("emails").update({ folder_id: trashFolder.id }).eq("id", emailId);
    } else {
      await supabase.from("emails").delete().eq("id", emailId);
    }
    if (selectedEmailId === emailId) setSelectedEmailId(null);
    queryClient.invalidateQueries({ queryKey: ["emails"] });
    queryClient.invalidateQueries({ queryKey: ["email-folder-counts"] });
    toast.success("E-Mail gelöscht");
  };

  const toggleRead = async (emailId: string, currentRead: boolean) => {
    await supabase.from("emails").update({ is_read: !currentRead }).eq("id", emailId);
    queryClient.invalidateQueries({ queryKey: ["emails"] });
    queryClient.invalidateQueries({ queryKey: ["email-folder-counts"] });
  };

  const getContactName = (c: any) => {
    const parts = [c.first_name, c.last_name].filter(Boolean).join(" ");
    return parts || c.company_name || "Unbenannt";
  };

  return (
    <div className="h-[calc(100vh-8rem)] flex rounded-lg border bg-background overflow-hidden">
      {/* Left: Folders & Accounts */}
      <div className="w-56 border-r flex flex-col shrink-0">
        <div className="p-3 border-b flex gap-2">
          <Button size="sm" className="flex-1 gap-2" onClick={() => { setComposeReplyTo(null); setComposeForward(null); setComposeOpen(true); }}>
            <Plus className="h-4 w-4" />
            Neue E-Mail
          </Button>
          <Button size="sm" variant="outline" onClick={handleSync} disabled={isSyncing}>
            {isSyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
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
                  {count > 0 && (
                    <Badge variant={isActive ? "secondary" : "default"} className="text-[10px] px-1.5 py-0 h-5 min-w-[20px] justify-center">
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
              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => navigate("/settings")}>
                <Settings className="h-3 w-3 text-muted-foreground" />
              </Button>
            </div>
            {accounts.length === 0 ? (
              <p className="px-2 py-2 text-xs text-muted-foreground">
                Noch keine E-Mail-Konten.
              </p>
            ) : (
              accounts.map(acc => (
                <button
                  key={acc.id}
                  onClick={() => setFilterAccountId(filterAccountId === acc.id ? "all" : acc.id)}
                  className={cn(
                    "w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md transition-colors",
                    filterAccountId === acc.id ? "bg-accent text-accent-foreground" : "hover:bg-muted/50 text-muted-foreground"
                  )}
                >
                  <div className={cn("h-2 w-2 rounded-full shrink-0", acc.is_active ? "bg-green-500" : "bg-muted-foreground")} />
                  <span className="truncate text-left flex-1">{acc.display_name}</span>
                </button>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Middle: Email List */}
      <div className="w-80 border-r flex flex-col shrink-0">
        <div className="p-2 border-b space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="E-Mails durchsuchen..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-9 h-9"
            />
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
                  {contacts.map(c => (
                    <SelectItem key={c.id} value={c.id}>{getContactName(c)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <ScrollArea className="flex-1">
          {emailsLoading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">Laden...</div>
          ) : emails.length === 0 ? (
            <div className="p-8 text-center">
              <Mail className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">Keine E-Mails vorhanden</p>
            </div>
          ) : (
            emails.map(email => (
              <button
                key={email.id}
                onClick={() => setSelectedEmailId(email.id)}
                className={cn(
                  "w-full text-left p-3 border-b transition-colors",
                  selectedEmailId === email.id ? "bg-accent" : "hover:bg-muted/50",
                  !email.is_read && "bg-primary/5"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className={cn("text-sm truncate", !email.is_read && "font-semibold")}>
                    {email.from_name || email.from_address || "Unbekannt"}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    {email.is_starred && <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />}
                    <span className="text-xs text-muted-foreground">
                      {email.date ? new Date(email.date).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }) : ""}
                    </span>
                  </div>
                </div>
                <p className={cn("text-sm truncate mt-0.5", !email.is_read ? "text-foreground" : "text-muted-foreground")}>
                  {email.subject || "(Kein Betreff)"}
                </p>
                {email.ai_summary && (
                  <p className="text-xs text-muted-foreground truncate mt-0.5 italic">
                    {email.ai_summary}
                  </p>
                )}
                <div className="flex items-center gap-1.5 mt-1">
                  {email.has_attachments && (
                    <Paperclip className="h-3 w-3 text-muted-foreground" />
                  )}
                  {/* Show building/contact badges in archive */}
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
                  {email.ai_priority === "hoch" && (
                    <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                      Wichtig
                    </Badge>
                  )}
                </div>
              </button>
            ))
          )}
        </ScrollArea>
      </div>

      {/* Right: Email Detail */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedEmail ? (
          <>
            <div className="p-4 border-b space-y-2">
              <div className="flex items-start justify-between gap-4">
                <h2 className="text-lg font-semibold truncate">{selectedEmail.subject || "(Kein Betreff)"}</h2>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost" size="icon" className="h-8 w-8"
                    onClick={() => toggleRead(selectedEmail.id, selectedEmail.is_read)}
                    title={selectedEmail.is_read ? "Als ungelesen markieren" : "Als gelesen markieren"}
                  >
                    <MailOpen className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost" size="icon" className="h-8 w-8"
                    onClick={() => toggleStar(selectedEmail.id, selectedEmail.is_starred)}
                  >
                    <Star className={cn("h-4 w-4", selectedEmail.is_starred && "text-yellow-500 fill-yellow-500")} />
                  </Button>
                  {!selectedEmail.is_archived && (
                    <Button
                      variant="ghost" size="icon" className="h-8 w-8"
                      onClick={() => openArchiveDialog(selectedEmail.id)}
                    >
                      <Archive className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost" size="icon" className="h-8 w-8 hover:text-destructive"
                    onClick={() => deleteEmail(selectedEmail.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{selectedEmail.from_name || selectedEmail.from_address}</span>
                {selectedEmail.from_name && (
                  <span className="text-xs">&lt;{selectedEmail.from_address}&gt;</span>
                )}
              </div>
              {selectedEmail.to_addresses && (
                <div className="text-xs text-muted-foreground">
                  An: {Array.isArray(selectedEmail.to_addresses) 
                    ? (selectedEmail.to_addresses as string[]).join(", ") 
                    : String(selectedEmail.to_addresses)}
                </div>
              )}
              <div className="text-xs text-muted-foreground">
                {selectedEmail.date && new Date(selectedEmail.date).toLocaleString("de-DE")}
              </div>
              {/* Show assignment badges in detail */}
              {(selectedEmail.building_id || selectedEmail.contact_id) && (
                <div className="flex flex-wrap gap-2 pt-1">
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
                </div>
              )}
              {(selectedEmail.ai_category || selectedEmail.ai_summary) && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {selectedEmail.ai_category && (
                    <Badge variant="outline">{selectedEmail.ai_category}</Badge>
                  )}
                  {selectedEmail.ai_priority && (
                    <Badge variant={selectedEmail.ai_priority === "hoch" ? "destructive" : "secondary"}>
                      Priorität: {selectedEmail.ai_priority}
                    </Badge>
                  )}
                </div>
              )}
              {selectedEmail.ai_summary && (
                <p className="text-sm bg-muted/50 rounded-md p-2 italic">
                  KI: {selectedEmail.ai_summary}
                </p>
              )}
            </div>
            {selectedEmail.has_attachments && (
              <div className="px-4 pt-3">
                <EmailAttachments emailId={selectedEmail.id} />
              </div>
            )}
            <ScrollArea className="flex-1 p-4">
              {selectedEmail.body_html ? (
                <EmailHtmlBody html={selectedEmail.body_html} emailId={selectedEmail.id} />
              ) : (
                <pre className="text-sm whitespace-pre-wrap font-sans">{selectedEmail.body_text || "Kein Inhalt"}</pre>
              )}
            </ScrollArea>
            <div className="p-3 border-t flex gap-2">
              <Button size="sm" className="gap-1.5" onClick={() => {
                setComposeReplyTo({
                  subject: selectedEmail.subject,
                  from_address: selectedEmail.from_address,
                  from_name: selectedEmail.from_name,
                  body_text: selectedEmail.body_text,
                  date: selectedEmail.date,
                  account_id: selectedEmail.account_id,
                });
                setComposeForward(null);
                setComposeOpen(true);
              }}>
                <Reply className="h-3.5 w-3.5" />
                Antworten
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => {
                setComposeForward({
                  subject: selectedEmail.subject,
                  body_text: selectedEmail.body_text,
                  body_html: selectedEmail.body_html,
                  account_id: selectedEmail.account_id,
                });
                setComposeReplyTo(null);
                setComposeOpen(true);
              }}>
                <Forward className="h-3.5 w-3.5" />
                Weiterleiten
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

      <ComposeEmailDialog
        open={composeOpen}
        onOpenChange={setComposeOpen}
        replyTo={composeReplyTo}
        forward={composeForward}
      />
      <ArchiveEmailDialog
        open={archiveDialogOpen}
        onOpenChange={setArchiveDialogOpen}
        emailId={archiveEmailId}
        onArchive={handleArchiveWithAssignment}
      />
    </div>
  );
};