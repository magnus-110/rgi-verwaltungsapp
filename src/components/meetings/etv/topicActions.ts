import { supabase } from "@/integrations/supabase/client";
import type { Topic, TopicStatus } from "./useEtvData";

const db = supabase as any;

async function upsertState(t: Topic, patch: {
  status: TopicStatus;
  outcome?: string | null;
  reason?: string | null;
  meeting_id?: string | null;
  agenda_item_id?: string | null;
  merged_into?: string | null;
}) {
  const { error } = await db.from("etv_topic_states").upsert(
    {
      source_type: t.source,
      source_id: t.id,
      building_id: t.buildingId,
      outcome: null,
      reason: null,
      meeting_id: null,
      agenda_item_id: null,
      merged_into: null,
      ...patch,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "source_type,source_id" },
  );
  if (error) throw error;
}

/** Spiegel für das Eigentümerportal: der Einreicher sieht den Stand seines Antrags. */
async function mirrorPortal(t: Topic, status: string, extra: Record<string, any> = {}) {
  if (t.source !== "portal") return;
  const { error } = await supabase
    .from("etv_submitted_tops")
    .update({ status, updated_at: new Date().toISOString(), ...extra })
    .eq("id", t.id);
  if (error) throw error;
}

/** Nächste freie Position in der Tagesordnung. */
async function nextSortOrder(meetingId: string) {
  const { data } = await supabase
    .from("etv_agenda_items")
    .select("sort_order")
    .eq("meeting_id", meetingId)
    .order("sort_order", { ascending: false })
    .limit(1);
  return ((data?.[0]?.sort_order as number) || 0) + 1;
}

/**
 * Thema in die Tagesordnung übernehmen.
 * meetingId = null → vorgemerkt für die nächste Versammlung dieser WEG.
 */
export async function adoptTopic(
  t: Topic,
  opts: { meetingId: string | null; title: string; description: string; resolution: string; votingPrinciple?: string | null; bundled?: Topic[] },
) {
  if (!opts.meetingId) {
    await upsertState(t, { status: "eingeplant", reason: "Für die nächste Versammlung vorgemerkt" });
    await mirrorPortal(t, "accepted");
    return { sortOrder: null };
  }
  const sortOrder = await nextSortOrder(opts.meetingId);
  const attachments = [...(t.attachments || []), ...(opts.bundled || []).flatMap((b) => b.attachments || [])];
  const { data: item, error } = await supabase
    .from("etv_agenda_items")
    .insert({
      meeting_id: opts.meetingId,
      sort_order: sortOrder,
      title: opts.title,
      description: opts.description || null,
      resolution_text: opts.resolution || null,
      voting_principle: opts.votingPrinciple || "headcount",
      category: "sonstiges",
      requires_resolution: true,
      attachment_paths: attachments.length ? attachments : null,
      submitted_by_user_id: t.source === "portal" ? t.raw?.submitted_by_user_id || null : null,
    } as any)
    .select("id")
    .single();
  if (error) throw error;

  const all = [t, ...(opts.bundled || [])];
  for (const x of all) {
    await upsertState(x, { status: "eingeplant", meeting_id: opts.meetingId, agenda_item_id: item.id });
    await mirrorPortal(x, "accepted", { accepted_into_meeting_id: opts.meetingId });
    if (x.source === "email") {
      await db.from("emails").update({ etv_meeting_id: opts.meetingId, etv_agenda_item_id: item.id }).eq("id", x.id);
    }
  }
  return { sortOrder };
}

export async function deferTopic(t: Topic, reason: string) {
  await upsertState(t, { status: "zurueckgestellt", reason });
  await mirrorPortal(t, "deferred", { admin_notes: reason || null });
}

export async function resolveTopic(t: Topic, outcome: "ohne_versammlung" | "abgelehnt", reason: string) {
  await upsertState(t, { status: "erledigt", outcome, reason });
  await mirrorPortal(t, outcome === "abgelehnt" ? "rejected" : "resolved", { admin_notes: reason || null });
}

/** Zurück auf „Neu“. */
export async function reopenTopic(t: Topic) {
  const { error } = await db.from("etv_topic_states").delete().eq("source_type", t.source).eq("source_id", t.id);
  if (error) throw error;
  await mirrorPortal(t, "pending", { accepted_into_meeting_id: null });
  if (t.source === "email") {
    await db.from("emails").update({ etv_meeting_id: null, etv_agenda_item_id: null }).eq("id", t.id);
  }
  // Ohne Statuszeile fällt ein Portal-Antrag auf „pending“ und eine Notiz auf „neu“ zurück.
}

/** Mehrere Einträge zu einem Thema bündeln: die anderen hängen am Hauptthema. */
export async function bundleTopics(main: Topic, others: Topic[]) {
  for (const o of others) {
    await upsertState(o, { status: "erledigt", outcome: "gebuendelt", merged_into: main.key, reason: `Gebündelt mit „${main.title}“` });
  }
}
