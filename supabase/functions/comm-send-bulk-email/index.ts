// Rundmail-Versand über das gewählte SMTP-Konto — als Warteschlange im Hintergrund.
//
// Warum so: Früher wurden alle Empfänger in EINEM Funktionsaufruf abgearbeitet.
// Bei 80–100 Mails mit Anhängen lief dabei das CPU-Kontingent eines einzelnen
// Aufrufs voll und die Funktion wurde mitten im Versand abgebrochen.
//
// Ablauf jetzt:
//  1. Start (aus der App oder vom Zeitplaner): Empfänger ermitteln und als
//     Warteschlange in `comm_recipients` ablegen (status = 'pending').
//     Die Antwort kommt sofort — der Versand läuft im Hintergrund weiter.
//  2. Arbeitspaket (`continue`): verschickt eine kleine Menge Mails, schreibt
//     den Fortschritt und ruft sich danach selbst für das nächste Paket auf.
//     Jedes Paket ist ein eigener Aufruf mit frischem CPU-Kontingent.
//  3. Sicherheitsnetz: bleibt ein Versand hängen (kein Fortschritt seit einigen
//     Minuten), setzen ihn der minütliche Zeitplaner (`comm-dispatch-scheduled`)
//     oder die App („Fortsetzen“) wieder in Gang.
//
// Doppelversand wird verhindert, indem jeder Empfänger vor dem Senden einzeln
// „reserviert“ wird (bedingtes Update: nur wer die Zeile noch offen vorfindet,
// darf senden). Es werden keine neuen Tabellen oder Spalten benötigt:
//   status 'pending' + error NULL            → wartet
//   status 'pending' + error '__sending__'   → wird gerade gesendet (sent_at = Reservierungszeit)
//   status 'sent' / 'failed'                 → erledigt
//
// Test-Mails (`test_email`) werden weiterhin direkt versendet.

// @ts-ignore - EdgeRuntime is a Supabase Edge Functions global
declare const EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void };

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";
import nodemailer from "npm:nodemailer@6.9.16";
import { Buffer } from "node:buffer";
import { loadRecipients, renderString, RecipientFilter } from "../_shared/comm-vars.ts";
import { requireAdmin } from "../_shared/require-admin.ts";
import { looksLikeHtml, textToHtmlWithLinks } from "../_shared/text-to-html.ts";

// ---------------------------------------------------------------------------
// Stellschrauben
// ---------------------------------------------------------------------------

/** Höchstens so viele Mails pro Arbeitspaket (= pro Funktionsaufruf). */
const BATCH_MAX_MAILS = 8;
/** Nach dieser Laufzeit wird das Paket beendet und das nächste gestartet. */
const BATCH_MAX_MS = 30_000;
/** Summe der Anhangsgrößen pro Paket — große Anhänge kosten beim Kodieren CPU. */
const BATCH_MAX_ATTACHMENT_BYTES = 40 * 1024 * 1024;
/** Pause zwischen zwei Mails (schont den Postausgangsserver). */
const DELAY_BETWEEN_MAILS_MS = 1000;
/** Ohne Fortschritt seit dieser Zeit gilt ein Versand als hängengeblieben. */
const STALE_HEARTBEAT_MS = 3 * 60_000;
/** Eine Reservierung, die älter ist, stammt von einem abgebrochenen Aufruf
 *  (eine einzelne Mail dauert dank der SMTP-Timeouts höchstens ca. 2 Minuten). */
const STALE_CLAIM_MS = 150_000;

/** Kommt ein Versand so lange gar nicht voran, wird er als fehlgeschlagen beendet. */
const NO_PROGRESS_FAIL_MS = 30 * 60_000;

const SENDING_MARK = "__sending__";
const ASSIGNMENT_VAR = "__assignment_id";

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  txt: "text/plain",
  csv: "text/csv",
  zip: "application/zip",
};
function guessMime(name?: string) {
  const ext = (name || "").split(".").pop()?.toLowerCase() || "";
  return MIME_BY_EXT[ext] || "application/octet-stream";
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Admin = ReturnType<typeof createClient>;
/** sourceKey = Dateiname im Speicher (mit Upload-Zeitstempel, daher eindeutig je Upload). */
type Attachment = { filename: string; content: Uint8Array; sourceKey: string; sentCopyPath?: string };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
const toBuffer = (u8: Uint8Array) => Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength);

// ---------------------------------------------------------------------------
// Einstieg
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  let lockedCampaignId: string | null = null;

  try {
    // --- Nur Admins/Mitarbeiter (oder interne Aufrufe mit Service-Key) ---
    const auth = await requireAdmin(req, corsHeaders);
    if (!auth.ok) return auth.response;

    const payload = await req.json().catch(() => ({}));
    const { campaign_id, test_email, retry_failed_only, from_scheduler } = payload as Record<string, any>;
    if (!campaign_id) return json({ error: "campaign_id required" }, 400);

    // --- Arbeitspaket / Fortsetzen ---
    if (payload.continue) {
      return await handleContinue(admin, campaign_id, payload.chain === true && auth.role === "service");
    }

    const ctx = await loadContext(admin, campaign_id);
    if ("error" in ctx) {
      if (from_scheduler === true && auth.role === "service") {
        // Der Zeitplaner hat den Status schon auf 'sending' gesetzt — sonst bliebe die Rundmail hängen
        await admin.from("comm_campaigns").update({ status: "failed", error_message: ctx.error }).eq("id", campaign_id);
      }
      return json({ error: ctx.error }, ctx.status);
    }
    const { campaign, account } = ctx;

    // --- Test-Mail: direkt senden ---
    if (test_email) {
      const filter = (campaign.recipient_filter || {}) as RecipientFilter;
      const freeVars = (campaign.free_vars || {}) as Record<string, string>;
      const recipients = await loadRecipients(
        admin, campaign.building_id, { ...filter, require_email: false, expand_all_emails: true }, freeVars,
      );
      const sample = recipients[0]?.vars || freeVars;
      const attachments = await downloadAttachments(admin, (campaign.attachment_paths || []) as string[]);
      const transporter = createTransport(account, false);
      try {
        await transporter.sendMail({
          from: `${account.display_name} <${account.email_address}>`,
          to: test_email,
          subject: `[TEST] ${renderString(ctx.subject, sample)}`,
          ...buildBody(ctx, composeBody(ctx, renderString(ctx.bodyHtml, sample))),
          attachments: attachments.map((a) => ({ filename: a.filename, content: toBuffer(a.content) })),
        });
      } finally {
        transporter.close();
      }
      return json({ success: true, test: true });
    }

    // --- Versand starten: Rundmail für diesen Start sperren ---
    // Der Zeitplaner hat den Status bereits selbst auf 'sending' gesetzt.
    const isScheduler = from_scheduler === true && auth.role === "service";
    if (!isScheduler) {
      const staleIso = new Date(Date.now() - STALE_HEARTBEAT_MS).toISOString();
      const { data: locked, error: lockErr } = await admin
        .from("comm_campaigns")
        .update({ status: "sending", completed_at: null })
        .eq("id", campaign_id)
        .or(`status.neq.sending,updated_at.lt.${staleIso}`)
        .select("id");
      if (lockErr) throw lockErr;
      if (!locked || locked.length === 0) {
        return json({ error: "Diese Rundmail wird gerade schon versendet." }, 409);
      }
    }
    lockedCampaignId = campaign_id;

    // Reservierungen eines abgebrochenen früheren Laufs zuerst auflösen
    await releaseStaleClaims(admin, campaign_id);

    // Verschickt ein vorheriger Lauf gerade noch eine Mail? Dann nicht dazwischenfunken.
    const { inFlight: busyNow } = await pendingCounts(admin, campaign_id);
    if (busyNow > 0) {
      await admin
        .from("comm_campaigns")
        .update({
          status: "failed",
          error_message: "Der vorherige Versand beendet gerade noch eine E-Mail. Bitte in 2–3 Minuten erneut senden.",
        })
        .eq("id", campaign_id);
      lockedCampaignId = null;
      return json({ error: "Der vorherige Versand beendet gerade noch eine E-Mail. Bitte in 2–3 Minuten erneut senden." }, 409);
    }

    let queued = 0;
    let alreadySent = 0;
    let warning: string | null = null;

    if (retry_failed_only) {
      const { data: requeued, error: rqErr } = await admin
        .from("comm_recipients")
        .update({ status: "pending", error: null, sent_at: null })
        .eq("campaign_id", campaign_id)
        .eq("status", "failed")
        .not("email", "is", null)
        .select("id");
      if (rqErr) throw rqErr;
      queued = requeued?.length || 0;
      if (queued === 0) {
        await finalizeCampaign(admin, campaign_id);
        lockedCampaignId = null;
        return json({ error: "Keine fehlgeschlagenen Empfänger vorhanden" }, 400);
      }
    } else {
      const filter = (campaign.recipient_filter || {}) as RecipientFilter;
      const freeVars = (campaign.free_vars || {}) as Record<string, string>;
      // Erst OHNE E-Mail-Pflicht laden, um „ausgewählt, aber keine Adresse“ zu erkennen
      const allSelected = await loadRecipients(
        admin, campaign.building_id, { ...filter, require_email: false, expand_all_emails: true }, freeVars,
      );
      const recipients = allSelected.filter((r) => !!r.email);
      const missing = allSelected.length - recipients.length;

      // Ausgewählte Schlüssel, die der Server nicht auflösen konnte — dürfen nicht lautlos verschwinden
      const wantedKeys = (filter.recipient_keys || []) as string[];
      const resolvedKeys = new Set(
        allSelected.map((r) => `${r.assignment_id ?? ""}|${(r.email || "").toLowerCase()}`),
      );
      const skippedKeys = wantedKeys.filter((k) => !resolvedKeys.has(k));
      if (skippedKeys.length > 0) {
        console.warn(`[comm-send-bulk-email] campaign=${campaign_id} nicht auflösbare Empfänger:`, skippedKeys);
        warning = `${skippedKeys.length} ausgewählte Empfänger konnten nicht zugeordnet werden (evtl. Adresse im Adressbuch geändert). Bitte Auswahl prüfen.`;
      }
      console.log(
        `[comm-send-bulk-email] campaign=${campaign_id} selected=${allSelected.length} withEmail=${recipients.length} missingEmail=${missing} skipped=${skippedKeys.length}`,
      );

      if (allSelected.length > 0 && recipients.length === 0) {
        const sample = allSelected.slice(0, 3).map((r) => r.display_name).join(", ");
        const msg = `Keine der ${allSelected.length} ausgewählten Personen hat eine hinterlegte E-Mail-Adresse (z. B. ${sample}). Bitte E-Mail-Adressen im Adressbuch ergänzen.`;
        await admin.from("comm_campaigns").update({ status: "failed", error_message: msg }).eq("id", campaign_id);
        lockedCampaignId = null;
        return json({ error: msg }, 400);
      }
      if (recipients.length === 0) {
        await admin.from("comm_campaigns").update({ status: "failed", error_message: "Keine Empfänger" }).eq("id", campaign_id);
        lockedCampaignId = null;
        return json({ error: "Keine Empfänger ausgewählt" }, 400);
      }

      // Wer diese Rundmail schon erhalten hat (z. B. vor einem Abbruch), bekommt sie nicht noch einmal
      const { data: sentRows } = await admin
        .from("comm_recipients")
        .select("contact_id, email, resolved_vars")
        .eq("campaign_id", campaign_id)
        .eq("status", "sent");
      const sentByKey = new Set<string>();
      const sentByContact = new Set<string>();
      for (const row of sentRows || []) {
        const em = String(row.email || "").toLowerCase();
        const vars = (row.resolved_vars || {}) as Record<string, unknown>;
        if (Object.prototype.hasOwnProperty.call(vars, ASSIGNMENT_VAR)) {
          sentByKey.add(`${vars[ASSIGNMENT_VAR] ?? ""}|${em}`);
        } else {
          // Zeilen aus der Zeit vor der Warteschlange kennen die Einheit nicht
          sentByContact.add(`${row.contact_id ?? ""}|${em}`);
        }
      }
      const toQueue = recipients.filter((r) => {
        const em = (r.email || "").toLowerCase();
        if (sentByKey.has(`${r.assignment_id ?? ""}|${em}`)) return false;
        if (sentByContact.has(`${r.contact_id ?? ""}|${em}`)) return false;
        return true;
      });
      alreadySent = recipients.length - toQueue.length;

      // Alte, nicht erfolgreiche Zeilen ersetzen — erfolgreiche bleiben als Nachweis stehen
      const { error: delErr } = await admin
        .from("comm_recipients")
        .delete()
        .eq("campaign_id", campaign_id)
        .neq("status", "sent");
      if (delErr) throw delErr;

      const rows = toQueue.map((r) => ({
        campaign_id,
        contact_id: r.contact_id,
        person_id: r.person_id,
        building_id: r.building_id,
        display_name: r.display_name,
        email: r.email,
        resolved_vars: { ...(r.vars || {}), [ASSIGNMENT_VAR]: r.assignment_id ?? null },
        status: "pending",
      }));
      for (let i = 0; i < rows.length; i += 200) {
        const { error: insErr } = await admin.from("comm_recipients").insert(rows.slice(i, i + 200));
        if (insErr) throw insErr;
      }
      queued = rows.length;
    }

    await admin.from("comm_campaigns").update({ error_message: warning }).eq("id", campaign_id);
    await refreshCounts(admin, campaign_id);

    if (queued === 0) {
      // Alle Ausgewählten hatten die Rundmail bereits erhalten
      await finalizeCampaign(admin, campaign_id);
      lockedCampaignId = null;
      return json({ success: true, background: false, queued: 0, already_sent: alreadySent });
    }

    // Erstes Arbeitspaket anstoßen — die Antwort an die App kommt sofort
    const kicked = await kickWorker(campaign_id, true);
    lockedCampaignId = null;
    if (!kicked) {
      // Sicherheitsnetz (Zeitplaner / „Fortsetzen“) übernimmt nach wenigen Minuten
      console.warn(`[comm-send-bulk-email] campaign=${campaign_id} erstes Paket konnte nicht gestartet werden`);
    }

    return json({ success: true, background: true, queued, already_sent: alreadySent });
  } catch (e: any) {
    console.error("comm-send-bulk-email error", e);
    if (lockedCampaignId) {
      await admin
        .from("comm_campaigns")
        .update({ status: "failed", error_message: `Start des Versands fehlgeschlagen: ${e?.message || e}` })
        .eq("id", lockedCampaignId);
    }
    return json({ error: e?.message || "Unknown error" }, 500);
  }
});

// ---------------------------------------------------------------------------
// Fortsetzen / Arbeitspaket
// ---------------------------------------------------------------------------

async function handleContinue(admin: Admin, campaignId: string, isChain: boolean) {
  if (!isChain) {
    // Manuell (App) oder Zeitplaner: nur eingreifen, wenn der Versand wirklich hängt
    const { data: c } = await admin
      .from("comm_campaigns").select("status, updated_at").eq("id", campaignId).maybeSingle();
    if (!c || c.status !== "sending") return json({ ok: true, skipped: "not_sending" });
    const staleIso = new Date(Date.now() - STALE_HEARTBEAT_MS).toISOString();
    // Bedingtes Update als Sperre, damit nicht zwei Fortsetzungen gleichzeitig loslaufen
    const { data: got } = await admin
      .from("comm_campaigns")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", campaignId)
      .eq("status", "sending")
      .lt("updated_at", staleIso)
      .select("id");
    if (!got || got.length === 0) return json({ ok: true, skipped: "running" });

    const { unclaimed, inFlight } = await pendingCounts(admin, campaignId);
    if (unclaimed + inFlight === 0) {
      // Nichts mehr in der Warteschlange: sauber abschließen
      await concludeWithoutQueue(admin, campaignId);
      return json({ ok: true, skipped: "finished" });
    }
    const lastProgress = await lastProgressAt(admin, campaignId);
    if (lastProgress && Date.now() - lastProgress > NO_PROGRESS_FAIL_MS) {
      await refreshCounts(admin, campaignId);
      await admin
        .from("comm_campaigns")
        .update({
          status: "failed",
          error_message:
            "Der Versand kommt seit über 30 Minuten nicht voran (evtl. zu große Anhänge oder Postausgangsserver nicht erreichbar). Beim erneuten Senden bekommen nur die übrigen Empfänger die Rundmail.",
        })
        .eq("id", campaignId)
        .eq("status", "sending");
      return json({ ok: true, skipped: "no_progress" });
    }
  }

  EdgeRuntime.waitUntil(
    runBatch(admin, campaignId).catch((e) => console.error("[comm-send-bulk-email] batch crashed", campaignId, e)),
  );
  return json({ ok: true, continued: true }, 202);
}

async function runBatch(admin: Admin, campaignId: string) {
  const startedAt = Date.now();
  let processed = 0;
  let stopped = false;
  let transporter: any = null;

  try {
    const ctx = await loadContext(admin, campaignId);
    if ("error" in ctx) {
      await admin.from("comm_campaigns").update({ status: "failed", error_message: ctx.error }).eq("id", campaignId);
      return;
    }
    const { campaign, account } = ctx;
    if (campaign.status !== "sending") return; // angehalten oder bereits fertig

    await releaseStaleClaims(admin, campaignId);

    // „Gesendet“-Ordner für die Ablage im Postfach
    const { data: sentFolder } = await admin
      .from("email_folders").select("id").eq("name", "Gesendet").maybeSingle();

    // Individuelle Texte / persönliche Anhänge je Empfänger
    const { data: overridesData } = await admin
      .from("comm_recipient_overrides")
      .select("contact_id, assignment_id, email, subject, body_html, attachment_paths")
      .eq("campaign_id", campaignId);
    type Override = { subject: string | null; body_html: string | null; attachment_paths: string[] };
    const overrideByKey = new Map<string, Override>();
    const overrideByContact = new Map<string, Override>();
    for (const o of overridesData || []) {
      const val: Override = {
        subject: o.subject ?? null,
        body_html: o.body_html ?? null,
        attachment_paths: (o.attachment_paths || []) as string[],
      };
      if (o.assignment_id) overrideByKey.set(`${o.assignment_id}|${(o.email || "").toLowerCase()}`, val);
      if (o.contact_id && !overrideByContact.has(o.contact_id)) overrideByContact.set(o.contact_id, val);
    }

    // Anhänge für alle: einmal pro Paket laden
    const shared = await downloadAttachments(admin, (campaign.attachment_paths || []) as string[]);
    const sharedBytes = shared.reduce((n, a) => n + a.content.byteLength, 0);

    // Persönliche Anhänge: ein Download pro Pfad
    const personalCache = new Map<string, Attachment | null>();
    const loadPersonal = async (paths: string[]) => {
      const out: Attachment[] = [];
      for (const p of paths) {
        if (!personalCache.has(p)) {
          const [att] = await downloadAttachments(admin, [p]);
          personalCache.set(p, att || null);
        }
        const cached = personalCache.get(p);
        if (cached) out.push(cached);
      }
      return out;
    };

    // Eine SMTP-Verbindung für das ganze Paket (spart den Verbindungsaufbau je Mail)
    transporter = createTransport(account, true);
    let bytesThisBatch = 0;
    const isHtml = ctx.bodyFormat !== "plain";

    while (
      processed < BATCH_MAX_MAILS &&
      // mindestens eine Mail pro Paket, sonst ginge es nie voran
      (processed === 0 || (Date.now() - startedAt < BATCH_MAX_MS && bytesThisBatch < BATCH_MAX_ATTACHMENT_BYTES))
    ) {
      if (processed > 0) {
        // Wurde der Versand zwischenzeitlich angehalten?
        const { data: st } = await admin.from("comm_campaigns").select("status").eq("id", campaignId).maybeSingle();
        if (st?.status !== "sending") {
          stopped = true;
          break;
        }
      }

      // Nächsten offenen Empfänger holen …
      const { data: candidates, error: candErr } = await admin
        .from("comm_recipients")
        .select("*")
        .eq("campaign_id", campaignId)
        .eq("status", "pending")
        .is("error", null)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(1);
      if (candErr) throw candErr;
      const candidate = candidates?.[0];
      if (!candidate) break;

      // … und reservieren. Nur wer die Zeile noch offen vorfindet, darf senden.
      const { data: claimed, error: claimErr } = await admin
        .from("comm_recipients")
        .update({ error: SENDING_MARK, sent_at: new Date().toISOString() })
        .eq("id", candidate.id)
        .eq("status", "pending")
        .is("error", null)
        .select("id");
      if (claimErr) throw claimErr;
      if (!claimed || claimed.length === 0) continue; // von einem anderen Aufruf übernommen

      const vars = (candidate.resolved_vars || {}) as Record<string, any>;
      const assignmentId = vars[ASSIGNMENT_VAR] as string | null | undefined;
      const emailLower = String(candidate.email || "").toLowerCase();
      const ov =
        (assignmentId ? overrideByKey.get(`${assignmentId}|${emailLower}`) : undefined) ??
        (candidate.contact_id ? overrideByContact.get(candidate.contact_id) : undefined);
      const renderedSubject = renderString(ov?.subject ?? ctx.subject, vars);
      const renderedBody = composeBody(ctx, renderString(ov?.body_html ?? ctx.bodyHtml, vars));

      let personal: Attachment[] = [];
      let sent = false;
      try {
        personal = ov?.attachment_paths?.length ? await loadPersonal(ov.attachment_paths) : [];
        const allAttachments = [...shared, ...personal];
        bytesThisBatch += sharedBytes + personal.reduce((n, a) => n + a.content.byteLength, 0);

        await transporter.sendMail({
          from: `${account.display_name} <${account.email_address}>`,
          to: candidate.email,
          subject: renderedSubject,
          ...buildBody(ctx, renderedBody),
          attachments: allAttachments.map((a) => ({ filename: a.filename, content: toBuffer(a.content) })),
        });
        sent = true;

        await markRecipient(admin, candidate.id, { status: "sent", error: null, sent_at: new Date().toISOString() });
      } catch (e: any) {
        if (sent) {
          console.warn("[comm-send-bulk-email] Nachbearbeitung fehlgeschlagen:", e?.message || e);
        } else {
          await markRecipient(admin, candidate.id, { status: "failed", error: e?.message || "Send failed" });
        }
      }

      processed++;
      await refreshCounts(admin, campaignId); // zugleich Lebenszeichen für das Sicherheitsnetz

      if (sent) {
        // Eintrag im „Gesendet“-Ordner (Fehler hier dürfen den Versand nicht stoppen)
        await saveToSentFolder(admin, {
          campaignId,
          account,
          folderId: sentFolder?.id ?? null,
          to: candidate.email,
          subject: renderedSubject,
          body: renderedBody,
          isHtml,
          shared,
          personal,
        });
      }
      await sleep(DELAY_BETWEEN_MAILS_MS);
    }
  } catch (e: any) {
    console.error("[comm-send-bulk-email] batch error", campaignId, e?.message || e);
  } finally {
    try {
      transporter?.close();
    } catch (_) { /* ignore */ }
  }

  // Nächstes Paket anstoßen oder abschließen
  try {
    if (stopped) {
      await refreshCounts(admin, campaignId);
      return;
    }
    const { data: st } = await admin.from("comm_campaigns").select("status").eq("id", campaignId).maybeSingle();
    if (st?.status !== "sending") return;

    const { unclaimed, inFlight } = await pendingCounts(admin, campaignId);
    if (unclaimed > 0) {
      // Ohne Fortschritt nicht sofort neu starten (sonst Endlosschleife bei Dauerfehlern) —
      // dann übernimmt das Sicherheitsnetz nach einigen Minuten.
      if (processed > 0) await kickWorker(campaignId, true);
    } else if (inFlight === 0) {
      await finalizeCampaign(admin, campaignId);
    }
  } catch (e: any) {
    console.error("[comm-send-bulk-email] chain error", campaignId, e?.message || e);
  }
}

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

type Context = {
  campaign: any;
  account: any;
  subject: string;
  bodyHtml: string;
  bodyFormat: "html" | "plain";
  signature: string;
};

async function loadContext(admin: Admin, campaignId: string): Promise<Context | { error: string; status: number }> {
  const { data: campaign, error: cErr } = await admin
    .from("comm_campaigns").select("*").eq("id", campaignId).single();
  if (cErr || !campaign) return { error: "Campaign not found", status: 404 };
  if (!campaign.email_account_id) return { error: "Kein E-Mail-Konto ausgewählt", status: 400 };

  const { data: account, error: accErr } = await admin
    .from("email_accounts").select("*").eq("id", campaign.email_account_id).single();
  if (accErr || !account) return { error: "E-Mail-Konto nicht gefunden", status: 404 };

  let subject = campaign.subject_override as string | null;
  let bodyHtml = campaign.body_html_override as string | null;
  let bodyFormat = (campaign.body_format as "html" | "plain") || "html";
  if ((!subject || !bodyHtml) && campaign.template_id) {
    const { data: t } = await admin.from("comm_templates")
      .select("subject, body_html, body_format").eq("id", campaign.template_id).single();
    if (!subject) subject = t?.subject || null;
    if (!bodyHtml) bodyHtml = t?.body_html || null;
    if (!campaign.body_format && t?.body_format) bodyFormat = t.body_format as "html" | "plain";
  }
  if (!subject || !bodyHtml) return { error: "Betreff oder Inhalt fehlt", status: 400 };

  const signature = ((account.signature_html as string | null) || "").trim();
  return { campaign, account, subject, bodyHtml, bodyFormat, signature };
}

/**
 * Erzeugt den finalen Body (HTML bzw. Plain) inkl. Signatur.
 * Der Rundmail-Editor liefert reinen Text; im HTML-Modus werden Zeilenumbrüche
 * in <br> gewandelt. Steht die Signatur schon im Text (der Editor fügt sie
 * inzwischen selbst ein), wird sie nicht noch einmal angehängt.
 */
function composeBody(ctx: Context, rendered: string) {
  const { signature, bodyFormat } = ctx;
  const hasSignature = !!signature && rendered.includes(signature);
  if (bodyFormat === "plain") {
    if (!signature || hasSignature) return rendered;
    return `${rendered}\n\n${signature}`;
  }
  let html = looksLikeHtml(rendered) ? rendered : textToHtmlWithLinks(rendered);
  if (signature && !hasSignature && !html.includes(signature)) {
    html = `${html}<br /><br />${signature}`;
  }
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.4">${html}</div>`;
}

function buildBody(ctx: Context, composed: string) {
  return ctx.bodyFormat === "plain" ? { text: composed } : { html: composed };
}

function createTransport(account: any, pooled: boolean) {
  return nodemailer.createTransport({
    host: account.smtp_host,
    port: account.smtp_port,
    secure: account.smtp_port === 465,
    auth: { user: account.smtp_user, pass: account.smtp_password },
    tls: { rejectUnauthorized: Deno.env.get("SMTP_ALLOW_SELF_SIGNED") === "true" ? false : true },
    pool: pooled,
    maxConnections: 1,
    maxMessages: BATCH_MAX_MAILS + 5,
    connectionTimeout: 20_000,
    greetingTimeout: 15_000,
    socketTimeout: 60_000,
  });
}

/** Lädt Dateien aus `comm-assets`. Der Zeitstempel vor dem Dateinamen (vom Upload) wird entfernt. */
async function downloadAttachments(admin: Admin, paths: string[]): Promise<Attachment[]> {
  const out: Attachment[] = [];
  for (const p of paths) {
    const { data: f, error: dlErr } = await admin.storage.from("comm-assets").download(p);
    if (dlErr || !f) {
      console.warn("attachment missing", p, dlErr?.message);
      continue;
    }
    const sourceKey = p.split("/").pop() || "anhang";
    const filename = sourceKey.replace(/^\d{13}_/, "") || "anhang";
    out.push({ filename, content: new Uint8Array(await f.arrayBuffer()), sourceKey });
  }
  return out;
}

async function markRecipient(admin: Admin, id: string, values: Record<string, unknown>) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { error } = await admin.from("comm_recipients").update(values).eq("id", id);
    if (!error) return;
    console.warn("[comm-send-bulk-email] Empfängerstatus konnte nicht gespeichert werden:", error.message);
    await sleep(500);
  }
}

/** Reservierungen, die ein abgebrochener Aufruf hinterlassen hat, als „unklar“ markieren. */
async function releaseStaleClaims(admin: Admin, campaignId: string) {
  const staleIso = new Date(Date.now() - STALE_CLAIM_MS).toISOString();
  const { error } = await admin
    .from("comm_recipients")
    .update({
      status: "failed",
      error:
        "Versand wurde unterbrochen – bitte im Ordner „Gesendet“ prüfen, ob diese E-Mail angekommen ist, bevor sie erneut gesendet wird.",
    })
    .eq("campaign_id", campaignId)
    .eq("status", "pending")
    .eq("error", SENDING_MARK)
    .lt("sent_at", staleIso);
  if (error) console.warn("[comm-send-bulk-email] releaseStaleClaims:", error.message);
}

async function countRecipients(admin: Admin, campaignId: string, apply?: (q: any) => any) {
  let q: any = admin.from("comm_recipients").select("id", { count: "exact", head: true }).eq("campaign_id", campaignId);
  if (apply) q = apply(q);
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

async function pendingCounts(admin: Admin, campaignId: string) {
  const [unclaimed, inFlight] = await Promise.all([
    countRecipients(admin, campaignId, (q) => q.eq("status", "pending").is("error", null)),
    countRecipients(admin, campaignId, (q) => q.eq("status", "pending").eq("error", SENDING_MARK)),
  ]);
  return { unclaimed, inFlight };
}

/** Zähler an der Rundmail aktualisieren (dient zugleich als Lebenszeichen). */
async function refreshCounts(admin: Admin, campaignId: string, opts: { keepRecipientCount?: boolean } = {}) {
  try {
    const [total, sent, failed] = await Promise.all([
      countRecipients(admin, campaignId),
      countRecipients(admin, campaignId, (q) => q.eq("status", "sent")),
      countRecipients(admin, campaignId, (q) => q.eq("status", "failed")),
    ]);
    const values: Record<string, number> = { sent_count: sent, failed_count: failed };
    if (!opts.keepRecipientCount) values.recipient_count = total;
    await admin.from("comm_campaigns").update(values).eq("id", campaignId);
    return { total, sent, failed };
  } catch (e: any) {
    console.warn("[comm-send-bulk-email] refreshCounts:", e?.message || e);
    return null;
  }
}

async function finalizeCampaign(admin: Admin, campaignId: string) {
  const counts = await refreshCounts(admin, campaignId);
  if (!counts) return;
  const status = counts.sent === 0 ? "failed" : "sent";
  await admin
    .from("comm_campaigns")
    .update({ status, completed_at: new Date().toISOString() })
    .eq("id", campaignId)
    .eq("status", "sending");
  console.log(`[comm-send-bulk-email] campaign=${campaignId} fertig: ${counts.sent} gesendet, ${counts.failed} fehlgeschlagen`);
}

/**
 * „Sending“ ohne offene Empfänger: normal abschließen — außer die Zeilen stammen
 * aus der Zeit vor der Warteschlange (damals wurde abgebrochen, bevor alle
 * Empfänger eingetragen waren). Dann als unterbrochen markieren, damit die
 * Rundmail sichtbar bleibt und erneut gesendet werden kann.
 */
async function concludeWithoutQueue(admin: Admin, campaignId: string) {
  const { data: rows } = await admin
    .from("comm_recipients").select("resolved_vars").eq("campaign_id", campaignId).limit(5000);
  const legacy =
    !rows || rows.length === 0 ||
    rows.some((r: any) => !Object.prototype.hasOwnProperty.call(r.resolved_vars || {}, ASSIGNMENT_VAR));
  if (!legacy) {
    await finalizeCampaign(admin, campaignId);
    return;
  }
  await refreshCounts(admin, campaignId, { keepRecipientCount: true });
  await admin
    .from("comm_campaigns")
    .update({
      status: "failed",
      error_message:
        "Versand wurde unterbrochen. Beim erneuten Senden bekommen nur die Empfänger die Rundmail, die sie noch nicht erhalten haben.",
    })
    .eq("id", campaignId)
    .eq("status", "sending");
}

/** Zeitpunkt des letzten Fortschritts (letzte Reservierung bzw. Aufnahme in die Warteschlange). */
async function lastProgressAt(admin: Admin, campaignId: string): Promise<number | null> {
  const [{ data: bySent }, { data: byCreated }] = await Promise.all([
    admin.from("comm_recipients").select("sent_at").eq("campaign_id", campaignId)
      .not("sent_at", "is", null).order("sent_at", { ascending: false }).limit(1),
    admin.from("comm_recipients").select("created_at").eq("campaign_id", campaignId)
      .order("created_at", { ascending: false }).limit(1),
  ]);
  const times = [bySent?.[0]?.sent_at, byCreated?.[0]?.created_at]
    .filter(Boolean)
    .map((t: string) => new Date(t).getTime());
  return times.length ? Math.max(...times) : null;
}

/** Startet das nächste Arbeitspaket als eigenen Funktionsaufruf. */
async function kickWorker(campaignId: string, chain: boolean): Promise<boolean> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/comm-send-bulk-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        apikey: SERVICE_ROLE_KEY,
      },
      body: JSON.stringify({ campaign_id: campaignId, continue: true, chain }),
    });
    await res.text().catch(() => "");
    if (!res.ok) {
      console.error("[comm-send-bulk-email] Folgeaufruf fehlgeschlagen", campaignId, res.status);
      return false;
    }
    return true;
  } catch (e: any) {
    console.error("[comm-send-bulk-email] Folgeaufruf fehlgeschlagen", campaignId, e?.message || e);
    return false;
  }
}

/** Legt die versendete Mail im Ordner „Gesendet“ ab, inkl. Anhängen. */
async function saveToSentFolder(
  admin: Admin,
  p: {
    campaignId: string;
    account: any;
    folderId: string | null;
    to: string;
    subject: string;
    body: string;
    isHtml: boolean;
    shared: Attachment[];
    personal: Attachment[];
  },
) {
  try {
    const all = [...p.shared, ...p.personal];
    const { data: insertedEmail, error: insErr } = await admin.from("emails").insert({
      account_id: p.account.id,
      folder_id: p.folderId,
      subject: p.subject || null,
      from_address: p.account.email_address,
      from_name: p.account.display_name,
      to_addresses: [p.to],
      body_text: p.isHtml ? null : p.body,
      body_html: p.isHtml ? p.body : null,
      date: new Date().toISOString(),
      is_read: true,
      has_attachments: all.length > 0,
      message_id: `bulk-${p.campaignId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    }).select("id").single();
    if (insErr) throw insErr;
    if (!insertedEmail?.id || all.length === 0) return;

    const bucket = admin.storage.from("email-attachments");
    for (const [idx, att] of all.entries()) {
      try {
        const safeName = String(att.filename || "anhang").replace(/[^\w.\-]+/g, "_");
        const filePath = `${insertedEmail.id}/${idx}_${safeName}`;
        const isShared = idx < p.shared.length;
        let stored = false;

        // Anhänge für alle nur einmal hochladen und danach serverseitig kopieren
        if (isShared) {
          const copyPath = `bulk/${p.campaignId}/${String(att.sourceKey).replace(/[^\w.\-]+/g, "_")}`;
          // Vorlage liegt evtl. schon vom vorherigen Paket bereit
          let { error: cpErr } = await bucket.copy(copyPath, filePath);
          if (cpErr && !att.sentCopyPath) {
            const { error: upErr } = await bucket.upload(copyPath, att.content, {
              contentType: guessMime(att.filename),
              upsert: true,
            });
            if (!upErr) {
              att.sentCopyPath = copyPath;
              ({ error: cpErr } = await bucket.copy(copyPath, filePath));
            }
          }
          stored = !cpErr;
        }
        if (!stored) {
          const { error: upErr } = await bucket.upload(filePath, att.content, {
            contentType: guessMime(att.filename),
            upsert: true,
          });
          if (upErr) throw upErr;
        }

        const { error: attErr } = await admin.from("email_attachments").insert({
          email_id: insertedEmail.id,
          file_name: att.filename,
          file_path: filePath,
          file_size: att.content.byteLength,
          mime_type: guessMime(att.filename),
          is_inline: false,
        });
        if (attErr) throw attErr;
      } catch (attE: any) {
        console.error("[comm-send-bulk-email] attachment persist failed:", att.filename, attE?.message || attE);
      }
    }
  } catch (saveErr: any) {
    console.warn("[comm-send-bulk-email] save-to-sent failed:", saveErr?.message || saveErr);
  }
}
