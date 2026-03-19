import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/useAuth";
import { useManagementMode } from "@/hooks/useManagementMode";
import { Plus, Trash2, Download, Edit, Newspaper } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FileUpload } from "@/components/FileUpload";

interface ForumPost {
  id: string;
  title: string;
  content: string;
  author_id: string;
  building_id: string;
  management_mode: string;
  created_at: string;
  attachments?: { name: string; path: string; size: number; type: string }[];
}

interface BuildingForumTabProps {
  buildingId: string;
  managementMode: "weg" | "rent";
}

export const BuildingForumTab = ({ buildingId, managementMode }: BuildingForumTabProps) => {
  const { profile } = useAuth();
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newPost, setNewPost] = useState({ title: "", content: "" });
  const [attachments, setAttachments] = useState<{ name: string; path: string; size: number; type: string }[]>([]);
  const [editingPost, setEditingPost] = useState<ForumPost | null>(null);
  const [editAttachments, setEditAttachments] = useState<{ name: string; path: string; size: number; type: string }[]>([]);

  const canCreatePosts = profile?.role === 'admin';
  const canEditPosts = profile?.role === 'admin' || profile?.role === 'employee';

  useEffect(() => {
    fetchPosts();
  }, [buildingId, managementMode]);

  const fetchPosts = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('forum_posts')
        .select('*')
        .eq('building_id', buildingId)
        .eq('management_mode', managementMode)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPosts((data || []).map((post: any) => ({
        ...post,
        attachments: typeof post.attachments === 'string'
          ? JSON.parse(post.attachments || '[]')
          : post.attachments || [],
      })));
    } catch (error) {
      console.error('Error fetching posts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePost = async () => {
    if (!newPost.title || !newPost.content) {
      toast.error('Bitte Titel und Inhalt ausfüllen');
      return;
    }
    try {
      const { error } = await supabase.from('forum_posts').insert({
        title: newPost.title,
        content: newPost.content,
        building_id: buildingId,
        management_mode: managementMode,
        author_id: profile?.user_id,
        attachments: attachments,
      });
      if (error) throw error;
      setNewPost({ title: "", content: "" });
      setAttachments([]);
      setIsCreating(false);
      toast.success('Beitrag erstellt');
      fetchPosts();
    } catch (error) {
      toast.error('Fehler beim Erstellen');
    }
  };

  const handleDeletePost = async (postId: string) => {
    try {
      const { error } = await supabase.from('forum_posts').delete().eq('id', postId);
      if (error) throw error;
      setPosts(posts.filter(p => p.id !== postId));
      toast.success('Beitrag gelöscht');
    } catch {
      toast.error('Fehler beim Löschen');
    }
  };

  const handleUpdatePost = async () => {
    if (!editingPost) return;
    try {
      const { error } = await supabase.from('forum_posts').update({
        title: editingPost.title,
        content: editingPost.content,
        attachments: editAttachments,
      }).eq('id', editingPost.id);
      if (error) throw error;
      setEditingPost(null);
      toast.success('Beitrag aktualisiert');
      fetchPosts();
    } catch {
      toast.error('Fehler beim Aktualisieren');
    }
  };

  const downloadAttachment = async (attachment: { name: string; path: string }) => {
    try {
      const { data, error } = await supabase.storage.from('forum-attachments').download(attachment.path);
      if (error) throw error;
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = attachment.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Download fehlgeschlagen');
    }
  };

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Laden...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Header with create button */}
      {canCreatePosts && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setIsCreating(true)}>
            <Plus className="h-4 w-4 mr-1" /> Neuer Beitrag
          </Button>
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={isCreating} onOpenChange={setIsCreating}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Neuer Beitrag</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input placeholder="Titel" value={newPost.title} onChange={(e) => setNewPost({ ...newPost, title: e.target.value })} />
            <Textarea placeholder="Inhalt" rows={6} value={newPost.content} onChange={(e) => setNewPost({ ...newPost, content: e.target.value })} />
            <FileUpload
              bucketName="forum-attachments"
              onFilesChange={(files) => setAttachments(files)}
            />
            {attachments.length > 0 && (
              <div className="space-y-1">
                {attachments.map((a, i) => (
                  <div key={i} className="flex items-center justify-between text-xs bg-muted p-2 rounded">
                    <span className="truncate">{a.name}</span>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setAttachments(attachments.filter((_, j) => j !== i))}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <Button onClick={handleCreatePost} className="w-full">Veröffentlichen</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Posts list */}
      {posts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="p-3 bg-muted rounded-xl mb-4">
            <Newspaper className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="font-semibold text-lg mb-1">Keine Beiträge</h3>
          <p className="text-sm text-muted-foreground">Noch keine Beiträge für dieses Gebäude.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <Card key={post.id} className="shadow-sm">
              <CardContent className="p-4">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium">{post.title}</h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(post.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                    {canEditPosts && (
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { setEditingPost({ ...post }); setEditAttachments(post.attachments || []); }}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {canCreatePosts && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Beitrag löschen?</AlertDialogTitle>
                            <AlertDialogDescription>Diese Aktion kann nicht rückgängig gemacht werden.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDeletePost(post.id)} className="bg-destructive text-destructive-foreground">Löschen</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{post.content}</p>
                {post.attachments && post.attachments.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {post.attachments.map((a, i) => (
                      <Button key={i} variant="outline" size="sm" className="h-7 text-xs" onClick={() => downloadAttachment(a)}>
                        <Download className="h-3 w-3 mr-1" /> {a.name}
                      </Button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit dialog */}
      <Dialog open={!!editingPost} onOpenChange={(open) => { if (!open) setEditingPost(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Beitrag bearbeiten</DialogTitle>
          </DialogHeader>
          {editingPost && (
            <div className="space-y-4">
              <Input value={editingPost.title} onChange={(e) => setEditingPost({ ...editingPost, title: e.target.value })} />
              <Textarea rows={6} value={editingPost.content} onChange={(e) => setEditingPost({ ...editingPost, content: e.target.value })} />
              <FileUpload
                bucketName="forum-attachments"
                onUploadComplete={(fileData) => setEditAttachments([...editAttachments, fileData])}
              />
              {editAttachments.length > 0 && (
                <div className="space-y-1">
                  {editAttachments.map((a, i) => (
                    <div key={i} className="flex items-center justify-between text-xs bg-muted p-2 rounded">
                      <span className="truncate">{a.name}</span>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setEditAttachments(editAttachments.filter((_, j) => j !== i))}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <Button onClick={handleUpdatePost} className="w-full">Speichern</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
