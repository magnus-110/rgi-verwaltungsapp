import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Building, MessageSquare, Calendar, FileText } from "lucide-react";
import { format } from "date-fns";

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
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Schwarzes Brett</h1>
          <p className="text-muted-foreground">
            Beiträge aus dem Schwarzen Brett Ihrer verwalteten Gebäude
          </p>
        </div>

        {buildings.length > 1 && (
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setSelectedBuilding("all")}
              className={`px-3 py-1 rounded-md text-sm ${
                selectedBuilding === "all"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-muted-foreground/10"
              }`}
            >
              Alle Gebäude
            </button>
            {buildings.map((building) => (
              <button
                key={building.id}
                onClick={() => setSelectedBuilding(building.id)}
                className={`px-3 py-1 rounded-md text-sm ${
                  selectedBuilding === building.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted hover:bg-muted-foreground/10"
                }`}
              >
                {building.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {buildings.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <div className="text-center">
              <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Keine Gebäude zugewiesen</h3>
              <p className="text-muted-foreground">
                Sie sind noch keinem Gebäude als WEG-Eigentümer zugeordnet.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : filteredPosts.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <div className="text-center">
              <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Keine Beiträge gefunden</h3>
              <p className="text-muted-foreground">
                Es gibt noch keine Schwarzes Brett-Beiträge für die ausgewählten Gebäude.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedPosts).map(([buildingId, buildingPosts]) => {
            const building = buildings.find(b => b.id === buildingId);
            if (!building) return null;

            return (
              <div key={buildingId} className="space-y-4">
                <div className="flex items-center gap-2">
                  <Building className="h-5 w-5 text-primary" />
                  <h2 className="text-xl font-semibold">{building.name}</h2>
                  <Badge variant="outline">{buildingPosts.length} Beiträge</Badge>
                </div>

                <div className="space-y-4">
                  {buildingPosts.map((post) => (
                    <Card key={post.id}>
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <CardTitle className="text-lg">{post.title}</CardTitle>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Calendar className="h-4 w-4" />
                            {format(new Date(post.created_at), 'dd.MM.yyyy HH:mm')}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="prose prose-sm max-w-none">
                          <p className="whitespace-pre-wrap">{post.content}</p>
                        </div>
                        {/* Render attachments if available */}
                        {post.attachments && post.attachments.length > 0 && (
                          <div className="mt-4">
                            <p className="text-sm font-medium mb-2">Anhänge:</p>
                            <div className="flex flex-wrap gap-2">
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
                                  className="h-8 text-xs"
                                >
                                  <FileText className="h-3 w-3 mr-1" />
                                  {attachment.name}
                                </Button>
                              ))}
                            </div>
                          </div>
                        )}
                        <Separator className="my-4" />
                        <div className="flex items-center justify-between text-sm text-muted-foreground">
                          <span>Verfasst von Administrator</span>
                          <span>{building.address}</span>
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
  );
};