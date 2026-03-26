import React, { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trash2, FileText, Loader2, Database, Building2, Globe } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { de } from "date-fns/locale";

interface BuildingDocument {
  id: string;
  file_name: string;
  file_path: string;
  category: string;
  building_id: string | null;
  status: string;
  document_type: string | null;
  extraction_method: string | null;
  page_count: number | null;
  file_size: number | null;
  created_at: string;
  buildings?: { name: string; building_code: string } | null;
}

interface GroupedBuilding {
  buildingId: string;
  buildingName: string;
  buildingCode: string;
  documents: BuildingDocument[];
  totalPages: number;
  totalSize: number;
}

export function DocumentSourcesList() {
  const { toast } = useToast();
  const [allDocuments, setAllDocuments] = useState<BuildingDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("all");

  useEffect(() => {
    loadAllDocuments();
  }, []);

  const loadAllDocuments = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('building_documents')
        .select('*, buildings(name, building_code)')
        .order('created_at', { ascending: false });

      if (error) throw error;

      setAllDocuments(data || []);
    } catch (error) {
      console.error('Error loading documents:', error);
      toast({
        title: "Fehler",
        description: "Dokumente konnten nicht geladen werden.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Derived data
  const generalDocuments = useMemo(() => 
    allDocuments.filter(d => d.category === 'general'),
    [allDocuments]
  );

  const buildingDocuments = useMemo(() => 
    allDocuments.filter(d => d.category === 'building'),
    [allDocuments]
  );

  const groupedByBuilding = useMemo(() => {
    const grouped = new Map<string, GroupedBuilding>();

    buildingDocuments.forEach(doc => {
      if (!doc.building_id) return;

      if (!grouped.has(doc.building_id)) {
        grouped.set(doc.building_id, {
          buildingId: doc.building_id,
          buildingName: doc.buildings?.name || 'Unbekanntes Gebäude',
          buildingCode: doc.buildings?.building_code || '',
          documents: [],
          totalPages: 0,
          totalSize: 0,
        });
      }

      const group = grouped.get(doc.building_id)!;
      group.documents.push(doc);
      group.totalPages += doc.page_count || 0;
      group.totalSize += doc.file_size || 0;
    });

    return Array.from(grouped.values())
      .sort((a, b) => a.buildingName.localeCompare(b.buildingName));
  }, [buildingDocuments]);

  const handleDelete = async (doc: BuildingDocument) => {
    setDeletingId(doc.id);
    try {
      if (doc.file_path) {
        const { error: storageError } = await supabase.storage
          .from('building-documents')
          .remove([doc.file_path]);

        if (storageError) {
          console.warn('Storage delete warning:', storageError);
        }
      }

      const { error: dbError } = await supabase
        .from('building_documents')
        .delete()
        .eq('id', doc.id);

      if (dbError) throw dbError;

      toast({
        title: "Dokument gelöscht",
        description: `"${doc.file_name}" wurde erfolgreich entfernt.`,
      });

      loadAllDocuments();
    } catch (error) {
      console.error('Delete error:', error);
      toast({
        title: "Fehler",
        description: "Dokument konnte nicht gelöscht werden.",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ready':
        return <Badge variant="default" className="bg-green-600">Bereit</Badge>;
      case 'processing':
        return <Badge variant="secondary" className="bg-yellow-500 text-white">Verarbeitung</Badge>;
      case 'error':
        return <Badge variant="destructive">Fehler</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getDocumentTypeBadge = (type: string | null) => {
    switch (type) {
      case 'native':
        return <Badge variant="outline" className="text-blue-600 border-blue-600">Native</Badge>;
      case 'scan':
        return <Badge variant="outline" className="text-orange-600 border-orange-600">Scan</Badge>;
      case 'hybrid':
        return <Badge variant="outline" className="text-purple-600 border-purple-600">Hybrid</Badge>;
      default:
        return <Badge variant="outline" className="text-muted-foreground">Unbekannt</Badge>;
    }
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const renderDocumentRow = (doc: BuildingDocument, showCategory = false) => (
    <TableRow key={doc.id}>
      <TableCell className="font-medium max-w-[200px] truncate" title={doc.file_name}>
        {doc.file_name}
      </TableCell>
      {showCategory && (
        <TableCell>
          {doc.category === 'general' ? 'Allgemein' : doc.buildings?.name || 'Gebäude'}
        </TableCell>
      )}
      <TableCell>{getStatusBadge(doc.status)}</TableCell>
      <TableCell>{getDocumentTypeBadge(doc.document_type)}</TableCell>
      <TableCell className="text-center">{doc.page_count ?? '-'}</TableCell>
      <TableCell>{formatFileSize(doc.file_size)}</TableCell>
      <TableCell className="text-muted-foreground">
        {format(new Date(doc.created_at), 'dd.MM.yyyy', { locale: de })}
      </TableCell>
      <TableCell>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              disabled={deletingId === doc.id}
            >
              {deletingId === doc.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Dokument löschen?</AlertDialogTitle>
              <AlertDialogDescription>
                Möchten Sie "{doc.file_name}" wirklich löschen?
                Alle zugehörigen Textabschnitte (Chunks) werden ebenfalls entfernt.
                Diese Aktion kann nicht rückgängig gemacht werden.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => handleDelete(doc)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Löschen
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </TableCell>
    </TableRow>
  );

  const renderDocumentsTable = (documents: BuildingDocument[], showCategory = false) => (
    <div className="rounded-md border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Dateiname</TableHead>
            {showCategory && <TableHead>Kategorie</TableHead>}
            <TableHead>Status</TableHead>
            <TableHead>Typ</TableHead>
            <TableHead className="text-center">Seiten</TableHead>
            <TableHead>Größe</TableHead>
            <TableHead>Datum</TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {documents.map(doc => renderDocumentRow(doc, showCategory))}
        </TableBody>
      </Table>
    </div>
  );

  const renderEmptyState = (message: string) => (
    <div className="text-center py-8 text-muted-foreground">
      <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
      <p>{message}</p>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5 text-muted-foreground" />
          <div>
            <CardTitle>Wissensquellen</CardTitle>
            <CardDescription>
              {allDocuments.length} {allDocuments.length === 1 ? 'Dokument' : 'Dokumente'} in der Wissensdatenbank
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : allDocuments.length === 0 ? (
          renderEmptyState("Noch keine Dokumente hochgeladen.")
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList variant="underline" className="mb-4">
              <TabsTrigger variant="underline" value="all" className="gap-2">
                <FileText className="h-4 w-4" />
                Alle ({allDocuments.length})
              </TabsTrigger>
              <TabsTrigger variant="underline" value="general" className="gap-2">
                <Globe className="h-4 w-4" />
                Allgemein ({generalDocuments.length})
              </TabsTrigger>
              <TabsTrigger variant="underline" value="buildings" className="gap-2">
                <Building2 className="h-4 w-4" />
                Gebäude ({buildingDocuments.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="all">
              {renderDocumentsTable(allDocuments, true)}
            </TabsContent>

            <TabsContent value="general">
              {generalDocuments.length === 0 ? (
                renderEmptyState("Keine allgemeinen Dokumente vorhanden.")
              ) : (
                renderDocumentsTable(generalDocuments)
              )}
            </TabsContent>

            <TabsContent value="buildings">
              {groupedByBuilding.length === 0 ? (
                renderEmptyState("Keine gebäudespezifischen Dokumente vorhanden.")
              ) : (
                <Accordion type="multiple" className="space-y-2">
                  {groupedByBuilding.map((group) => (
                    <AccordionItem 
                      key={group.buildingId} 
                      value={group.buildingId}
                      className="border rounded-lg px-4"
                    >
                      <AccordionTrigger className="hover:no-underline py-4">
                        <div className="flex items-center justify-between w-full pr-4">
                          <div className="flex items-center gap-3">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{group.buildingName}</span>
                            <Badge variant="secondary">{group.buildingCode}</Badge>
                          </div>
                          <div className="flex items-center gap-4 text-muted-foreground text-sm">
                            <span>{group.documents.length} {group.documents.length === 1 ? 'Dokument' : 'Dokumente'}</span>
                            <span>•</span>
                            <span>{group.totalPages} Seiten</span>
                            <span>•</span>
                            <span>{formatFileSize(group.totalSize)}</span>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pt-2 pb-4">
                        {renderDocumentsTable(group.documents)}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}