import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useManagementMode } from "@/hooks/useManagementMode";
import { MessageSquare, Plus, User, Calendar, Building2 } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Building {
  id: string;
  name: string;
  address: string;
}

interface ForumPost {
  id: string;
  title: string;
  content: string;
  author_id: string;
  building_id: string;
  management_mode: string;
  created_at: string;
  buildings?: Building;
}

export const Forum = () => {
  const { profile } = useAuth();
  const { managementMode } = useManagementMode();
  const [isCreating, setIsCreating] = useState(false);
  const [newPost, setNewPost] = useState({ title: "", content: "", building_id: "" });
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);

  const canCreatePosts = profile?.role === 'admin';

  useEffect(() => {
    fetchPosts();
    if (canCreatePosts) {
      fetchBuildings();
    }
  }, [managementMode, canCreatePosts]);

  const fetchBuildings = async () => {
    try {
      const { data, error } = await supabase
        .from('buildings')
        .select('id, name, address')
        .eq('management_mode', managementMode)
        .order('name');

      if (error) throw error;
      setBuildings(data || []);
    } catch (error) {
      console.error('Error fetching buildings:', error);
    }
  };

  const fetchPosts = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('forum_posts')
        .select(`
          *,
          buildings:building_id (
            id,
            name,
            address
          )
        `)
        .eq('management_mode', managementMode)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPosts(data || []);
    } catch (error) {
      console.error('Error fetching posts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePost = async () => {
    if (!newPost.title || !newPost.content || !newPost.building_id) {
      toast.error('Bitte füllen Sie alle Felder aus');
      return;
    }
    
    try {
      const { data, error } = await supabase
        .from('forum_posts')
        .insert({
          title: newPost.title,
          content: newPost.content,
          building_id: newPost.building_id,
          management_mode: managementMode,
          author_id: profile?.user_id
        })
        .select(`
          *,
          buildings:building_id (
            id,
            name,
            address
          )
        `)
        .single();

      if (error) throw error;

      setPosts([data, ...posts]);
      setNewPost({ title: "", content: "", building_id: "" });
      setIsCreating(false);
      toast.success('Beitrag erfolgreich erstellt');
    } catch (error) {
      console.error('Error creating post:', error);
      toast.error('Fehler beim Erstellen des Beitrags');
    }
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
              <Label htmlFor="building">Gebäude auswählen</Label>
              <Select value={newPost.building_id} onValueChange={(value) => setNewPost({ ...newPost, building_id: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Gebäude auswählen" />
                </SelectTrigger>
                <SelectContent>
                  {buildings.map((building) => (
                    <SelectItem key={building.id} value={building.id}>
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4" />
                        {building.name} - {building.address}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="title">Titel</Label>
              <Input
                id="title"
                placeholder="Titel des Beitrags"
                value={newPost.title}
                onChange={(e) => setNewPost({ ...newPost, title: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="content">Inhalt</Label>
              <Textarea
                id="content"
                placeholder="Inhalt des Beitrags"
                rows={6}
                value={newPost.content}
                onChange={(e) => setNewPost({ ...newPost, content: e.target.value })}
              />
            </div>
            <div className="flex gap-3">
              <Button 
                onClick={handleCreatePost} 
                disabled={!newPost.title || !newPost.content || !newPost.building_id}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
              >
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
          <Button onClick={() => setIsCreating(true)} className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground">
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
        {loading ? (
          <div className="text-center py-8">Laden...</div>
        ) : posts.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <MessageSquare className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Keine Forenbeiträge vorhanden</h3>
              <p className="text-muted-foreground mb-4">
                Es wurden noch keine Beiträge im Forum erstellt.
              </p>
              {canCreatePosts && (
                <Button onClick={() => setIsCreating(true)} className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground">
                  <Plus className="w-4 h-4" />
                  Ersten Beitrag erstellen
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          posts.map((post) => (
            <Card key={post.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <CardTitle className="text-xl">{post.title}</CardTitle>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <User className="w-4 h-4" />
                        Verwaltung
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        {new Date(post.created_at).toLocaleDateString('de-DE')}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="flex items-center gap-1">
                      <Building2 className="w-3 h-3" />
                      {post.buildings?.name || 'Unbekannt'}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground whitespace-pre-wrap">{post.content}</p>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};