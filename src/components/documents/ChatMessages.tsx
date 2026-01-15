import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { FileText, ExternalLink, Wifi, ChevronDown, Copy, Check, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { PdfViewerModal } from "./PdfViewerModal";
import * as XLSX from "xlsx";

interface ChatSource {
  content: string;
  metadata: any;
  buildingId?: string;
  documentId?: string;
  fileName?: string;
  documentUrl?: string;
  pageNumber?: number;
  type?: 'web' | 'document';
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: ChatSource[];
  created_at: string;
}

interface ChatMessagesProps {
  messages: ChatMessage[];
  isLoading: boolean;
}

// Table wrapper component with copy and Excel export buttons
function CopyableTable({ children }: { children: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const tableRef = React.useRef<HTMLDivElement>(null);

  const getTableData = () => {
    if (!tableRef.current) return null;
    
    const table = tableRef.current.querySelector('table');
    if (!table) return null;

    const rows = table.querySelectorAll('tr');
    const data: string[][] = [];
    
    rows.forEach(row => {
      const cells = row.querySelectorAll('th, td');
      const rowData = Array.from(cells).map(cell => cell.textContent?.trim() || '');
      data.push(rowData);
    });

    return data;
  };

  const handleCopyTable = async () => {
    const data = getTableData();
    if (!data) return;

    const text = data.map(row => row.join('\t')).join('\n');

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy table:', err);
    }
  };

  const handleExportExcel = () => {
    const data = getTableData();
    if (!data || data.length === 0) return;

    // Create workbook and worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);

    // Auto-size columns
    const colWidths = data[0].map((_, colIndex) => {
      const maxLength = Math.max(
        ...data.map(row => (row[colIndex] || '').length)
      );
      return { wch: Math.min(Math.max(maxLength, 10), 50) };
    });
    ws['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, 'Daten');

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `NOVA_Export_${timestamp}.xlsx`);
  };

  return (
    <div className="relative my-4" ref={tableRef}>
      <div className="absolute -top-2 -right-2 z-10 flex gap-1">
        <button
          onClick={handleExportExcel}
          className={cn(
            "p-1.5 rounded-md transition-all duration-200",
            "bg-background/90 hover:bg-muted border border-border/50 shadow-sm"
          )}
          title="Als Excel exportieren"
        >
          <Download className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
        <button
          onClick={handleCopyTable}
          className={cn(
            "p-1.5 rounded-md transition-all duration-200",
            "bg-background/90 hover:bg-muted border border-border/50 shadow-sm"
          )}
          title="Tabelle kopieren"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-green-500" />
          ) : (
            <Copy className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </button>
      </div>
      <div className="w-full overflow-auto rounded-lg border border-border">
        <table className="w-full text-sm border-collapse">
          {children}
        </table>
      </div>
    </div>
  );
}

// Ersetzt <br> und <br/> Tags durch echte Zeilenumbrüche
const preprocessContent = (content: string): string => {
  return content.replace(/<br\s*\/?>/gi, '\n');
};

export function ChatMessages({ messages, isLoading }: ChatMessagesProps) {
  const [pdfViewerOpen, setPdfViewerOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<{
    url: string | null;
    name: string;
    page: number;
  } | null>(null);
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  const handleCopy = async (content: string, messageId: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMessageId(messageId);
      setTimeout(() => setCopiedMessageId(null), 2000);
    } catch (err) {
      console.error('Failed to copy message:', err);
    }
  };

  const handleSourceClick = (source: ChatSource) => {
    if (source.documentUrl) {
      let page = 1;
      if (source.pageNumber !== undefined && source.pageNumber !== null) {
        const parsed = typeof source.pageNumber === 'string' 
          ? parseInt(source.pageNumber, 10) 
          : source.pageNumber;
        if (!isNaN(parsed) && parsed > 0) {
          page = parsed;
        }
      }
      
      setSelectedDocument({
        url: source.documentUrl,
        name: source.fileName || 'Dokument',
        page
      });
      setPdfViewerOpen(true);
    }
  };

  const closePdfViewer = () => {
    setPdfViewerOpen(false);
    setSelectedDocument(null);
  };

  const toggleSources = (messageId: string) => {
    setExpandedSources(prev => {
      const newSet = new Set(prev);
      if (newSet.has(messageId)) {
        newSet.delete(messageId);
      } else {
        newSet.add(messageId);
      }
      return newSet;
    });
  };

  return (
    <>
      <div className="space-y-6 max-w-3xl mx-auto">
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              "flex group",
              message.role === 'user' ? "justify-end" : "justify-start"
            )}
          >
            <div className="relative max-w-[85%]">
              <div
                className={cn(
                  message.role === 'user'
                    ? "bg-primary text-primary-foreground rounded-3xl px-5 py-3"
                    : ""
                )}
              >
                {message.role === 'user' ? (
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">
                    {message.content}
                  </p>
                ) : (
                  <div className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-headings:font-semibold prose-headings:text-foreground prose-p:text-foreground prose-li:text-foreground prose-strong:text-foreground prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        h1: ({ children }) => <h2 className="text-lg font-semibold mt-4 mb-2 first:mt-0">{children}</h2>,
                        h2: ({ children }) => <h3 className="text-base font-semibold mt-4 mb-2 first:mt-0">{children}</h3>,
                        h3: ({ children }) => <h4 className="text-sm font-semibold mt-3 mb-1.5">{children}</h4>,
                        h4: ({ children }) => <h5 className="text-sm font-medium mt-3 mb-1.5">{children}</h5>,
                        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                        ul: ({ children }) => <ul className="list-disc pl-5 mb-2">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal pl-5 mb-2">{children}</ol>,
                        li: ({ children }) => <li className="mb-0.5">{children}</li>,
                        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                        em: ({ children }) => <em className="italic">{children}</em>,
                        code: ({ children }) => (
                          <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">
                            {children}
                          </code>
                        ),
                        blockquote: ({ children }) => (
                          <blockquote className="border-l-2 border-primary/30 pl-4 italic text-muted-foreground my-2">
                            {children}
                          </blockquote>
                        ),
                        hr: () => <hr className="my-4 border-border" />,
                        table: ({ children }) => (
                          <CopyableTable>{children}</CopyableTable>
                        ),
                        thead: ({ children }) => (
                          <thead className="bg-muted/50 border-b border-border">
                            {children}
                          </thead>
                        ),
                        tbody: ({ children }) => (
                          <tbody className="divide-y divide-border">
                            {children}
                          </tbody>
                        ),
                        tr: ({ children }) => (
                          <tr className="hover:bg-muted/30 transition-colors">
                            {children}
                          </tr>
                        ),
                        th: ({ children }) => (
                          <th className="px-4 py-2 text-left font-semibold text-foreground whitespace-nowrap">
                            {children}
                          </th>
                        ),
                        td: ({ children }) => (
                          <td className="px-4 py-2 text-foreground whitespace-pre-line">
                            {children}
                          </td>
                        ),
                      }}
                    >
                      {preprocessContent(message.content)}
                    </ReactMarkdown>
                  </div>
                )}
                
                {/* Collapsible Sources */}
                {message.role === 'assistant' && message.sources && message.sources.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-border/50">
                    <button
                      onClick={() => toggleSources(message.id)}
                      className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <FileText className="h-3 w-3" />
                      <span>Quellen ({message.sources.length})</span>
                      <ChevronDown className={cn(
                        "h-3 w-3 transition-transform duration-200",
                        expandedSources.has(message.id) && "rotate-180"
                      )} />
                    </button>
                    
                    {expandedSources.has(message.id) && (
                      <div className="mt-3 flex flex-wrap gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
                        {message.sources.map((source, index) => {
                          const isWebSource = source.type === 'web';
                          const hasLink = !!source.documentUrl;
                          const displayName = isWebSource 
                            ? (source.fileName && source.fileName !== 'Internet-Suche' ? source.fileName : 'Internet-Suche')
                            : source.fileName || source.metadata?.section || `Dokument ${index + 1}`;
                          
                          // Parse page number for display
                          let pageNum: number | null = null;
                          if (source.pageNumber !== undefined && source.pageNumber !== null) {
                            const parsed = typeof source.pageNumber === 'string' 
                              ? parseInt(source.pageNumber, 10) 
                              : source.pageNumber;
                            if (!isNaN(parsed) && parsed > 0) {
                              pageNum = parsed;
                            }
                          }
                          
                          if (isWebSource) {
                            const webUrl = source.documentUrl || source.metadata?.url;
                            return (
                              <a
                                key={index}
                                href={webUrl || '#'}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={cn(
                                  "inline-flex items-center gap-1.5 text-xs rounded-full px-3 py-1.5 transition-colors",
                                  webUrl 
                                    ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 hover:bg-orange-200 dark:hover:bg-orange-900/50 cursor-pointer"
                                    : "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 cursor-default"
                                )}
                              >
                                <Wifi className="h-3 w-3 flex-shrink-0" />
                                <span className="font-medium truncate max-w-[200px]">
                                  {displayName}
                                </span>
                                {webUrl && (
                                  <ExternalLink className="h-3 w-3 opacity-50 flex-shrink-0" />
                                )}
                              </a>
                            );
                          }
                          
                          return (
                            <button
                              key={index}
                              onClick={() => handleSourceClick(source)}
                              disabled={!hasLink}
                              className={cn(
                                "inline-flex items-center gap-1.5 text-xs rounded-full px-3 py-1.5 transition-colors",
                                hasLink 
                                  ? "bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer" 
                                  : "bg-muted text-muted-foreground cursor-default"
                              )}
                            >
                              <FileText className="h-3 w-3 flex-shrink-0" />
                              {pageNum && (
                                <span className="font-semibold flex-shrink-0">
                                  S. {pageNum}
                                </span>
                              )}
                              <span className="font-medium truncate max-w-[150px]">
                                {displayName}
                              </span>
                              {hasLink && (
                                <ExternalLink className="h-3 w-3 opacity-50 flex-shrink-0" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Copy Button - bottom right, appears on hover */}
              <button
                onClick={() => handleCopy(message.content, message.id)}
                className={cn(
                  "absolute -bottom-2 -right-2 p-1.5 rounded-md transition-all duration-200",
                  "opacity-0 group-hover:opacity-100",
                  "bg-background/80 hover:bg-muted border border-border/50 shadow-sm"
                )}
                title="Kopieren"
              >
                {copiedMessageId === message.id ? (
                  <Check className="h-3.5 w-3.5 text-green-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </button>
            </div>
          </div>
        ))}

        {/* Loading indicator */}
        {isLoading && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* PDF Viewer Modal */}
      <PdfViewerModal
        isOpen={pdfViewerOpen}
        onClose={closePdfViewer}
        documentUrl={selectedDocument?.url || null}
        documentName={selectedDocument?.name || ''}
        initialPage={selectedDocument?.page || 1}
      />
    </>
  );
}