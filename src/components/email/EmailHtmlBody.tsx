import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";

interface EmailHtmlBodyProps {
  html: string;
  emailId: string;
}

export const EmailHtmlBody = ({ html, emailId }: EmailHtmlBodyProps) => {
  const [resolvedHtml, setResolvedHtml] = useState(html);

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

  return (
    <div
      className="prose prose-sm max-w-none dark:prose-invert"
      dangerouslySetInnerHTML={{ __html: resolvedHtml }}
    />
  );
};
