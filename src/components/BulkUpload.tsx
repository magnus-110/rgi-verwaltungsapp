import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Upload, Download, FileSpreadsheet, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import * as XLSX from 'xlsx';

interface BulkUploadProps {
  buildingId: string;
  managementMode: 'weg' | 'rent';
  onUploadComplete: () => void;
}

interface UploadResult {
  success: boolean;
  processed: number;
  created: number;
  updated: number;
  errors: string[];
}

export const BulkUpload: React.FC<BulkUploadProps> = ({
  buildingId,
  managementMode,
  onUploadComplete
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const generateTemplate = () => {
    const templateData = [
      {
        'E-Mail': 'beispiel@email.de',
        'Vorname': 'Max',
        'Nachname': 'Mustermann',
        'Telefon': '+49 123 456789'
      }
    ];
    
    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, managementMode === 'weg' ? 'WEG Eigentümer' : 'Mieter');
    
    const fileName = managementMode === 'weg' 
      ? 'weg_eigentuemer_template.xlsx' 
      : 'mieter_template.xlsx';
      
    XLSX.writeFile(wb, fileName);
  };

  const validateExcelData = (data: any[]): { isValid: boolean; errors: string[] } => {
    const errors: string[] = [];
    const requiredFields = ['E-Mail'];
    
    if (data.length === 0) {
      errors.push('Excel-Datei ist leer');
      return { isValid: false, errors };
    }

    data.forEach((row, index) => {
      const rowNum = index + 2; // Excel row number (accounting for header)
      
      requiredFields.forEach(field => {
        if (!row[field] || row[field].toString().trim() === '') {
          errors.push(`Zeile ${rowNum}: ${field} ist erforderlich`);
        }
      });

      // Email validation
      if (row['E-Mail']) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(row['E-Mail'])) {
          errors.push(`Zeile ${rowNum}: Ungültige E-Mail-Adresse`);
        }
      }
    });

    return { isValid: errors.length === 0, errors };
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      const { isValid, errors } = validateExcelData(jsonData);
      
      if (!isValid) {
        toast({
          title: "Validierungsfehler",
          description: errors.join(', '),
          variant: "destructive"
        });
        return;
      }

      setPreviewData(jsonData);
      setShowPreview(true);
    } catch (error) {
      toast({
        title: "Fehler beim Lesen der Datei",
        description: "Die Excel-Datei konnte nicht gelesen werden.",
        variant: "destructive"
      });
    }
  };

  const processUpload = async () => {
    if (previewData.length === 0) return;

    setUploading(true);
    setUploadProgress(0);

    try {
      const { data, error } = await supabase.functions.invoke('process-bulk-upload', {
        body: {
          data: previewData,
          buildingId,
          managementMode
        }
      });

      if (error) {
        throw error;
      }

      setUploadResult(data);
      setShowPreview(false);
      onUploadComplete();
      
      toast({
        title: "Upload erfolgreich",
        description: `${data.created} neue Benutzer erstellt, ${data.updated} aktualisiert.`
      });
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "Upload fehlgeschlagen",
        description: "Ein Fehler ist beim Verarbeiten der Daten aufgetreten.",
        variant: "destructive"
      });
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const resetUpload = () => {
    setPreviewData([]);
    setShowPreview(false);
    setUploadResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="ml-2">
          <Upload className="h-4 w-4 mr-2" />
          Bulk Upload
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            Bulk Upload - {managementMode === 'weg' ? 'WEG Eigentümer' : 'Mieter'}
          </DialogTitle>
          <DialogDescription>
            Laden Sie mehrere Benutzer über eine Excel-Datei hoch.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Template Download */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center text-lg">
                <FileSpreadsheet className="h-5 w-5 mr-2" />
                Excel Template
              </CardTitle>
              <CardDescription>
                Laden Sie zunächst die Vorlage herunter und füllen Sie Ihre Daten ein.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={generateTemplate} variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Template herunterladen
              </Button>
            </CardContent>
          </Card>

          {/* File Upload */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Datei hochladen</CardTitle>
            </CardHeader>
            <CardContent>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileSelect}
                className="mb-4"
              />
              {previewData.length > 0 && (
                <Badge variant="secondary">
                  {previewData.length} Datensätze erkannt
                </Badge>
              )}
            </CardContent>
          </Card>

          {/* Preview */}
          {showPreview && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Datenvorschau</CardTitle>
                <CardDescription>
                  Überprüfen Sie die Daten vor dem Import
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="max-h-60 overflow-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2">E-Mail</th>
                        <th className="text-left p-2">Vorname</th>
                        <th className="text-left p-2">Nachname</th>
                        <th className="text-left p-2">Telefon</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.slice(0, 10).map((row, index) => (
                        <tr key={index} className="border-b">
                          <td className="p-2">{row['E-Mail']}</td>
                          <td className="p-2">{row['Vorname'] || '-'}</td>
                          <td className="p-2">{row['Nachname'] || '-'}</td>
                          <td className="p-2">{row['Telefon'] || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {previewData.length > 10 && (
                    <p className="text-sm text-muted-foreground mt-2">
                      ... und {previewData.length - 10} weitere Datensätze
                    </p>
                  )}
                </div>
                <div className="flex justify-between mt-4">
                  <Button onClick={resetUpload} variant="outline">
                    Abbrechen
                  </Button>
                  <Button onClick={processUpload} disabled={uploading}>
                    {uploading ? 'Wird verarbeitet...' : 'Import starten'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Upload Progress */}
          {uploading && (
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Upload läuft...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <Progress value={uploadProgress} />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Upload Result */}
          {uploadResult && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center text-lg">
                  {uploadResult.success ? (
                    <CheckCircle className="h-5 w-5 mr-2 text-green-600" />
                  ) : (
                    <XCircle className="h-5 w-5 mr-2 text-red-600" />
                  )}
                  Upload Ergebnis
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <p>Verarbeitet: {uploadResult.processed} Datensätze</p>
                  <p>Neu erstellt: {uploadResult.created} Benutzer</p>
                  <p>Aktualisiert: {uploadResult.updated} Benutzer</p>
                  
                  {uploadResult.errors.length > 0 && (
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        <strong>Fehler:</strong>
                        <ul className="mt-2 list-disc list-inside">
                          {uploadResult.errors.map((error, index) => (
                            <li key={index}>{error}</li>
                          ))}
                        </ul>
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
                <Button 
                  onClick={() => setIsOpen(false)} 
                  className="mt-4"
                >
                  Schließen
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};