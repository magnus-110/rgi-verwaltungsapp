import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useAuth } from "@/hooks/useAuth";
import { useManagementMode } from "@/hooks/useManagementMode";
import { MessageSquare, Plus, User, Calendar, Building2, Trash2, FileText, Download, Settings, Edit, Filter, ChevronDown, ChevronUp } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ManagerFilter } from "@/components/ManagerFilter";
import { FileUpload } from "@/components/FileUpload";

interface Building {
  id: string;
  name: string;
  address: string;
  manager_name?: string | null;
  managers?: { user_id: string; name: string }[];
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
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [isEditTemplateOpen, setIsEditTemplateOpen] = useState(false);
  const [buildingFilter, setBuildingFilter] = useState<string>("all");
  const [buildingSearch, setBuildingSearch] = useState("");
  const [managerFilter, setManagerFilter] = useState<string>("all");
  const [managers, setManagers] = useState<{ id: string; name: string }[]>([]);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const canCreatePosts = profile?.role === 'admin';
  const canEditPosts = profile?.role === 'admin' || profile?.role === 'employee';
  const [editingPost, setEditingPost] = useState<ForumPost | null>(null);
  const [isEditPostOpen, setIsEditPostOpen] = useState(false);
  const [editAttachments, setEditAttachments] = useState<{ name: string; path: string; size: number; type: string }[]>([]);

  useEffect(() => {
    fetchPosts();
    if (canCreatePosts || canEditPosts) {
      fetchBuildings();
      fetchTemplates();
    }
  }, [managementMode, canCreatePosts, canEditPosts]);

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
      
      // Fetch building managers data
      const { data: managersData, error: managersError } = await supabase
        .from("building_managers")
        .select(`
          building_id,
          user_id,
          profiles:user_id (
            first_name,
            last_name,
            email
          )
        `);

      if (managersError) throw managersError;

      // Create a managers lookup map
      const managersMap = new Map();
      (managersData || []).forEach(bm => {
        if (!managersMap.has(bm.building_id)) {
          managersMap.set(bm.building_id, []);
        }
        managersMap.get(bm.building_id).push({
          user_id: bm.user_id,
          name: (bm.profiles as any)?.first_name && (bm.profiles as any)?.last_name 
            ? `${(bm.profiles as any).first_name} ${(bm.profiles as any).last_name}`
            : (bm.profiles as any)?.email || 'Unbekannter Admin'
        });
      });

      // Add managers to buildings data
      const buildingsWithManagers = (data || []).map(building => ({
        ...building,
        managers: managersMap.get(building.id) || []
      }));

      setBuildings(buildingsWithManagers);

      // Extract unique managers for filter
      const uniqueManagers = [...new Map(
        (managersData || [])
          .filter(bm => (data || []).some(building => building.id === bm.building_id))
          .map(bm => [
            bm.user_id,
            {
              id: bm.user_id,
              name: (bm.profiles as any)?.first_name && (bm.profiles as any)?.last_name 
                ? `${(bm.profiles as any).first_name} ${(bm.profiles as any).last_name}`
                : (bm.profiles as any)?.email || 'Unbekannter Admin'
            }
          ])
      ).values()];
      
      setManagers(uniqueManagers);
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
            address,
            manager_name
          )
        `)
        .eq('management_mode', managementMode)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Parse attachments and get building managers for each post  
      const processedData = await Promise.all(
        (data as any)?.map(async (post: any) => {
          let buildingWithManagers = post.buildings;
          
          if (post.buildings?.id) {
            // Fetch managers for this building
            const { data: managersData } = await supabase
              .from("building_managers")
              .select(`
                user_id,
                profiles:user_id (
                  first_name,
                  last_name,
                  email
                )
              `)
              .eq('building_id', post.buildings.id);

            buildingWithManagers = {
              ...post.buildings,
              managers: (managersData || []).map(bm => ({
                user_id: bm.user_id,
                name: (bm.profiles as any)?.first_name && (bm.profiles as any)?.last_name 
                  ? `${(bm.profiles as any).first_name} ${(bm.profiles as any).last_name}`
                  : (bm.profiles as any)?.email || 'Unbekannter Admin'
              }))
            };
          }
          
          return {
            ...post,
            attachments: typeof post.attachments === 'string' 
              ? JSON.parse(post.attachments || '[]') 
              : post.attachments || [],
            buildings: buildingWithManagers
          };
        }) || []
      );
      
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

  const handleEditPost = (post: ForumPost) => {
    setEditingPost({ ...post });
    setEditAttachments(post.attachments || []);
    setIsEditPostOpen(true);
  };

  const handleUpdatePost = async () => {
    if (!editingPost || !editingPost.title || !editingPost.content) {
      toast.error('Bitte füllen Sie alle Felder aus');
      return;
    }

    try {
      const { error } = await supabase
        .from('forum_posts')
        .update({
          title: editingPost.title,
          content: editingPost.content,
          attachments: editAttachments,
        })
        .eq('id', editingPost.id);

      if (error) throw error;

      setPosts(posts.map(p => p.id === editingPost.id ? { ...p, title: editingPost.title, content: editingPost.content, attachments: editAttachments } : p));
      setEditingPost(null);
      setIsEditPostOpen(false);
      setEditAttachments([]);
      toast.success('Beitrag erfolgreich aktualisiert');
    } catch (error) {
      console.error('Error updating post:', error);
      toast.error('Fehler beim Aktualisieren des Beitrags');
    }
  };

  const handleTemplateSelect = (templateId: string) => {
    if (templateId === "none") {
      // Reset to empty template
      setNewPost({ 
        ...newPost, 
        title: "", 
        content: "", 
        template_id: "" 
      });
      return;
    }
    
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

  const handleUpdateTemplate = async () => {
    if (!editingTemplate || !editingTemplate.title || !editingTemplate.content) {
      toast.error('Bitte füllen Sie alle Felder aus');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('forum_post_templates')
        .update({
          title: editingTemplate.title,
          content: editingTemplate.content
        })
        .eq('id', editingTemplate.id)
        .select()
        .single();

      if (error) throw error;

      setTemplates(templates.map(t => t.id === editingTemplate.id ? data : t));
      setEditingTemplate(null);
      setIsEditTemplateOpen(false);
      toast.success('Vorlage erfolgreich aktualisiert');
    } catch (error) {
      console.error('Error updating template:', error);
      toast.error('Fehler beim Aktualisieren der Vorlage');
    }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    try {
      const { error } = await supabase
        .from('forum_post_templates')
        .delete()
        .eq('id', templateId);

      if (error) throw error;

      setTemplates(templates.filter(t => t.id !== templateId));
      toast.success('Vorlage erfolgreich gelöscht');
    } catch (error) {
      console.error('Error deleting template:', error);
      toast.error('Fehler beim Löschen der Vorlage');
    }
  };

  const filteredPosts = posts.filter(post => {
    const matchesBuilding = buildingFilter === "all" || post.building_id === buildingFilter;
    const matchesManager = managerFilter === "all" || 
      (post.buildings as any)?.managers?.some((manager: any) => manager.user_id === managerFilter);
    return matchesBuilding && matchesManager;
  });

  const filteredBuildings = buildings.filter(building =>
    building.name.toLowerCase().includes(buildingSearch.toLowerCase()) ||
    building.address.toLowerCase().includes(buildingSearch.toLowerCase())
  );

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
          <Button variant="outline" onClick={() => setIsCreating(false)}>
            Abbrechen
          </Button>
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
                    <SelectItem value="none">Keine Vorlage</SelectItem>
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
          <div className="flex gap-2">
            <Dialog open={isTemplateDialogOpen} onOpenChange={setIsTemplateDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <Settings className="w-4 h-4" />
                  Vorlagen verwalten
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Vorlagen verwalten</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <Button
                      onClick={() => {
                        setNewTemplate({ title: "", content: "" });
                        setEditingTemplate(null);
                        setIsEditTemplateOpen(true);
                      }}
                      className="gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      Neue Vorlage
                    </Button>
                  </div>

                  <div className="grid gap-3">
                    {templates.map((template) => (
                      <Card key={template.id} className="p-4">
                        <div className="flex justify-between items-start gap-4">
                          <div className="flex-1">
                            <h4 className="font-semibold">{template.title}</h4>
                            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                              {template.content}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditingTemplate(template);
                                setIsEditTemplateOpen(true);
                              }}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Vorlage löschen</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Sind Sie sicher, dass Sie diese Vorlage löschen möchten? Diese Aktion kann nicht rückgängig gemacht werden.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDeleteTemplate(template.id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    Löschen
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>

                  {templates.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      Noch keine Vorlagen erstellt.
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>
            <Button onClick={() => setIsCreating(true)} className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground md:inline-flex">
              <Plus className="w-4 h-4" />
              <span className="hidden md:inline">Neuer Beitrag</span>
            </Button>
          </div>
        )}
      </div>

      {/* Filter Section */}
      {canCreatePosts && (
        <Card>
          <Collapsible open={isFilterOpen} onOpenChange={setIsFilterOpen}>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Filter className="h-5 w-5" />
                    Filter
                  </CardTitle>
                  {isFilterOpen ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <Input
                      placeholder="Gebäude suchen..."
                      value={buildingSearch}
                      onChange={(e) => setBuildingSearch(e.target.value)}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <Select value={buildingFilter} onValueChange={setBuildingFilter}>
                      <SelectTrigger className="w-full bg-background border border-border">
                        <SelectValue placeholder="Gebäude auswählen" />
                      </SelectTrigger>
                      <SelectContent className="bg-background border border-border shadow-lg z-50 max-h-60 overflow-y-auto">
                        <SelectItem value="all">Alle Gebäude</SelectItem>
                        {filteredBuildings.map((building) => (
                          <SelectItem key={building.id} value={building.id}>
                            <div className="flex items-center gap-2">
                              <Building2 className="h-4 w-4" />
                              <span className="truncate">{building.name} - {building.address}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Select value={managerFilter} onValueChange={setManagerFilter}>
                      <SelectTrigger className="w-full bg-background border border-border">
                        <SelectValue placeholder="Nach Verwalter filtern" />
                      </SelectTrigger>
                      <SelectContent className="bg-background border border-border shadow-lg z-50">
                        <SelectItem value="all">Alle Verwalter</SelectItem>
                        {managers.map((manager) => (
                          <SelectItem key={manager.id} value={manager.id}>
                            {manager.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {(buildingFilter !== "all" || managerFilter !== "all") && (
                  <div className="mt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setBuildingFilter("all");
                        setManagerFilter("all");
                      }}
                      className="w-full sm:w-auto"
                    >
                      Filter zurücksetzen
                    </Button>
                  </div>
                )}
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      )}

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
          filteredPosts.map((post) => (
            <Card key={post.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="flex-1 space-y-2 min-w-0">
                    <CardTitle className="text-xl break-words">{post.title}</CardTitle>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <User className="w-4 h-4" />
                        <span>Verwaltung</span>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Calendar className="w-4 h-4" />
                        <span>{new Date(post.created_at).toLocaleDateString('de-DE')}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 flex-shrink-0">
                    <Badge variant="secondary" className="flex items-center gap-1 max-w-full">
                      <Building2 className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{post.buildings?.name || 'Unbekannt'}</span>
                    </Badge>
                    {canEditPosts && (
                      <Button variant="ghost" size="sm" className="flex-shrink-0" onClick={() => handleEditPost(post)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                    )}
                    {canCreatePosts && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="flex-shrink-0">
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
                <p className="text-muted-foreground whitespace-pre-wrap text-left">{post.content}</p>
                {renderAttachments(post.attachments)}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Template Edit/Create Dialog */}
      <Dialog open={isEditTemplateOpen} onOpenChange={setIsEditTemplateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? 'Vorlage bearbeiten' : 'Neue Vorlage erstellen'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="template-title">Titel</Label>
              <Input
                id="template-title"
                value={editingTemplate?.title || newTemplate.title}
                onChange={(e) => {
                  if (editingTemplate) {
                    setEditingTemplate({ ...editingTemplate, title: e.target.value });
                  } else {
                    setNewTemplate({ ...newTemplate, title: e.target.value });
                  }
                }}
                placeholder="Vorlagen-Titel"
              />
            </div>
            <div>
              <Label htmlFor="template-content">Inhalt</Label>
              <Textarea
                id="template-content"
                value={editingTemplate?.content || newTemplate.content}
                onChange={(e) => {
                  if (editingTemplate) {
                    setEditingTemplate({ ...editingTemplate, content: e.target.value });
                  } else {
                    setNewTemplate({ ...newTemplate, content: e.target.value });
                  }
                }}
                placeholder="Vorlagen-Inhalt (verwenden Sie [Platzhalter] für variable Inhalte)"
                rows={8}
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={editingTemplate ? handleUpdateTemplate : handleCreateTemplate}
                disabled={editingTemplate ? (!editingTemplate.title || !editingTemplate.content) : (!newTemplate.title || !newTemplate.content)}
              >
                {editingTemplate ? 'Aktualisieren' : 'Erstellen'}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setIsEditTemplateOpen(false);
                  setEditingTemplate(null);
                  setNewTemplate({ title: "", content: "" });
                }}
              >
                Abbrechen
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Post Dialog */}
      <Dialog open={isEditPostOpen} onOpenChange={(open) => {
        setIsEditPostOpen(open);
        if (!open) {
          setEditingPost(null);
          setEditAttachments([]);
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Beitrag bearbeiten</DialogTitle>
          </DialogHeader>
          {editingPost && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-post-title">Titel</Label>
                <Input
                  id="edit-post-title"
                  value={editingPost.title}
                  onChange={(e) => setEditingPost({ ...editingPost, title: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="edit-post-content">Inhalt</Label>
                <Textarea
                  id="edit-post-content"
                  value={editingPost.content}
                  onChange={(e) => setEditingPost({ ...editingPost, content: e.target.value })}
                  rows={8}
                />
              </div>
              <div>
                <Label>Anhänge</Label>
                <FileUpload
                  onFilesChange={setEditAttachments}
                  maxFiles={5}
                  bucketName="forum-attachments"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleUpdatePost}
                  disabled={!editingPost.title || !editingPost.content}
                >
                  Speichern
                </Button>
                <Button variant="outline" onClick={() => { setIsEditPostOpen(false); setEditingPost(null); setEditAttachments([]); }}>
                  Abbrechen
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};