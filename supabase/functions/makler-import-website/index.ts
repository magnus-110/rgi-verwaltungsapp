// Einmaliger Umzug: Objekte, Fotos und Schaufenster-Folien aus der alten
// Website-Datenbank in den Maklerbereich der App. Wiederholbar (über
// legacy_website_id), geschützt durch ein Einmal-Kennwort (nur dessen Hash steht hier).
// Nach dem Umzug wird diese Funktion wieder entfernt.
import { createClient } from "npm:@supabase/supabase-js@2.52.1";

const TOKEN_HASH = "c42548256ebe7f4068e7a0b8c88cc364018fdee8beccd19f4ec1bec47db2bb4f";
const ALT_URL = "https://jsrhluehonepowausjzt.supabase.co";
const ALT_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpzcmhsdWVob25lcG93YXVzanp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5NTY2MjcsImV4cCI6MjA4MzUzMjYyN30.Ld9YIabNPYpTEv5Q3wZhFU8sp7u09ZKi-0QGcVgD4DI";

// Bereits in der App vorhandene Objekte, die denselben Verkauf meinen.
const ZUSAMMENFUEHREN: Record<string, string> = {
  "c47be482-1ab5-4ff4-a512-7e7e90d3a5e7": "Alpenlodge - Hotel garni",
  "23abffaf-ae08-45ed-bc4d-f934ad72e71a": "EFH mit 2 weiteren Wohneinheiten",
};

async function sha256(t: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function alt(path: string) {
  const r = await fetch(`${ALT_URL}/rest/v1/${path}`, { headers: { apikey: ALT_KEY, Authorization: `Bearer ${ALT_KEY}` } });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return r.json();
}

const slugify = (s: string) =>
  s.toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70);

const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

Deno.serve(async (req) => {
  const { token, dry } = await req.json().catch(() => ({}));
  if (!token || (await sha256(String(token))) !== TOKEN_HASH) {
    return new Response(JSON.stringify({ error: "Nicht erlaubt" }), { status: 403 });
  }
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const log: string[] = [];
  try {
    const props: any[] = await alt("properties?select=*&order=created_at.asc");
    const imgs: any[] = await alt("property_images?select=*&order=sort_order.asc");
    const { data: admins } = await db.from("profiles").select("user_id").eq("role", "admin").eq("broker_mode_enabled", true).limit(1);
    const zustaendig = admins?.[0]?.user_id ?? null;

    for (const p of props) {
      const verkauft = p.availability_status === "sold" || p.availability_status === "rented";
      const features: string[] = [];
      const f = (b: boolean | null, n: string) => b && features.push(n);
      f(p.has_balcony, "Balkon"); f(p.has_terrace, "Terrasse"); f(p.has_garden, "Garten"); f(p.has_parking, "Stellplatz");
      f(p.has_elevator, "Aufzug"); f(p.has_cellar, "Keller"); f(p.has_fitted_kitchen, "Einbauküche");
      f(p.is_barrier_free, "Barrierefrei"); f(p.has_guest_toilet, "Gäste-WC");
      const zeile: Record<string, unknown> = {
        listing_type: p.transaction_type === "rent" ? "rent" : "sale",
        title: p.title,
        description: p.description,
        street: p.street,
        house_number: p.house_number,
        address: [p.street, p.house_number].filter(Boolean).join(" ") || null,
        postal_code: p.postal_code,
        city: p.city,
        district: p.district,
        property_type: p.property_type,
        property_subtype: p.property_subtype,
        condition: p.property_condition,
        price_eur: num(p.purchase_price),
        cold_rent_eur: num(p.cold_rent),
        warm_rent_eur: num(p.warm_rent),
        commission_buyer_pct: num(p.provision),
        commission_text: p.provision ? `${String(p.provision).replace(".", ",")} % inkl. MwSt.` : null,
        living_space_sqm: num(p.living_space),
        plot_size_sqm: num(p.plot_size),
        rooms: num(p.rooms),
        floor: num(p.floor_number),
        total_floors: num(p.total_floors),
        year_built: num(p.year_built),
        heating_type: p.heating_type,
        energy_source: p.energy_source,
        energy_class: p.energy_efficiency_class,
        energy_value: num(p.energy_value),
        energy_certificate_type: p.energy_certificate_type,
        energy_certificate_date: p.energy_certificate_creation_date,
        features,
        is_active: !verkauft,
        status: verkauft ? "abgeschlossen" : "vermarktung",
        website_state: p.availability_status === "sold" ? "verkauft" : p.availability_status === "rented" ? "vermietet" : "aktiv",
        show_on_website: !verkauft,
        is_reference: verkauft,
        reference_order: verkauft ? p.reference_sort_order : null,
        display_order: p.display_order,
        display_hidden: !!p.display_hidden,
        legacy_website_id: p.id,
        slug: `${slugify(p.title)}-${String(p.id).slice(0, 6)}`,
        closed_at: verkauft ? p.updated_at : null,
      };

      // Vorhandenes Objekt finden: schon importiert, oder doppelt in der App.
      let { data: vorhanden } = await db.from("broker_properties").select("id").eq("legacy_website_id", p.id).maybeSingle();
      if (!vorhanden && ZUSAMMENFUEHREN[p.id]) {
        const r = await db.from("broker_properties").select("id").eq("title", ZUSAMMENFUEHREN[p.id]).maybeSingle();
        vorhanden = r.data;
      }
      let id: string;
      if (dry) {
        log.push(`${vorhanden ? "aktualisieren" : "neu"}: ${p.title}`);
        continue;
      }
      if (vorhanden) {
        const { error } = await db.from("broker_properties").update(zeile).eq("id", vorhanden.id);
        if (error) throw new Error(`Update ${p.title}: ${error.message}`);
        id = vorhanden.id;
        log.push(`aktualisiert: ${p.title}`);
      } else {
        const { data, error } = await db
          .from("broker_properties")
          .insert({ ...zeile, assigned_to: zustaendig, created_by: zustaendig })
          .select("id")
          .single();
        if (error) throw new Error(`Insert ${p.title}: ${error.message}`);
        id = data.id;
        log.push(`neu: ${p.title}`);
      }

      // Fotos kopieren (nur wenn das Objekt noch keine hat).
      const { count } = await db.from("broker_property_images").select("id", { count: "exact", head: true }).eq("property_id", id);
      if ((count ?? 0) > 0) continue;
      const eigene = imgs.filter((i) => i.property_id === p.id).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      let n = 0;
      for (const img of eigene) {
        try {
          const r = await fetch(img.image_url);
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const typ = r.headers.get("content-type") || "image/jpeg";
          const ext = typ.includes("png") ? "png" : typ.includes("webp") ? "webp" : "jpg";
          const pfad = `${id}/${crypto.randomUUID()}.${ext}`;
          const { error: upErr } = await db.storage.from("makler-fotos").upload(pfad, new Uint8Array(await r.arrayBuffer()), { contentType: typ, upsert: false });
          if (upErr) throw upErr;
          await db.from("broker_property_images").insert({ property_id: id, storage_path: pfad, sort_order: n++, caption: img.caption });
        } catch (e) {
          log.push(`  Foto übersprungen (${p.title}): ${(e as Error).message}`);
        }
      }
      log.push(`  ${n} Fotos kopiert`);
    }

    // Schaufenster-Folien und Einstellungen
    if (!dry) {
      const { count: folien } = await db.from("display_slides").select("id", { count: "exact", head: true });
      if ((folien ?? 0) === 0) {
        const slides: any[] = await alt("display_slides?select=*&order=sort_order.asc");
        if (slides.length) {
          const { error } = await db.from("display_slides").insert(
            slides.map((s) => ({ kind: s.kind, sort_order: s.sort_order, is_active: s.is_active, duration_seconds: s.duration_seconds, config: s.config })),
          );
          if (error) throw new Error(`Folien: ${error.message}`);
          log.push(`${slides.length} Schaufenster-Folien übernommen`);
        }
        const set: any[] = await alt("display_settings?select=*&limit=1");
        if (set[0]) {
          await db.from("display_settings").upsert({
            id: 1,
            object_duration_seconds: set[0].object_duration_seconds ?? 16,
            content_duration_seconds: set[0].content_duration_seconds ?? 13,
            city_filter: set[0].city_filter ?? null,
          });
          log.push("Schaufenster-Einstellungen übernommen");
        }
      }
    }
    return new Response(JSON.stringify({ ok: true, log }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message, log }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
