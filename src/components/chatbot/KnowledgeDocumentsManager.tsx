import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { FileText, Plus, Edit, Trash2, Upload, Loader2, ChevronDown, ChevronUp, BookOpen } from "lucide-react";

interface KnowledgeDocument {
  id: string;
  title: string;
  content: string;
  category: string;
  keywords: string[];
  applies_to: string;
  page_count: number | null;
  char_count: number | null;
  created_at: string;
}

const CATEGORIES = [
  { value: 'mietvertrag', label: 'Mietvertrag' },
  { value: 'hausordnung', label: 'Hausordnung' },
  { value: 'rechtliches', label: 'Rechtliches' },
  { value: 'faq', label: 'FAQ / Anleitungen' },
  { value: 'sonstiges', label: 'Sonstiges' },
];

const APPLIES_TO = [
  { value: 'alle', label: 'Alle Nutzer' },
  { value: 'mieter', label: 'Nur Mieter' },
  { value: 'weg_eigentuemer', label: 'Nur WEG-Eigentümer' },
];

export const KnowledgeDocumentsManager = () => {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);
  
  // Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [editingDoc, setEditingDoc] = useState<KnowledgeDocument | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    category: 'sonstiges',
    keywords: '',
    applies_to: 'alle',
    sourceType: 'text' as 'text' | 'file',
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  useEffect(() => {
    loadDocuments();
  }, []);

  const loadDocuments = async () => {
    try {
      const { data, error } = await supabase
        .from('chatbot_knowledge_documents')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDocuments(data || []);
    } catch (error) {
      console.error('Error loading documents:', error);
      toast({
        title: "Fehler",
        description: "Dokumente konnten nicht geladen werden.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      content: '',
      category: 'sonstiges',
      keywords: '',
      applies_to: 'alle',
      sourceType: 'text',
    });
    setSelectedFile(null);
    setEditingDoc(null);
  };

  const openDialog = (doc?: KnowledgeDocument) => {
    if (doc) {
      setEditingDoc(doc);
      setFormData({
        title: doc.title,
        content: doc.content,
        category: doc.category,
        keywords: doc.keywords.join(', '),
        applies_to: doc.applies_to,
        sourceType: 'text',
      });
    } else {
      resetForm();
    }
    setIsDialogOpen(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (!formData.title) {
        setFormData(prev => ({ ...prev, title: file.name.replace(/\.[^/.]+$/, '') }));
      }
    }
  };

  const handleSubmit = async () => {
    if (!formData.title.trim()) {
      toast({
        title: "Fehler",
        description: "Bitte geben Sie einen Titel ein.",
        variant: "destructive",
      });
      return;
    }

    if (formData.sourceType === 'text' && !formData.content.trim() && !editingDoc) {
      toast({
        title: "Fehler",
        description: "Bitte geben Sie Inhalt ein.",
        variant: "destructive",
      });
      return;
    }

    if (formData.sourceType === 'file' && !selectedFile && !editingDoc) {
      toast({
        title: "Fehler",
        description: "Bitte wählen Sie eine Datei aus.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);

    try {
      if (editingDoc) {
        // Update existing document
        const { error } = await supabase
          .from('chatbot_knowledge_documents')
          .update({
            title: formData.title,
            content: formData.content,
            category: formData.category,
            keywords: formData.keywords.split(',').map(k => k.trim().toLowerCase()).filter(k => k),
            applies_to: formData.applies_to,
          })
          .eq('id', editingDoc.id);

        if (error) throw error;

        toast({
          title: "Dokument aktualisiert",
          description: "Die Änderungen wurden gespeichert.",
        });
      } else if (formData.sourceType === 'file' && selectedFile) {
        // Upload file via edge function
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('Not authenticated');

        const uploadFormData = new FormData();
        uploadFormData.append('file', selectedFile);
        uploadFormData.append('title', formData.title);
        uploadFormData.append('category', formData.category);
        uploadFormData.append('keywords', formData.keywords);
        uploadFormData.append('applies_to', formData.applies_to);
        uploadFormData.append('management_mode', 'weg');

        const response = await fetch(
          'https://eebphowrbarzawwixqcc.supabase.co/functions/v1/process-knowledge-document',
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
            },
            body: uploadFormData,
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Upload failed');
        }

        toast({
          title: "Dokument hochgeladen",
          description: "Das Dokument wurde erfolgreich verarbeitet und gespeichert.",
        });
      } else {
        // Save text directly
        const { error } = await supabase
          .from('chatbot_knowledge_documents')
          .insert({
            management_mode: 'weg',
            title: formData.title,
            content: formData.content,
            category: formData.category,
            keywords: formData.keywords.split(',').map(k => k.trim().toLowerCase()).filter(k => k),
            applies_to: formData.applies_to,
            char_count: formData.content.length,
          });

        if (error) throw error;

        toast({
          title: "Dokument erstellt",
          description: "Das Dokument wurde erfolgreich gespeichert.",
        });
      }

      setIsDialogOpen(false);
      resetForm();
      loadDocuments();
    } catch (error: any) {
      console.error('Error saving document:', error);
      toast({
        title: "Fehler",
        description: error.message || "Das Dokument konnte nicht gespeichert werden.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Möchten Sie dieses Dokument wirklich löschen?')) return;

    try {
      const { error } = await supabase
        .from('chatbot_knowledge_documents')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Dokument gelöscht",
        description: "Das Dokument wurde erfolgreich entfernt.",
      });
      
      loadDocuments();
    } catch (error) {
      console.error('Error deleting document:', error);
      toast({
        title: "Fehler",
        description: "Das Dokument konnte nicht gelöscht werden.",
        variant: "destructive",
      });
    }
  };

  const getCategoryLabel = (value: string) => {
    return CATEGORIES.find(c => c.value === value)?.label || value;
  };

  const getAppliesToLabel = (value: string) => {
    return APPLIES_TO.find(a => a.value === value)?.label || value;
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="w-5 h-5" />
              Wissensdokumente
            </CardTitle>
            <Button onClick={() => openDialog()} size="sm">
              <Plus className="w-4 h-4 mr-2" />
              Dokument hinzufügen
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Noch keine Wissensdokumente vorhanden.</p>
              <p className="text-sm">Fügen Sie Dokumente hinzu, damit Nova auf dieses Wissen zugreifen kann.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {documents.map((doc) => (
                <Card key={doc.id} className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div 
                      className="flex-1 cursor-pointer" 
                      onClick={() => setExpandedDoc(expandedDoc === doc.id ? null : doc.id)}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <FileText className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium">{doc.title}</span>
                        {expandedDoc === doc.id ? (
                          <ChevronUp className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                      
                      <div className="flex flex-wrap gap-2 mb-2">
                        <Badge variant="outline">{getCategoryLabel(doc.category)}</Badge>
                        <Badge variant="secondary">{getAppliesToLabel(doc.applies_to)}</Badge>
                        {doc.page_count && (
                          <Badge variant="outline" className="text-xs">
                            {doc.page_count} Seiten
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-xs">
                          {doc.char_count?.toLocaleString()} Zeichen
                        </Badge>
                      </div>

                      {doc.keywords.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {doc.keywords.slice(0, 5).map((keyword, i) => (
                            <Badge key={i} variant="outline" className="text-xs bg-muted">
                              {keyword}
                            </Badge>
                          ))}
                          {doc.keywords.length > 5 && (
                            <Badge variant="outline" className="text-xs">
                              +{doc.keywords.length - 5}
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => openDialog(doc)}>
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(doc.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  {expandedDoc === doc.id && (
                    <div className="mt-4 pt-4 border-t">
                      <pre className="text-sm text-muted-foreground whitespace-pre-wrap font-sans max-h-64 overflow-y-auto">
                        {doc.content}
                      </pre>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
          
          <p className="text-xs text-muted-foreground mt-4">
            Wissensdokumente werden intelligent durchsucht. Nova lädt nur relevante Dokumente basierend auf Kategorie und Schlagwörtern.
          </p>
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingDoc ? 'Dokument bearbeiten' : 'Neues Wissensdokument'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="title">Titel *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="z.B. Mietvertrag Standardvorlage"
              />
            </div>

            {!editingDoc && (
              <div>
                <Label>Quelle</Label>
                <div className="flex gap-4 mt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="sourceType"
                      checked={formData.sourceType === 'text'}
                      onChange={() => setFormData(prev => ({ ...prev, sourceType: 'text' }))}
                      className="w-4 h-4"
                    />
                    <span>Text eingeben</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="sourceType"
                      checked={formData.sourceType === 'file'}
                      onChange={() => setFormData(prev => ({ ...prev, sourceType: 'file' }))}
                      className="w-4 h-4"
                    />
                    <span>PDF hochladen</span>
                  </label>
                </div>
              </div>
            )}

            {(formData.sourceType === 'text' || editingDoc) && (
              <div>
                <Label htmlFor="content">Inhalt *</Label>
                <Textarea
                  id="content"
                  value={formData.content}
                  onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
                  placeholder="Dokumentinhalt hier eingeben..."
                  rows={10}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {formData.content.length.toLocaleString()} Zeichen
                </p>
              </div>
            )}

            {formData.sourceType === 'file' && !editingDoc && (
              <div>
                <Label>Datei hochladen</Label>
                <div className="mt-2 border-2 border-dashed rounded-lg p-6 text-center">
                  <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground mb-2">
                    PDF, TXT oder MD Datei auswählen
                  </p>
                  <Input
                    type="file"
                    accept=".pdf,.txt,.md"
                    onChange={handleFileChange}
                    className="max-w-xs mx-auto"
                  />
                  {selectedFile && (
                    <p className="mt-2 text-sm font-medium">{selectedFile.name}</p>
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="category">Kategorie</Label>
                <Select 
                  value={formData.category} 
                  onValueChange={(value) => setFormData(prev => ({ ...prev, category: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(cat => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="applies_to">Gilt für</Label>
                <Select 
                  value={formData.applies_to} 
                  onValueChange={(value) => setFormData(prev => ({ ...prev, applies_to: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {APPLIES_TO.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="keywords">Schlagwörter (mit Komma getrennt)</Label>
              <Input
                id="keywords"
                value={formData.keywords}
                onChange={(e) => setFormData(prev => ({ ...prev, keywords: e.target.value }))}
                placeholder="z.B. kaution, kündigung, miete, nebenkosten"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Diese Begriffe helfen Nova, das Dokument bei passenden Fragen zu finden.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isUploading}>
              Abbrechen
            </Button>
            <Button onClick={handleSubmit} disabled={isUploading}>
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Verarbeite...
                </>
              ) : editingDoc ? (
                'Speichern'
              ) : (
                'Hinzufügen'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
