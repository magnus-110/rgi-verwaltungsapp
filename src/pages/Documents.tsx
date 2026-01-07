import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, FileText, MessageSquare } from "lucide-react";
import { CategorySelector } from "@/components/documents/CategorySelector";
import { BuildingDocumentList } from "@/components/documents/BuildingDocumentList";
import { DocumentUpload } from "@/components/documents/DocumentUpload";
import { DocumentChat } from "@/components/documents/DocumentChat";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface Building {
  id: string;
  name: string;
  address: string;
  building_code: string;
}

interface DocumentInfo {
  id: string;
  status: 'uploading' | 'processing' | 'ready' | 'error';
  page_count: number | null;
  file_name: string;
  created_at: string;
  error_message: string | null;
}

export function Documents() {
  const { user } = useAuth();
  const [category, setCategory] = useState<'building' | 'general'>('building');
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [documentInfo, setDocumentInfo] = useState<DocumentInfo | null>(null);
  const [generalDocuments, setGeneralDocuments] = useState<DocumentInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'upload' | 'chat'>('upload');

  // Fetch buildings
  useEffect(() => {
    const fetchBuildings = async () => {
      const { data, error } = await supabase
        .from('buildings')
        .select('id, name, address, building_code')
        .order('name');

      if (!error && data) {
        setBuildings(data);
        if (data.length > 0 && !selectedBuildingId) {
          setSelectedBuildingId(data[0].id);
        }
      }
      setIsLoading(false);
    };

    fetchBuildings();
  }, []);

  // Fetch document info for selected building
  useEffect(() => {
    const fetchDocumentInfo = async () => {
      if (category === 'building' && selectedBuildingId) {
        const { data, error } = await supabase
          .from('building_documents')
          .select('id, status, page_count, file_name, created_at, error_message')
          .eq('building_id', selectedBuildingId)
          .eq('category', 'building')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (!error && data) {
          setDocumentInfo(data as DocumentInfo);
        } else {
          setDocumentInfo(null);
        }
      } else if (category === 'general') {
        const { data, error } = await supabase
          .from('building_documents')
          .select('id, status, page_count, file_name, created_at, error_message')
          .is('building_id', null)
          .eq('category', 'general')
          .order('created_at', { ascending: false });

        if (!error && data) {
          setGeneralDocuments(data as DocumentInfo[]);
        } else {
          setGeneralDocuments([]);
        }
      }
    };

    fetchDocumentInfo();

    // Subscribe to changes
    const channel = supabase
      .channel('document-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'building_documents',
        },
        () => {
          fetchDocumentInfo();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [category, selectedBuildingId]);

  const handleDocumentUploaded = () => {
    // Refresh document info after upload
    if (category === 'building' && selectedBuildingId) {
      supabase
        .from('building_documents')
        .select('id, status, page_count, file_name, created_at, error_message')
        .eq('building_id', selectedBuildingId)
        .eq('category', 'building')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
        .then(({ data }) => {
          if (data) setDocumentInfo(data as DocumentInfo);
        });
    }
  };

  const selectedBuilding = buildings.find(b => b.id === selectedBuildingId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dokumenten-Verwaltung</h1>
        <p className="text-muted-foreground mt-1">
          Laden Sie Dokumente hoch und stellen Sie Fragen mit KI-Unterstützung
        </p>
      </div>

      {/* Category Selector */}
      <CategorySelector 
        category={category} 
        onCategoryChange={setCategory} 
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Building/Document Selection */}
        <div className="lg:col-span-1">
          {category === 'building' ? (
            <BuildingDocumentList
              buildings={buildings}
              selectedBuildingId={selectedBuildingId}
              onSelectBuilding={setSelectedBuildingId}
              isLoading={isLoading}
            />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Allgemeine Dokumente
                </CardTitle>
              </CardHeader>
              <CardContent>
                {generalDocuments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Noch keine allgemeinen Dokumente hochgeladen.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {generalDocuments.map(doc => (
                      <div 
                        key={doc.id}
                        className="p-3 bg-muted rounded-lg"
                      >
                        <p className="text-sm font-medium truncate">{doc.file_name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`inline-block w-2 h-2 rounded-full ${
                            doc.status === 'ready' ? 'bg-green-500' :
                            doc.status === 'processing' ? 'bg-yellow-500' :
                            doc.status === 'error' ? 'bg-red-500' :
                            'bg-gray-500'
                          }`} />
                          <span className="text-xs text-muted-foreground">
                            {doc.status === 'ready' && doc.page_count && `${doc.page_count} Seiten`}
                            {doc.status === 'processing' && 'Wird verarbeitet...'}
                            {doc.status === 'error' && 'Fehler'}
                            {doc.status === 'uploading' && 'Wird hochgeladen...'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column: Upload & Chat */}
        <div className="lg:col-span-2">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'upload' | 'chat')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="upload" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Dokument hochladen
              </TabsTrigger>
              <TabsTrigger value="chat" className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Mit Dokumenten chatten
              </TabsTrigger>
            </TabsList>

            <TabsContent value="upload" className="mt-4">
              <DocumentUpload
                category={category}
                buildingId={selectedBuildingId}
                buildingName={selectedBuilding?.name}
                existingDocument={category === 'building' ? documentInfo : null}
                onDocumentUploaded={handleDocumentUploaded}
              />
            </TabsContent>

            <TabsContent value="chat" className="mt-4">
              <DocumentChat
                buildings={buildings}
                selectedBuildingId={selectedBuildingId}
                onBuildingChange={setSelectedBuildingId}
                userId={user?.id || ''}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

export default Documents;
