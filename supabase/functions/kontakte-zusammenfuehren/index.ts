// Adressen: zwei Kontakte zusammenführen (nur Büro: Admin/Mitarbeiter mit 2FA).
// Ruft mit Service-Rolle public.kontakte_zusammenfuehren(haupt, dublette, trocken) auf.
// trocken = true: Vorschau, es wird nichts gespeichert.
// Nach echtem Zusammenführen wird im Protokoll (kontakt_zusammenfuehrungen.details) der ausführende Benutzer vermerkt.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";
import { requireAdmin } from "../_shared/require-admin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Fehlermeldungen der DB-Funktion in verständliches Deutsch übersetzen. */
function verstaendlich(msg: string): string {
  if (/Beide Kontakte haben einen App-Login/i.test(msg))
    return "Beide Kontakte haben einen eigenen App-Zugang. Bitte zuerst klären, welcher Zugang bleiben soll – dann den anderen Zugang entfernen.";
  if (/Umfrage-Stimmen/i.test(msg))
    return "Der zweite Kontakt hat bereits an Umfragen abgestimmt. Das kann nicht automatisch übernommen werden – bitte von Hand klären.";
  if (/Gebäude-Zuordnung doppelt/i.test(msg))
    return "Beide Kontakte sind im selben Gebäude mit derselben Einheit und Rolle eingetragen. Bitte eine der beiden Zuordnungen vorher entfernen.";
  if (/nicht gefunden/i.test(msg)) return "Einer der beiden Kontakte wurde nicht gefunden (evtl. schon zusammengeführt oder gelöscht).";
  if (/müssen verschieden sein/i.test(msg)) return "Bitte zwei verschiedene Kontakte wählen.";
  if (/Noch \d+ Verweise/i.test(msg)) return "Es sind noch Verknüpfungen übrig, die nicht umgehängt werden konnten. Bitte melden: " + msg;
  if (/duplicate key|unique/i.test(msg))
    return "Eine Verknüpfung gibt es bei beiden Kontakten schon doppelt. Bitte melden: " + msg;
  return "Zusammenführen nicht möglich: " + msg;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const auth = await requireAdmin(req, corsHeaders);
  if (!auth.ok) return auth.response;
  if (req.method !== "POST") return json({ error: "Nur POST" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const haupt = String(body?.haupt ?? "");
    const dublette = String(body?.dublette ?? "");
    const trocken = body?.trocken !== false;
    if (!UUID.test(haupt) || !UUID.test(dublette)) return json({ error: "Bitte zwei Kontakte wählen." }, 400);
    if (haupt === dublette) return json({ error: "Bitte zwei verschiedene Kontakte wählen." }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data, error } = await admin.rpc("kontakte_zusammenfuehren", {
      p_haupt: haupt,
      p_dublette: dublette,
      p_trocken: trocken,
    });
    if (error) return json({ error: verstaendlich(error.message || "") }, 409);

    if (!trocken) {
      let name: string | null = null;
      if (auth.userId !== "service") {
        const { data: prof } = await admin
          .from("profiles")
          .select("first_name, last_name, email")
          .eq("user_id", auth.userId)
          .maybeSingle();
        name = [prof?.first_name, prof?.last_name].filter(Boolean).join(" ") || prof?.email || null;
      }
      const { data: zeile } = await admin
        .from("kontakt_zusammenfuehrungen")
        .select("id, details")
        .eq("alt_id", dublette)
        .eq("neu_id", haupt)
        .order("am", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (zeile) {
        await admin
          .from("kontakt_zusammenfuehrungen")
          .update({
            details: { ...((zeile as any).details ?? {}), ausfuehrender_user: auth.userId, ausfuehrender_name: name },
          })
          .eq("id", (zeile as any).id);
      }
    }

    return json({ ok: true, ergebnis: data });
  } catch (e: any) {
    console.error("kontakte-zusammenfuehren", e);
    return json({ error: verstaendlich(e?.message ?? "Unbekannter Fehler") }, 500);
  }
});
