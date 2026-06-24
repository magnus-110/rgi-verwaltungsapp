import { supabase } from "@/integrations/supabase/client";

export type CallLog = {
  id: string;
  direction: "incoming" | "outgoing";
  status: "verpasst" | "angenommen";
  number_raw: string | null;
  number_e164: string | null;
  contact_id: string | null;
  building_id: string | null;
  started_at: string;
  connected_at: string | null;
  ended_at: string | null;
  duration_seconds: number;
  note: string | null;
  transcript: string | null;
  handled: boolean;
  handled_at: string | null;
  created_by: string | null;
  created_at: string;
};

export function formatDuration(s: number | null | undefined): string {
  const sec = Math.max(0, Math.floor(s || 0));
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function htmlToText(html: string): string {
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const text = doc.body?.textContent ?? "";
    return text.replace(/\u00a0/g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  } catch {
    return html;
  }
}

export async function logOutgoingCall(params: {
  number: string;
  contactId?: string | null;
  buildingId?: string | null;
}) {
  try {
    const { data: u } = await supabase.auth.getUser();
    await supabase.from("call_logs").insert({
      direction: "outgoing",
      status: "verpasst",
      number_raw: params.number,
      number_e164: params.number.startsWith("+") ? params.number : null,
      contact_id: params.contactId ?? null,
      building_id: params.buildingId ?? null,
      created_by: u.user?.id ?? null,
    });
  } catch (e) {
    console.warn("logOutgoingCall failed", e);
  }
}
