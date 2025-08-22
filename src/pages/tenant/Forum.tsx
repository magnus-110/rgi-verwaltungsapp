import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { MessageSquare, User, FileText } from "lucide-react";

interface ForumPost {
  id: string;
  title: string;
  content: string;
  created_at: string;
  author_id: string;
  building_id: string;
  attachments?: { name: string; path: string; size: number; type: string }[];
}

export const TenantForum = () => {
  const { profile } = useAuth();
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile) {
      fetchPosts();
    }
  }, [profile]);

  const fetchPosts = async () => {
    try {
      let buildingId = null;
      
      // First try to get building_id from profile
      if ((profile as any)?.building_id) {
        buildingId = (profile as any).building_id;
      } else {
        // Fallback: get building_id from tenants table
        const { data: tenantData, error: tenantError } = await supabase
          .from("tenants")
          .select("building_id")
          .eq("user_id", profile?.user_id)
          .maybeSingle();
          
        if (!tenantError && tenantData) {
          buildingId = tenantData.building_id;
        }
      }
      
      if (!buildingId) {
        setPosts([]);
        return;
      }

      const { data, error } = await supabase
        .from("forum_posts")
        .select("*")
        .eq("management_mode", "rent")
        .eq("building_id", buildingId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      // Parse attachments if they are stored as strings
      const processedData = (data as any)?.map((post: any) => ({
        ...post,
        attachments: typeof post.attachments === 'string' 
          ? JSON.parse(post.attachments || '[]') 
          : post.attachments || []
      })) || [];
      
      setPosts(processedData);
    } catch (error) {
      console.error("Error fetching forum posts:", error);
      toast({
        title: "Fehler",
        description: "Schwarzes Brett-Beiträge konnten nicht geladen werden.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Laden...</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-4xl font-bold tracking-tight">Schwarzes Brett</h1>
        <p className="text-lg text-muted-foreground">
          Lesen Sie Beiträge von der Hausverwaltung
        </p>
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
          <p className="text-sm text-orange-800">
            <strong>Hinweis:</strong> Als Mieter können Sie Schwarzes Brett-Beiträge nur lesen. 
            Neue Beiträge können nur von Administratoren erstellt werden.
          </p>
        </div>
      </div>

      {/* Posts */}
      <div className="space-y-4">
        {posts.length === 0 ? (
          <Card>
            <CardContent className="text-center py-8">
              <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">Noch keine Beiträge vorhanden.</p>
            </CardContent>
          </Card>
        ) : (
          posts.map((post) => (
            <Card key={post.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-xl">{post.title}</CardTitle>
                    <CardDescription className="mt-2 flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Hausverwaltung • {new Date(post.created_at).toLocaleDateString('de-DE')}
                    </CardDescription>
                  </div>
                  <Badge variant="outline">
                    <MessageSquare className="h-3 w-3 mr-1" />
                    Schwarzes Brett
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="max-w-none text-left">
                  {post.content.split('\n').map((paragraph, index) => (
                    <p key={index} className="mb-3 last:mb-0 text-left">
                      {paragraph}
                    </p>
                  ))}
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
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};