import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { MessageSquare, User } from "lucide-react";

interface ForumPost {
  id: string;
  title: string;
  content: string;
  created_at: string;
  author_id: string;
  building_id: string;
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
      const { data, error } = await supabase
        .from("forum_posts")
        .select("*")
        .eq("management_mode", "rent")
        .eq("building_id", profile?.user_id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setPosts(data || []);
    } catch (error) {
      console.error("Error fetching forum posts:", error);
      toast({
        title: "Fehler",
        description: "Forum-Beiträge konnten nicht geladen werden.",
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
        <h1 className="text-4xl font-bold tracking-tight">Forum</h1>
        <p className="text-lg text-muted-foreground">
          Lesen Sie Beiträge von der Hausverwaltung und anderen Mietern
        </p>
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
          <p className="text-sm text-orange-800">
            <strong>Hinweis:</strong> Als Mieter können Sie Forum-Beiträge nur lesen. 
            Neue Beiträge können nur von Administratoren erstellt werden.
          </p>
        </div>
      </div>

      {/* Forum Posts */}
      <div className="space-y-4">
        {posts.length === 0 ? (
          <Card>
            <CardContent className="text-center py-8">
              <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">Noch keine Forum-Beiträge vorhanden.</p>
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
                    Forum
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="prose prose-sm max-w-none">
                  {post.content.split('\n').map((paragraph, index) => (
                    <p key={index} className="mb-3 last:mb-0">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};