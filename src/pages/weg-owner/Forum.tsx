import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { MessageSquare, FileText, Building2 } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { EmergencyContactsWidget } from "@/components/forum/EmergencyContactsWidget";
import { cn } from "@/lib/utils";

interface Building {
  id: string;
  name: string;
  address: string;
}

interface ForumPost {
  id: string;
  title: string;
  content: string;
  created_at: string;
  author_id: string;
  building_id: string;
  building?: Building;
  attachments?: { name: string; path: string; size: number; type: string }[];
}

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <h2 className="font-display text-[11px] font-semibold uppercase tracking-[0.6px] text-muted-foreground/80 px-1 mb-2">
    {children}
  </h2>
);

export const WegOwnerForum = () => {
  const { user } = useAuth();
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBuilding, setSelectedBuilding] = useState<string>("all");

  useEffect(() => {
    const fetchForumPosts = async () => {
      if (!user) return;
      try {
        const { data: userBuildings, error: buildingsError } = await supabase
          .from('weg_owner_buildings')
          .select(`building_id, buildings:building_id ( id, name, address )`)
          .eq('user_id', user.id);

        if (buildingsError) {
          console.error('Error fetching buildings:', buildingsError);
          return;
        }

        const buildingsList = (userBuildings?.map(ub => ub.buildings).filter(Boolean) || []) as Building[];
        setBuildings(buildingsList);

        const buildingIds = buildingsList.map(b => b.id);
        if (buildingIds.length === 0) {
          setLoading(false);
          return;
        }

        const { data: forumPosts, error: postsError } = await supabase
          .from('forum_posts')
          .select(`id, title, content, created_at, author_id, building_id, attachments, buildings:building_id ( id, name, address )`)
          .in('building_id', buildingIds)
          .order('created_at', { ascending: false });

        if (postsError) {
          console.error('Error fetching posts:', postsError);
          return;
        }

        const processedPosts = (forumPosts as any)?.map((post: any) => ({
          ...post,
          attachments: typeof post.attachments === 'string'
            ? JSON.parse(post.attachments || '[]')
            : post.attachments || []
        })) || [];

        setPosts(processedPosts);
      } catch (error) {
        console.error('Error:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchForumPosts();
  }, [user]);

  const filteredPosts = selectedBuilding === "all"
    ? posts
    : posts.filter(post => post.building_id === selectedBuilding);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-base text-muted-foreground">Laden...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-xl md:max-w-2xl mx-auto px-4 py-5 space-y-5">
        {/* Header */}
        <div className="space-y-2 pt-1">
          <h1 className="font-display text-2xl font-semibold text-foreground leading-tight tracking-tight">
            Schwarzes Brett
          </h1>
          <p className="text-[13px] text-muted-foreground">
            Nachrichten und Ankündigungen Ihrer Verwaltung
          </p>
        </div>

        {/* Building filter chips */}
        {buildings.length > 1 && (
          <div className="flex gap-2 flex-wrap">
            <FilterChip active={selectedBuilding === "all"} onClick={() => setSelectedBuilding("all")}>
              Alle Gebäude
            </FilterChip>
            {buildings.map((b) => (
              <FilterChip key={b.id} active={selectedBuilding === b.id} onClick={() => setSelectedBuilding(b.id)}>
                {b.name}
              </FilterChip>
            ))}
          </div>
        )}

        {/* Posts */}
        <section>
          <SectionLabel>Beiträge</SectionLabel>
          {buildings.length === 0 ? (
            <EmptyState
              title="Keine Gebäude zugewiesen"
              subtitle="Sie sind noch keinem Gebäude als WEG-Eigentümer zugeordnet."
            />
          ) : filteredPosts.length === 0 ? (
            <EmptyState
              title="Keine Beiträge"
              subtitle="Es gibt noch keine Beiträge für die ausgewählten Gebäude."
            />
          ) : (
            <div className="space-y-3">
              {filteredPosts.map((post) => {
                const building = buildings.find(b => b.id === post.building_id);
                return (
                  <article key={post.id} className="rounded-[14px] border border-border/60 bg-card shadow-sm overflow-hidden">
                    <div className="px-4 py-3.5">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="min-w-0 flex-1">
                          <h3 className="font-display text-[15px] font-semibold text-foreground tracking-tight leading-tight">
                            {post.title}
                          </h3>
                          <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground mt-1">
                            <span>{format(new Date(post.created_at), "dd. MMMM yyyy", { locale: de })}</span>
                            {building && buildings.length > 1 && (
                              <>
                                <span className="text-muted-foreground/40">·</span>
                                <Building2 className="h-3 w-3" />
                                <span className="truncate">{building.name}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <p className="text-[14px] text-foreground/85 whitespace-pre-wrap leading-relaxed">
                        {post.content}
                      </p>
                    </div>

                    {post.attachments && post.attachments.length > 0 && (
                      <>
                        <div className="h-px bg-foreground/[0.055]" />
                        <div className="px-4 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.5px] text-muted-foreground/80 mb-2">
                            Anhänge
                          </p>
                          <div className="space-y-1.5">
                            {post.attachments.map((attachment: any, index: number) => (
                              <button
                                key={index}
                                onClick={() => {
                                  supabase.storage
                                    .from('forum-attachments')
                                    .createSignedUrl(attachment.path, 3600)
                                    .then(({ data }) => {
                                      if (data?.signedUrl) window.open(data.signedUrl, '_blank');
                                    });
                                }}
                                className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-foreground transition-colors hover:bg-muted/60 text-left"
                              >
                                <div className="h-8 w-8 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center">
                                  <FileText className="h-4 w-4 text-primary" />
                                </div>
                                <span className="truncate flex-1">{attachment.name}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* Notfallkontakte unten */}
        {buildings.length > 0 && (
          <section>
            <SectionLabel>Notfallkontakte</SectionLabel>
            <EmergencyContactsWidget buildingIds={buildings.map((b) => b.id)} />
          </section>
        )}
      </div>
    </div>
  );
};

const FilterChip = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button
    onClick={onClick}
    className={cn(
      "h-8 px-3 rounded-full text-[12px] font-medium transition-colors border",
      active
        ? "bg-primary text-primary-foreground border-primary"
        : "bg-card text-foreground border-border/60 hover:bg-muted/60"
    )}
  >
    {children}
  </button>
);

const EmptyState = ({ title, subtitle }: { title: string; subtitle: string }) => (
  <div className="rounded-[14px] border border-border/60 bg-card shadow-sm p-8 text-center">
    <div className="mx-auto h-12 w-12 rounded-xl bg-muted flex items-center justify-center mb-3">
      <MessageSquare className="h-6 w-6 text-muted-foreground" />
    </div>
    <p className="font-display text-[15px] font-semibold text-foreground mb-1">{title}</p>
    <p className="text-[13px] text-muted-foreground">{subtitle}</p>
  </div>
);
