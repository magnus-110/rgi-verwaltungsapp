import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FolderArchive, Sparkles, ArrowDownToLine, Download, Loader2 } from "lucide-react";
import { SaveAttachmentToBuildingDialog } from "./SaveAttachmentToBuildingDialog";
import { useImportAttachmentAsInvoice, type ImportableAttachment } from "./lib/useImportAttachmentAsInvoice";

interface EmailHtmlBodyProps {
  html: string;
  emailId: string;
}

interface InlineAttachment {
  id: string;
  file_name: string;
  file_path: string | null;
  file_size: number | null;
  mime_type: string | null;
  content_id: string | null;
  is_inline: boolean;
}

export const EmailHtmlBody = ({ html, emailId }: EmailHtmlBodyProps) => {
  const [resolvedHtml, setResolvedHtml] = useState(html);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(400);

  // signed URL -> attachment row (for matching right-clicked <img> elements)
  const urlToAttachmentRef = useRef<Map<string, InlineAttachment>>(new Map());

  // Context menu state
  const [menu, setMenu] = useState<{ x: number; y: number; att: InlineAttachment } | null>(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [savePending, setSavePending] = useState<InlineAttachment | null>(null);

  const { importAsInvoice, importingId } = useImportAttachmentAsInvoice();

  // Reset when the email changes so stale state from a previous email is dropped
  useEffect(() => {
    setResolvedHtml(html);
    setHeight(400);
    urlToAttachmentRef.current = new Map();
    setMenu(null);
  }, [emailId, html]);

  const { data: inlineAttachments = [] } = useQuery({
    queryKey: ["email-inline-attachments", emailId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_attachments")
        .select("*")
        .eq("email_id", emailId)
        .eq("is_inline", true);
      if (error) throw error;
      return data as InlineAttachment[];
    },
  });

  useEffect(() => {
    const resolve = async () => {
      if (!inlineAttachments.length) {
        setResolvedHtml(html);
        urlToAttachmentRef.current = new Map();
        return;
      }

      let processed = html;
      const map = new Map<string, InlineAttachment>();
      for (const att of inlineAttachments) {
        if (att.content_id && att.file_path) {
          try {
            const { data } = await supabase.storage
              .from("email-attachments")
              .createSignedUrl(att.file_path, 3600);

            if (data?.signedUrl) {
              map.set(data.signedUrl, att);
              const cid = att.content_id.replace(/^<|>$/g, "");
              processed = processed.replace(
                new RegExp(`cid:${cid.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "gi"),
                data.signedUrl
              );
            }
          } catch (_e) {
            // skip
          }
        }
      }
      urlToAttachmentRef.current = map;
      setResolvedHtml(processed);
    };
    resolve();
  }, [html, inlineAttachments]);

  // Wrap in a minimal doc so external links open in a new tab and basic typography is sane
  const srcDoc = useMemo(
    () => `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>
    html,body{margin:0;padding:12px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:14px;color:#222;background:#fff;word-wrap:break-word;}
    img{max-width:100%;height:auto;}
    img[data-rgi-inline]{cursor:context-menu;}
    a{color:#2563eb;}
    table{max-width:100%;}
  </style></head><body>${resolvedHtml}</body></html>`,
    [resolvedHtml]
  );

  const attachContextMenuHandlers = () => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    const map = urlToAttachmentRef.current;
    const imgs = doc.querySelectorAll("img");
    imgs.forEach((img) => {
      const src = (img as HTMLImageElement).src;
      const att = map.get(src);
      if (!att) return;
      (img as HTMLImageElement).setAttribute("data-rgi-inline", "1");
      (img as HTMLImageElement).title = "Rechtsklick für Aktionen";
      (img as HTMLImageElement).oncontextmenu = (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const iframeRect = iframeRef.current?.getBoundingClientRect();
        if (!iframeRect) return;
        // Coordinates inside the iframe document → translate to viewport
        setMenu({
          x: iframeRect.left + e.clientX,
          y: iframeRect.top + e.clientY,
          att,
        });
      };
    });
  };

  const onLoad = () => {
    try {
      const doc = iframeRef.current?.contentDocument;
      if (doc) {
        const h = Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight);
        setHeight(h + 16);
        attachContextMenuHandlers();
      }
    } catch {
      // cross-origin guard — ignore
    }
  };

  // Re-bind whenever the resolved HTML or the inline attachment map changes
  useEffect(() => {
    const t = setTimeout(() => attachContextMenuHandlers(), 50);
    return () => clearTimeout(t);
  }, [resolvedHtml, inlineAttachments.length]);

  // Close menu on outside scroll/click
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [menu]);

  const handleDownload = async (att: InlineAttachment) => {
    if (!att.file_path) return;
    const { data } = await supabase.storage
      .from("email-attachments")
      .createSignedUrl(att.file_path, 300);
    if (data?.signedUrl) {
      const a = document.createElement("a");
      a.href = data.signedUrl;
      a.download = att.file_name;
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  return (
    <>
      <iframe
        key={emailId}
        ref={iframeRef}
        title="E-Mail-Inhalt"
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        srcDoc={srcDoc}
        onLoad={onLoad}
        style={{ width: "100%", border: "none", height }}
      />

      {/* Inline-image context menu (positioned via DropdownMenu with hidden trigger) */}
      {menu && (
        <DropdownMenu open onOpenChange={(o) => { if (!o) setMenu(null); }}>
          <DropdownMenuTrigger asChild>
            <button
              aria-hidden
              tabIndex={-1}
              style={{
                position: "fixed",
                left: menu.x,
                top: menu.y,
                width: 1,
                height: 1,
                opacity: 0,
                pointerEvents: "none",
              }}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" sideOffset={4}>
            <DropdownMenuItem
              onClick={() => {
                setSavePending(menu.att);
                setSaveDialogOpen(true);
                setMenu(null);
              }}
            >
              <FolderArchive className="h-3.5 w-3.5 mr-2" />
              Im Gebäude / DMS speichern
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={importingId === menu.att.id}
              onClick={() => {
                const att = menu.att;
                setMenu(null);
                importAsInvoice(att as ImportableAttachment, false);
              }}
            >
              {importingId === menu.att.id ? (
                <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 mr-2" />
              )}
              Als Rechnung importieren
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={importingId === menu.att.id}
              onClick={() => {
                const att = menu.att;
                setMenu(null);
                importAsInvoice(att as ImportableAttachment, true);
              }}
            >
              <ArrowDownToLine className="h-3.5 w-3.5 mr-2 text-green-600" />
              Als Beleg / Zahlungseingang
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                const att = menu.att;
                setMenu(null);
                handleDownload(att);
              }}
            >
              <Download className="h-3.5 w-3.5 mr-2" />
              Bild herunterladen
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <SaveAttachmentToBuildingDialog
        open={saveDialogOpen}
        onOpenChange={setSaveDialogOpen}
        attachments={
          savePending && savePending.file_path
            ? [{
                name: savePending.file_name,
                path: savePending.file_path,
                size: savePending.file_size ? Number(savePending.file_size) : null,
                mimeType: savePending.mime_type,
              }]
            : []
        }
        emailId={emailId}
      />
    </>
  );
};
