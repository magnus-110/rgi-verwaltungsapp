import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Building, MessageSquare, Calendar, FileText } from "lucide-react";
import { format } from "date-fns";
import { EmergencyContactsWidget } from "@/components/forum/EmergencyContactsWidget";

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
        // Fetch buildings where the user is a WEG owner
        const { data: userBuildings, error: buildingsError } = await supabase
          .from('weg_owner_buildings')
          .select(`
            building_id,
            buildings:building_id (
              id,
              name,
              address
            )
          `)
          .eq('user_id', user.id);

        if (buildingsError) {
          console.error('Error fetching buildings:', buildingsError);
          return;
        }

        const buildingsList = userBuildings?.map(ub => ub.buildings).filter(Boolean) || [];
        setBuildings(buildingsList);

        const buildingIds = buildingsList.map(b => b.id);

        if (buildingIds.length === 0) {
          setLoading(false);
          return;
        }

        // Fetch forum posts for these buildings
        const { data: forumPosts, error: postsError } = await supabase
          .from('forum_posts')
          .select(`
            id,
            title,
            content,
            created_at,
            author_id,
            building_id,
            attachments,
            buildings:building_id (
              id,
              name,
              address
            )
          `)
          .in('building_id', buildingIds)
          .order('created_at', { ascending: false });

        if (postsError) {
          console.error('Error fetching posts:', postsError);
          return;
        }

        // Parse attachments if they are stored as strings
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

  const groupedPosts = filteredPosts.reduce((acc, post) => {
    const buildingId = post.building_id;
    if (!acc[buildingId]) {
      acc[buildingId] = [];
    }
    acc[buildingId].push(post);
    return acc;
  }, {} as Record<string, ForumPost[]>);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Laden...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-4 py-8">
          <h1 className="text-4xl font-light text-foreground">Schwarzes Brett</h1>
          <p className="text-lg text-muted-foreground">
            Nachrichten und Ankündigungen
          </p>
        </div>

        {/* Notfall- & Wichtige Kontakte ganz oben */}
        {buildings.length > 0 && (
          <EmergencyContactsWidget buildingIds={buildings.map((b) => b.id)} />
        )}

        {/* Gebäude-Filter */}
        <div className="text-center space-y-4">
          {buildings.length > 1 && (
            <div className="flex gap-2 flex-wrap justify-center">
              <Button
                variant={selectedBuilding === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedBuilding("all")}
              >
                Alle Gebäude
              </Button>
              {buildings.map((building) => (
                <Button
                  key={building.id}
                  variant={selectedBuilding === building.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedBuilding(building.id)}
                >
                  {building.name}
                </Button>
              ))}
            </div>
          )}
        </div>
            <div className="flex gap-2 flex-wrap justify-center mt-6">
              <Button
                variant={selectedBuilding === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedBuilding("all")}
              >
                Alle Gebäude
              </Button>
              {buildings.map((building) => (
                <Button
                  key={building.id}
                  variant={selectedBuilding === building.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedBuilding(building.id)}
                >
                  {building.name}
                </Button>
              ))}
            </div>
          )}
        </div>

        {buildings.length === 0 ? (
          <Card className="border-0 shadow-sm bg-white">
            <CardContent className="p-8 text-center">
              <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">Keine Gebäude zugewiesen</h3>
              <p className="text-muted-foreground">
                Sie sind noch keinem Gebäude als WEG-Eigentümer zugeordnet.
              </p>
            </CardContent>
          </Card>
        ) : filteredPosts.length === 0 ? (
          <Card className="border-0 shadow-sm bg-white">
            <CardContent className="p-8 text-center">
              <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">Keine Beiträge vorhanden</h3>
              <p className="text-muted-foreground">
                Es gibt noch keine Schwarzes Brett-Beiträge für die ausgewählten Gebäude.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedPosts).map(([buildingId, buildingPosts]) => {
              const building = buildings.find(b => b.id === buildingId);
              if (!building) return null;

              return (
                <div key={buildingId} className="space-y-4">
                  {buildings.length > 1 && selectedBuilding === "all" && (
                    <div className="text-center">
                      <h2 className="text-xl font-medium text-foreground">{building.name}</h2>
                      <p className="text-sm text-muted-foreground">{building.address}</p>
                    </div>
                  )}

                  <div className="space-y-4">
                    {buildingPosts.map((post) => (
                      <Card key={post.id} className="border-0 shadow-sm bg-white">
                        <CardContent className="p-6">
                          <div className="space-y-4">
                            <div className="text-left">
                              <h3 className="text-lg font-medium text-foreground text-left">{post.title}</h3>
                              <p className="text-sm text-muted-foreground text-left">
                                {format(new Date(post.created_at), 'dd.MM.yyyy HH:mm')}
                              </p>
                            </div>
                            
                            <div className="text-left">
                              <p className="text-muted-foreground whitespace-pre-wrap text-left">{post.content}</p>
                            </div>
                            
                            {post.attachments && post.attachments.length > 0 && (
                              <div className="text-center space-y-2">
                                <p className="text-sm font-medium">Anhänge:</p>
                                <div className="flex flex-wrap gap-2 justify-center">
                                  {post.attachments.map((attachment: any, index: number) => (
                                    <Button
                                      key={index}
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        supabase.storage
                                          .from('forum-attachments')
                                          .createSignedUrl(attachment.path, 3600)
                                          .then(({ data }) => {
                                            if (data?.signedUrl) {
                                              window.open(data.signedUrl, '_blank');
                                            }
                                          });
                                      }}
                                    >
                                      <FileText className="h-3 w-3 mr-1" />
                                      {attachment.name}
                                    </Button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};