import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface Upload {
  id: string;
  fileName: string;
  fileSize: number;
  category: 'general' | 'building';
  buildingId: string | null;
  buildingName?: string;
  status: 'queued' | 'uploading' | 'processing' | 'done' | 'error';
  progress: number;
  step: string;
  documentId?: string;
  error?: string;
  createdAt: Date;
  // Batch processing fields
  totalPages?: number;
  processedPages?: number;
  processingPhase?: 'pending' | 'ocr' | 'chunking' | 'embedding' | 'saving' | 'complete';
}

interface UploadContextType {
  uploads: Upload[];
  addUpload: (upload: Omit<Upload, 'id' | 'createdAt'>) => string;
  updateUpload: (id: string, updates: Partial<Upload>) => void;
  removeUpload: (id: string) => void;
  clearCompleted: () => void;
  hasActiveUploads: boolean;
}

const UploadContext = createContext<UploadContextType | undefined>(undefined);

export function UploadProvider({ children }: { children: React.ReactNode }) {
  const [uploads, setUploads] = useState<Upload[]>([]);

  // Subscribe to realtime updates for document processing
  useEffect(() => {
    const documentIds = uploads
      .filter(u => u.documentId && (u.status === 'processing' || u.status === 'uploading'))
      .map(u => u.documentId!);

    if (documentIds.length === 0) return;

    const channel = supabase
      .channel('upload-progress')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'building_documents',
          filter: `id=in.(${documentIds.join(',')})`
        },
        (payload) => {
          const doc = payload.new as any;
          
          setUploads(prev => prev.map(upload => {
            if (upload.documentId !== doc.id) return upload;
            
            // Map database status to upload status
            if (doc.status === 'ready') {
              return { 
                ...upload, 
                status: 'done', 
                progress: 100, 
                step: 'Fertig',
                processingPhase: 'complete'
              };
            } else if (doc.status === 'error') {
              return { ...upload, status: 'error', error: doc.error_message || 'Verarbeitungsfehler' };
            } else if (doc.status === 'processing') {
              return {
                ...upload,
                status: 'processing',
                progress: doc.processing_progress || upload.progress,
                step: doc.processing_step || upload.step,
                totalPages: doc.total_pages || upload.totalPages,
                processedPages: doc.processed_pages || upload.processedPages,
                processingPhase: doc.processing_phase || upload.processingPhase
              };
            }
            return upload;
          }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [uploads]);

  const addUpload = useCallback((upload: Omit<Upload, 'id' | 'createdAt'>) => {
    const id = crypto.randomUUID();
    setUploads(prev => [...prev, { ...upload, id, createdAt: new Date() }]);
    return id;
  }, []);

  const updateUpload = useCallback((id: string, updates: Partial<Upload>) => {
    setUploads(prev => prev.map(u => u.id === id ? { ...u, ...updates } : u));
  }, []);

  const removeUpload = useCallback((id: string) => {
    setUploads(prev => prev.filter(u => u.id !== id));
  }, []);

  const clearCompleted = useCallback(() => {
    setUploads(prev => prev.filter(u => u.status !== 'done' && u.status !== 'error'));
  }, []);

  const hasActiveUploads = uploads.some(u => 
    u.status === 'queued' || u.status === 'uploading' || u.status === 'processing'
  );

  return (
    <UploadContext.Provider value={{ 
      uploads, 
      addUpload, 
      updateUpload, 
      removeUpload, 
      clearCompleted,
      hasActiveUploads 
    }}>
      {children}
    </UploadContext.Provider>
  );
}

export function useUpload() {
  const context = useContext(UploadContext);
  if (!context) {
    throw new Error('useUpload must be used within an UploadProvider');
  }
  return context;
}
