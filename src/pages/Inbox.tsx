import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Mail, Search, Star, Archive, Trash2, Inbox as InboxIcon, Send, FileEdit, ShieldAlert, Plus, RefreshCw, Settings, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

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
  const queryClient = useQueryClient();

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

  // Fetch emails for selected folder
  const { data: emails = [], isLoading: emailsLoading } = useQuery({
    queryKey: ["emails", selectedFolderId, searchTerm],
    queryFn: async () => {
      let query = supabase
        .from("emails")
        .select("*")
        .order("date", { ascending: false })
        .limit(100);

      if (selectedFolderId) {
        query = query.eq("folder_id", selectedFolderId);
      }

      if (searchTerm.trim()) {
        query = query.or(`subject.ilike.%${searchTerm}%,from_name.ilike.%${searchTerm}%,from_address.ilike.%${searchTerm}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  // Fetch selected email detail
  const selectedEmail = emails.find(e => e.id === selectedEmailId);

  // Auto-select inbox folder
  useEffect(() => {
    const inboxFolder = folders.find(f => f.name === "Eingang");
    if (inboxFolder && !selectedFolderId) {
      setSelectedFolderId(inboxFolder.id);
    }
  }, [folders, selectedFolderId]);

  const unreadCount = emails.filter(e => !e.is_read).length;

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-emails");
      if (error) throw error;
      toast.success("E-Mails synchronisiert");
      queryClient.invalidateQueries({ queryKey: ["emails"] });
      queryClient.invalidateQueries({ queryKey: ["email-accounts"] });
    } catch (err: any) {
      toast.error("Sync fehlgeschlagen: " + (err.message || "Unbekannter Fehler"));
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="h-[calc(100vh-8rem)] flex rounded-lg border bg-background overflow-hidden">
      {/* Left: Folders & Accounts */}
      <div className="w-56 border-r flex flex-col shrink-0">
        <div className="p-3 border-b">
          <Button size="sm" className="w-full gap-2">
            <Plus className="h-4 w-4" />
            Neue E-Mail
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2">
            <p className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ordner</p>
            {folders.map(folder => {
              const Icon = folderIcons[folder.icon || 'inbox'] || Mail;
              const isActive = selectedFolderId === folder.id;
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
                </button>
              );
            })}
          </div>

          <Separator className="my-2" />

          <div className="p-2">
            <p className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Konten</p>
            {accounts.length === 0 ? (
              <p className="px-2 py-2 text-xs text-muted-foreground">
                Noch keine E-Mail-Konten konfiguriert.
              </p>
            ) : (
              accounts.map(acc => (
                <div key={acc.id} className="flex items-center gap-2 px-2 py-1.5 text-sm">
                  <div className={cn("h-2 w-2 rounded-full shrink-0", acc.is_active ? "bg-green-500" : "bg-muted-foreground")} />
                  <span className="truncate text-muted-foreground">{acc.display_name}</span>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Middle: Email List */}
      <div className="w-80 border-r flex flex-col shrink-0">
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="E-Mails durchsuchen..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          {emailsLoading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">Laden...</div>
          ) : emails.length === 0 ? (
            <div className="p-8 text-center">
              <Mail className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">Keine E-Mails vorhanden</p>
              <p className="text-xs text-muted-foreground mt-1">
                Konfigurieren Sie ein E-Mail-Konto in den Einstellungen.
              </p>
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
                  <span className="text-xs text-muted-foreground shrink-0">
                    {email.date ? new Date(email.date).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }) : ""}
                  </span>
                </div>
                <p className={cn("text-sm truncate mt-0.5", !email.is_read ? "text-foreground" : "text-muted-foreground")}>
                  {email.subject || "(Kein Betreff)"}
                </p>
                <div className="flex items-center gap-1.5 mt-1">
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
                  {email.is_starred && <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />}
                  {email.has_attachments && <Mail className="h-3 w-3 text-muted-foreground" />}
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
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Star className={cn("h-4 w-4", selectedEmail.is_starred && "text-yellow-500 fill-yellow-500")} />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Archive className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
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
              <div className="text-xs text-muted-foreground">
                {selectedEmail.date && new Date(selectedEmail.date).toLocaleString("de-DE")}
              </div>
              {(selectedEmail.building_id || selectedEmail.ai_category || selectedEmail.ai_summary) && (
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
                  KI-Zusammenfassung: {selectedEmail.ai_summary}
                </p>
              )}
            </div>
            <ScrollArea className="flex-1 p-4">
              {selectedEmail.body_html ? (
                <div
                  className="prose prose-sm max-w-none dark:prose-invert"
                  dangerouslySetInnerHTML={{ __html: selectedEmail.body_html }}
                />
              ) : (
                <pre className="text-sm whitespace-pre-wrap font-sans">{selectedEmail.body_text || "Kein Inhalt"}</pre>
              )}
            </ScrollArea>
            <div className="p-3 border-t flex gap-2">
              <Button size="sm" className="gap-1.5">
                <Send className="h-3.5 w-3.5" />
                Antworten
              </Button>
              <Button variant="outline" size="sm">Weiterleiten</Button>
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
    </div>
  );
};
