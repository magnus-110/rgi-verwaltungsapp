import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { MessageSquare, User, FileText, Calendar } from "lucide-react";
import { format } from "date-fns";

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
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-4 py-8">
          <h1 className="text-4xl font-light text-foreground">Schwarzes Brett</h1>
          <p className="text-lg text-muted-foreground">
            Nachrichten und Ankündigungen
          </p>
        </div>

        {/* Posts */}
        {posts.length === 0 ? (
          <Card className="border-0 shadow-sm bg-white">
            <CardContent className="p-8 text-center">
              <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">Keine Beiträge vorhanden</h3>
              <p className="text-muted-foreground">
                Es gibt noch keine Schwarzes Brett-Beiträge.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {posts.map((post) => (
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
        )}
      </div>
    </div>
  );
};