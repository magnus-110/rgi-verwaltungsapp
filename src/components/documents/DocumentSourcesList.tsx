import React, { useState, useEffect } from "react";
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
import { Trash2, FileText, Loader2, Database } from "lucide-react";
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
  buildings?: { name: string } | null;
}

const PAGE_SIZE = 10;

export function DocumentSourcesList() {
  const { toast } = useToast();
  const [documents, setDocuments] = useState<BuildingDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  useEffect(() => {
    loadDocuments();
  }, [currentPage]);

  const loadDocuments = async () => {
    setIsLoading(true);
    try {
      const offset = (currentPage - 1) * PAGE_SIZE;
      
      const { data, error, count } = await supabase
        .from('building_documents')
        .select('*, buildings(name)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) throw error;

      setDocuments(data || []);
      setTotalCount(count || 0);
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

  const handleDelete = async (doc: BuildingDocument) => {
    setDeletingId(doc.id);
    try {
      // 1. Delete file from storage
      if (doc.file_path) {
        const { error: storageError } = await supabase.storage
          .from('building-documents')
          .remove([doc.file_path]);
        
        if (storageError) {
          console.warn('Storage delete warning:', storageError);
        }
      }

      // 2. Delete document from database (chunks are deleted via CASCADE)
      const { error: dbError } = await supabase
        .from('building_documents')
        .delete()
        .eq('id', doc.id);

      if (dbError) throw dbError;

      toast({
        title: "Dokument gelöscht",
        description: `"${doc.file_name}" wurde erfolgreich entfernt.`,
      });

      // Reload documents
      loadDocuments();
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

  const getCategoryLabel = (doc: BuildingDocument) => {
    if (doc.category === 'general') return 'Allgemein';
    if (doc.buildings?.name) return doc.buildings.name;
    return 'Gebäude';
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5 text-muted-foreground" />
          <div>
            <CardTitle>Wissensquellen</CardTitle>
            <CardDescription>
              {totalCount} {totalCount === 1 ? 'Dokument' : 'Dokumente'} in der Wissensdatenbank
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : documents.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>Noch keine Dokumente hochgeladen.</p>
            <p className="text-sm">Laden Sie Dokumente hoch, um die Wissensdatenbank zu füllen.</p>
          </div>
        ) : (
          <>
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dateiname</TableHead>
                    <TableHead>Kategorie</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Typ</TableHead>
                    <TableHead className="text-center">Seiten</TableHead>
                    <TableHead>Größe</TableHead>
                    <TableHead>Datum</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell className="font-medium max-w-[200px] truncate" title={doc.file_name}>
                        {doc.file_name}
                      </TableCell>
                      <TableCell>{getCategoryLabel(doc)}</TableCell>
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
                  ))}
                </TableBody>
              </Table>
            </div>

            {totalPages > 1 && (
              <div className="mt-4">
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                      />
                    </PaginationItem>
                    
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum: number;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }
                      
                      return (
                        <PaginationItem key={pageNum}>
                          <PaginationLink
                            onClick={() => setCurrentPage(pageNum)}
                            isActive={currentPage === pageNum}
                            className="cursor-pointer"
                          >
                            {pageNum}
                          </PaginationLink>
                        </PaginationItem>
                      );
                    })}
                    
                    <PaginationItem>
                      <PaginationNext
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
