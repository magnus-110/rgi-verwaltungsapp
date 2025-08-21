import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/useAuth";
import { useManagementMode } from "@/hooks/useManagementMode";
import { MessageSquare, Plus, User, Calendar, Building2, Trash2, FileText, Download } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FileUpload } from "@/components/FileUpload";

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
  attachments?: { name: string; path: string; size: number; type: string }[];
  buildings?: Building;
}

interface Template {
  id: string;
  title: string;
  content: string;
  management_mode: string;
}

export const Forum = () => {
  const { profile } = useAuth();
  const { managementMode } = useManagementMode();
  const [isCreating, setIsCreating] = useState(false);
  const [newPost, setNewPost] = useState({ title: "", content: "", building_id: "", template_id: "" });
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [attachments, setAttachments] = useState<{ name: string; path: string; size: number; type: string }[]>([]);
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ title: "", content: "" });

  const canCreatePosts = profile?.role === 'admin';

  useEffect(() => {
    fetchPosts();
    if (canCreatePosts) {
      fetchBuildings();
      fetchTemplates();
    }
  }, [managementMode, canCreatePosts]);

  const fetchTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('forum_post_templates')
        .select('*')
        .eq('management_mode', managementMode)
        .order('title');

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error('Error fetching templates:', error);
    }
  };

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
      
      // Parse attachments if they are stored as strings  
      const processedData = (data as any)?.map((post: any) => ({
        ...post,
        attachments: typeof post.attachments === 'string' 
          ? JSON.parse(post.attachments || '[]') 
          : post.attachments || []
      })) || [];
      
      setPosts(processedData);
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
          author_id: profile?.user_id,
          attachments: attachments
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

      // Process the returned data to ensure attachments are properly typed
      const processedPost: ForumPost = {
        ...data,
        attachments: Array.isArray(data.attachments) ? data.attachments as { name: string; path: string; size: number; type: string }[] : []
      };

      setPosts([processedPost, ...posts]);
      setNewPost({ title: "", content: "", building_id: "", template_id: "" });
      setAttachments([]);
      setIsCreating(false);
      toast.success('Beitrag erfolgreich erstellt');
    } catch (error) {
      console.error('Error creating post:', error);
      toast.error('Fehler beim Erstellen des Beitrags');
    }
  };

  const handleDeletePost = async (postId: string) => {
    try {
      const { error } = await supabase
        .from('forum_posts')
        .delete()
        .eq('id', postId);

      if (error) throw error;

      setPosts(posts.filter(post => post.id !== postId));
      toast.success('Beitrag erfolgreich gelöscht');
    } catch (error) {
      console.error('Error deleting post:', error);
      toast.error('Fehler beim Löschen des Beitrags');
    }
  };

  const handleTemplateSelect = (templateId: string) => {
    const template = templates.find(t => t.id === templateId);
    if (template) {
      setNewPost({ 
        ...newPost, 
        title: template.title, 
        content: template.content, 
        template_id: templateId 
      });
    }
  };

  const handleCreateTemplate = async () => {
    if (!newTemplate.title || !newTemplate.content) {
      toast.error('Bitte füllen Sie alle Felder aus');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('forum_post_templates')
        .insert({
          title: newTemplate.title,
          content: newTemplate.content,
          management_mode: managementMode
        })
        .select()
        .single();

      if (error) throw error;

      setTemplates([...templates, data]);
      setNewTemplate({ title: "", content: "" });
      setIsTemplateDialogOpen(false);
      toast.success('Vorlage erfolgreich erstellt');
    } catch (error) {
      console.error('Error creating template:', error);
      toast.error('Fehler beim Erstellen der Vorlage');
    }
  };

  const renderAttachments = (attachments?: { name: string; path: string; size: number; type: string }[]) => {
    if (!attachments || attachments.length === 0) return null;

    return (
      <div className="mt-4">
        <p className="text-sm font-medium mb-2">Anhänge:</p>
        <div className="flex flex-wrap gap-2">
          {attachments.map((attachment, index) => (
            <Button
              key={index}
              variant="outline"
              size="sm"
              onClick={() => {
                // Generate signed URL for download
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
              {attachment.type.startsWith('image/') ? (
                <FileText className="h-3 w-3 mr-1" />
              ) : (
                <Download className="h-3 w-3 mr-1" />
              )}
              {attachment.name}
            </Button>
          ))}
        </div>
      </div>
    );
  };

  if (isCreating && canCreatePosts) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Neuen Schwarzes Brett-Beitrag erstellen</h1>
          <div className="flex gap-2">
            <Dialog open={isTemplateDialogOpen} onOpenChange={setIsTemplateDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Plus className="h-4 w-4 mr-2" />
                  Neue Vorlage
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Neue Vorlage erstellen</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="template-title">Titel</Label>
                    <Input
                      id="template-title"
                      value={newTemplate.title}
                      onChange={(e) => setNewTemplate({ ...newTemplate, title: e.target.value })}
                      placeholder="Vorlagen-Titel"
                    />
                  </div>
                  <div>
                    <Label htmlFor="template-content">Inhalt</Label>
                    <Textarea
                      id="template-content"
                      value={newTemplate.content}
                      onChange={(e) => setNewTemplate({ ...newTemplate, content: e.target.value })}
                      placeholder="Vorlagen-Inhalt (verwenden Sie [Platzhalter] für variable Inhalte)"
                      rows={8}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleCreateTemplate} disabled={!newTemplate.title || !newTemplate.content}>
                      Vorlage erstellen
                    </Button>
                    <Button variant="outline" onClick={() => setIsTemplateDialogOpen(false)}>
                      Abbrechen
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <Button variant="outline" onClick={() => setIsCreating(false)}>
              Abbrechen
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Beitrag erstellen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {templates.length > 0 && (
              <div>
                <Label htmlFor="template">Vorlage verwenden (optional)</Label>
                <Select value={newPost.template_id} onValueChange={handleTemplateSelect}>
                  <SelectTrigger>
                    <SelectValue placeholder="Vorlage auswählen..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Keine Vorlage</SelectItem>
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
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
            <div>
              <Label>Anhänge (optional)</Label>
              <FileUpload
                onFilesChange={setAttachments}
                maxFiles={5}
                bucketName="forum-attachments"
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
        <h1 className="text-3xl font-bold">Schwarzes Brett</h1>
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
                WEG-Eigentümer haben keinen Zugriff auf das Schwarze Brett. Für Fragen wenden Sie sich bitte direkt an die Verwaltung.
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
                Als Mieter können Sie Beiträge vom Schwarzen Brett lesen, aber nicht selbst erstellen.
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
              <h3 className="text-lg font-semibold mb-2">Keine Beiträge vorhanden</h3>
              <p className="text-muted-foreground mb-4">
                Es wurden noch keine Beiträge im Schwarzen Brett erstellt.
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
                    {canCreatePosts && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Beitrag löschen</AlertDialogTitle>
                            <AlertDialogDescription>
                              Sind Sie sicher, dass Sie diesen Beitrag löschen möchten? Diese Aktion kann nicht rückgängig gemacht werden.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDeletePost(post.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Löschen
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground whitespace-pre-wrap">{post.content}</p>
                {renderAttachments(post.attachments)}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};