import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Die E-Mails, die an einem Vorgang hängen.
 *
 * Bisher stand in der Akte nur die KI-Zusammenfassung und ein Verweis. Wer
 * wissen wollte, was wirklich geschrieben wurde, musste ins Postfach wechseln
 * und suchen. Hier kommt der echte Text mit.
 */

export interface CaseEmail {
  id: string;
  subject: string | null;
  from_name: string | null;
  from_address: string | null;
  to_addresses: string[] | null;
  to_names: string[] | null;
  date: string | null;
  body_text: string | null;
  body_html: string | null;
  has_attachments: boolean | null;
  is_draft: boolean | null;
}

/**
 * HTML zu lesbarem Text machen.
 *
 * Bewusst kein dangerouslySetInnerHTML: fremdes HTML aus eingehenden Mails
 * gehört nicht ungeprüft in die Seite. Lieber schlichter Text.
 */
export function htmlZuText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Der Fließtext einer Mail, egal in welcher Form sie ankam. */
export function mailText(mail: CaseEmail): string {
  if (mail.body_text && mail.body_text.trim()) return mail.body_text.trim();
  if (mail.body_html) return htmlZuText(mail.body_html);
  return '';
}

/** Alle Mails eines Vorgangs, nach ihrer Kennung greifbar. */
export function useCaseEmails(caseId: string | null) {
  return useQuery({
    queryKey: ['case-emails', caseId],
    enabled: !!caseId,
    queryFn: async (): Promise<Map<string, CaseEmail>> => {
      const { data, error } = await supabase
        .from('emails')
        .select(
          'id, subject, from_name, from_address, to_addresses, to_names, date, body_text, body_html, has_attachments, is_draft'
        )
        .eq('case_id', caseId!)
        .is('deleted_at', null)
        .order('date', { ascending: false });
      if (error) throw error;

      const map = new Map<string, CaseEmail>();
      ((data || []) as any[]).forEach(m => map.set(m.id, m as CaseEmail));
      return map;
    },
  });
}
