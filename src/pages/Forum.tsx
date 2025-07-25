import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { MessageSquare, Plus, User, Calendar } from "lucide-react";
import { useState } from "react";

export const Forum = () => {
  const { profile } = useAuth();
  const [isCreating, setIsCreating] = useState(false);
  const [newPost, setNewPost] = useState({ title: "", content: "" });

  const canCreatePosts = profile?.role === 'admin';

  const mockPosts = [
    {
      id: "1",
      title: "Neue Hausordnung ab Februar 2024",
      content: "Bitte beachten Sie die aktualisierten Regelungen bezüglich der Müllentsorgung und Ruhezeiten.",
      author: "Admin",
      created_at: "2024-01-20T14:30:00Z",
      building: "Musterstraße 123",
      management_mode: "weg"
    },
    {
      id: "2", 
      title: "Heizungsmodernisierung im Frühjahr",
      content: "Die geplante Heizungsmodernisierung wird voraussichtlich im März beginnen. Weitere Details folgen.",
      author: "Verwaltung",
      created_at: "2024-01-18T10:00:00Z",
      building: "Alle Gebäude",
      management_mode: "weg"
    }
  ];

  const handleCreatePost = () => {
    if (!newPost.title || !newPost.content) return;
    
    // TODO: Implement Supabase insert
    console.log("Creating post:", newPost);
    setNewPost({ title: "", content: "" });
    setIsCreating(false);
  };

  if (isCreating && canCreatePosts) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Neuen Forenbeitrag erstellen</h1>
          <Button variant="outline" onClick={() => setIsCreating(false)}>
            Abbrechen
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Beitrag erstellen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Input
                placeholder="Titel des Beitrags"
                value={newPost.title}
                onChange={(e) => setNewPost({ ...newPost, title: e.target.value })}
              />
            </div>
            <div>
              <Textarea
                placeholder="Inhalt des Beitrags"
                rows={6}
                value={newPost.content}
                onChange={(e) => setNewPost({ ...newPost, content: e.target.value })}
              />
            </div>
            <div className="flex gap-3">
              <Button onClick={handleCreatePost} disabled={!newPost.title || !newPost.content}>
                <Plus className="w-4 h-4 mr-2" />
                Beitrag veröffentlichen
              </Button>
              <Button variant="outline" onClick={() => setIsCreating(false)}>
                Abbrechen
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Forum</h1>
        {canCreatePosts && (
          <Button onClick={() => setIsCreating(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            Neuer Beitrag
          </Button>
        )}
      </div>

      {!canCreatePosts && profile?.role === 'weg_owner' && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <MessageSquare className="w-5 h-5 text-amber-600" />
              <p className="text-sm text-amber-800">
                WEG-Eigentümer haben keinen Zugriff auf das Forum. Für Fragen wenden Sie sich bitte direkt an die Verwaltung.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {profile?.role === 'tenant' && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <MessageSquare className="w-5 h-5 text-blue-600" />
              <p className="text-sm text-blue-800">
                Als Mieter können Sie Forenbeiträge lesen, aber nicht selbst erstellen.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {mockPosts.map((post) => (
          <Card key={post.id} className="hover:shadow-md transition-shadow">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <CardTitle className="text-xl">{post.title}</CardTitle>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <User className="w-4 h-4" />
                      {post.author}
                    </div>
                    <div className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      {new Date(post.created_at).toLocaleDateString('de-DE')}
                    </div>
                  </div>
                </div>
                <Badge variant="secondary">{post.building}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">{post.content}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {mockPosts.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <MessageSquare className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Keine Forenbeiträge vorhanden</h3>
            <p className="text-muted-foreground mb-4">
              Es wurden noch keine Beiträge im Forum erstellt.
            </p>
            {canCreatePosts && (
              <Button onClick={() => setIsCreating(true)} className="gap-2">
                <Plus className="w-4 h-4" />
                Ersten Beitrag erstellen
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};