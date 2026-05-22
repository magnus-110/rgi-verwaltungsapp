import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useRef, useState } from "react";

interface EmailHtmlBodyProps {
  html: string;
  emailId: string;
}

export const EmailHtmlBody = ({ html, emailId }: EmailHtmlBodyProps) => {
  const [resolvedHtml, setResolvedHtml] = useState(html);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(400);

  const { data: inlineAttachments = [] } = useQuery({
    queryKey: ["email-inline-attachments", emailId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_attachments")
        .select("*")
        .eq("email_id", emailId)
        .eq("is_inline", true);
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    const resolve = async () => {
      if (!inlineAttachments.length) {
        setResolvedHtml(html);
        return;
      }

      let processed = html;
      for (const att of inlineAttachments) {
        if (att.content_id && att.file_path) {
          try {
            const { data } = await supabase.storage
              .from("email-attachments")
              .createSignedUrl(att.file_path, 3600);

            if (data?.signedUrl) {
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
      setResolvedHtml(processed);
    };
    resolve();
  }, [html, inlineAttachments]);

  // Wrap in a minimal doc so external links open in a new tab and basic typography is sane
  const srcDoc = `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>
    html,body{margin:0;padding:12px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:14px;color:#222;background:#fff;word-wrap:break-word;}
    img{max-width:100%;height:auto;}
    a{color:#2563eb;}
    table{max-width:100%;}
  </style></head><body>${resolvedHtml}</body></html>`;

  const onLoad = () => {
    try {
      const doc = iframeRef.current?.contentDocument;
      if (doc) {
        const h = Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight);
        setHeight(h + 16);
      }
    } catch {
      // cross-origin guard — ignore
    }
  };

  return (
    <iframe
      ref={iframeRef}
      title="E-Mail-Inhalt"
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      srcDoc={srcDoc}
      onLoad={onLoad}
      style={{ width: "100%", border: "none", height }}
    />
  );
};
