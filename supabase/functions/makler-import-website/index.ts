// Einmaliger Umzug der Website-Objekte ist erledigt (18.10.2026) – Funktion abgeschaltet.
Deno.serve(() => new Response(JSON.stringify({ error: "Nicht mehr verfügbar" }), { status: 410 }));
