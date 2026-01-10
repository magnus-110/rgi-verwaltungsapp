import React, { useState, lazy, Suspense, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Download, Loader2, ZoomIn, ZoomOut, AlertCircle } from "lucide-react";

// Lazy load react-pdf components
const Document = lazy(() => import("react-pdf").then(mod => ({ default: mod.Document })));
const Page = lazy(() => import("react-pdf").then(mod => ({ default: mod.Page })));

// Set up worker for react-pdf - use Vite's ?url import for proper bundling
import { pdfjs } from "react-pdf";
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

interface PdfViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentUrl: string | null;
  documentName: string;
  initialPage?: number;
}

export function PdfViewerModal({
  isOpen,
  onClose,
  documentUrl,
  documentName,
  initialPage = 1,
}: PdfViewerModalProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(initialPage);
  const [scale, setScale] = useState(1.0);
  const [isLoading, setIsLoading] = useState(true);
  const [pdfData, setPdfData] = useState<Uint8Array | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Fetch PDF data when URL changes to avoid CORS issues with pdfjs worker
  useEffect(() => {
    if (!documentUrl || !isOpen) {
      setPdfData(null);
      setLoadError(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);
    setPdfData(null);

    const fetchPdf = async () => {
      try {
        const response = await fetch(documentUrl, {
          method: 'GET',
          mode: 'cors',
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        
        if (!cancelled) {
          // Convert to Uint8Array to prevent "detached ArrayBuffer" errors on re-renders
          setPdfData(new Uint8Array(arrayBuffer));
        }
      } catch (error) {
        console.error("Error fetching PDF:", error);
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Fehler beim Laden des PDFs");
          setIsLoading(false);
        }
      }
    };

    fetchPdf();

    return () => {
      cancelled = true;
    };
  }, [documentUrl, isOpen]);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setPageNumber(Math.min(initialPage, numPages));
    setIsLoading(false);
  };

  const onDocumentLoadError = (error: Error) => {
    console.error("Error loading PDF document:", error);
    setLoadError("PDF konnte nicht verarbeitet werden");
    setIsLoading(false);
  };

  const goToPrevPage = () => {
    setPageNumber((prev) => Math.max(prev - 1, 1));
  };

  const goToNextPage = () => {
    if (numPages) {
      setPageNumber((prev) => Math.min(prev + 1, numPages));
    }
  };

  const zoomIn = () => {
    setScale((prev) => Math.min(prev + 0.25, 2.5));
  };

  const zoomOut = () => {
    setScale((prev) => Math.max(prev - 0.25, 0.5));
  };

  const handleDownload = () => {
    if (documentUrl) {
      window.open(documentUrl, "_blank");
    }
  };

  // Reset state when modal closes
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setIsLoading(true);
      setPageNumber(initialPage);
      setScale(1.0);
      setNumPages(null);
      setPdfData(null);
      setLoadError(null);
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-4 py-3 border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-sm font-medium truncate pr-4">
              {documentName}
            </DialogTitle>
            <div className="flex items-center gap-2 mr-8">
              {/* Zoom controls */}
              <div className="flex items-center gap-1 border-r pr-2 mr-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={zoomOut}
                  disabled={scale <= 0.5}
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="text-xs text-muted-foreground w-12 text-center">
                  {Math.round(scale * 100)}%
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={zoomIn}
                  disabled={scale >= 2.5}
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
              </div>

              {/* Page navigation */}
              <div className="flex items-center gap-1 border-r pr-2 mr-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={goToPrevPage}
                  disabled={pageNumber <= 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs text-muted-foreground min-w-[60px] text-center">
                  {pageNumber} / {numPages || "..."}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={goToNextPage}
                  disabled={!numPages || pageNumber >= numPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              {/* Download button */}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleDownload}
              >
                <Download className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* PDF Content */}
        <div className="flex-1 overflow-auto bg-muted/30 flex items-start justify-center p-4">
          {isLoading && !loadError && (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">PDF wird geladen...</span>
            </div>
          )}

          {loadError && (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
              <AlertCircle className="h-10 w-10 text-destructive" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">Fehler beim Laden</p>
                <p className="text-xs text-muted-foreground max-w-xs">{loadError}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownload}
                className="mt-2"
              >
                <Download className="h-4 w-4 mr-2" />
                PDF extern öffnen
              </Button>
            </div>
          )}

          {pdfData && !loadError && (
            <Suspense
              fallback={
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              }
            >
              <Document
                file={{ data: pdfData }}
                onLoadSuccess={onDocumentLoadSuccess}
                onLoadError={onDocumentLoadError}
                loading={
                  <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                }
                className="shadow-lg"
              >
                <Page
                  pageNumber={pageNumber}
                  scale={scale}
                  loading={
                    <div className="flex items-center justify-center py-20 min-h-[400px]">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  }
                  className="bg-white"
                />
              </Document>
            </Suspense>
          )}

          {!documentUrl && !isLoading && (
            <div className="flex items-center justify-center py-20 text-muted-foreground">
              Dokument konnte nicht geladen werden
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
