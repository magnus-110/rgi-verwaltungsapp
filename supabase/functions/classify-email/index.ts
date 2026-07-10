import { createClient } from "npm:@supabase/supabase-js@2.52.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Normalize text for fuzzy matching: lowercase, umlauts, "str." -> "strasse"
function normalizeText(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/str\./g, "strasse")
    .replace(/strasse/g, "strasse")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Build search tokens from a building (name + address parts)
function buildingTokens(b: { name: string | null; address: string | null }): string[] {
  const tokens = new Set<string>();
  const name = normalizeText(b.name);
  const addr = normalizeText([b.address, b.city].filter(Boolean).join(" "));
  if (name && name.length >= 4) tokens.add(name);
  if (addr) {
    tokens.add(addr);
    // street without house number
    const streetOnly = addr.replace(/\b\d+[a-z]?\b/g, "").replace(/\s+/g, " ").trim();
    if (streetOnly && streetOnly.length >= 5) tokens.add(streetOnly);
    // first significant word (street name root)
    const parts = addr.split(" ").filter((p) => p.length >= 5 && !/^\d/.test(p));
    for (const p of parts) tokens.add(p);
  }
  return [...tokens];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const body = await req.json().catch(() => ({}));
    const emailIds: string[] = body.email_ids || [];

    // Resolve folder IDs so we can detect/skip outgoing mails
    const { data: folders } = await supabaseAdmin
      .from("email_folders")
      .select("id, name");
    const sentFolderId = folders?.find((f) => f.name === "Gesendet")?.id || null;

    let query = supabaseAdmin
      .from("emails")
      .select(
        "id, subject, from_address, from_name, body_text, to_addresses, folder_id"
      )
      .is("ai_category", null)
      .order("date", { ascending: false })
      .limit(20);

    if (emailIds.length > 0) {
      query = supabaseAdmin
        .from("emails")
        .select(
          "id, subject, from_address, from_name, body_text, to_addresses, folder_id"
        )
        .in("id", emailIds);
    }

    const { data: emails, error: fetchErr } = await query;
    if (fetchErr) throw fetchErr;
    if (!emails || emails.length === 0) {
      return new Response(
        JSON.stringify({ message: "Keine E-Mails zu klassifizieren" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: buildings } = await supabaseAdmin
      .from("buildings")
      .select("id, name, address, city");

    const { data: contacts } = await supabaseAdmin
      .from("contacts")
      .select("id, first_name, last_name, company_name");

    const { data: contactEmails } = await supabaseAdmin
      .from("contact_emails")
      .select("contact_id, email");

    const { data: contactPersonEmails } = await supabaseAdmin
      .from("contact_persons")
      .select("contact_id, email")
      .not("email", "is", null);

    const { data: contactBuildingAssignments } = await supabaseAdmin
      .from("contact_building_assignments")
      .select("contact_id, building_id")
      .eq("is_active", true);

    // exact email -> contact lookup
    const emailToContactId: Record<string, string> = {};
    for (const ce of contactEmails || []) {
      if (ce.email) emailToContactId[ce.email.trim().toLowerCase()] = ce.contact_id;
    }
    for (const cp of contactPersonEmails || []) {
      if (cp.email) {
        const key = cp.email.trim().toLowerCase();
        if (!emailToContactId[key]) emailToContactId[key] = cp.contact_id;
      }
    }

    // contact -> buildings
    const contactBuildings: Record<string, string[]> = {};
    for (const cba of contactBuildingAssignments || []) {
      if (!contactBuildings[cba.contact_id]) contactBuildings[cba.contact_id] = [];
      contactBuildings[cba.contact_id].push(cba.building_id);
    }

    // Precompute building tokens for fuzzy matching
    const buildingsWithTokens = (buildings || []).map((b) => ({
      ...b,
      tokens: buildingTokens(b),
    }));
    const validBuildingIds = new Set(buildingsWithTokens.map((b) => b.id));
    const validContactIds = new Set((contacts || []).map((c) => c.id));

    const MISTRAL_API_KEY = Deno.env.get("MISTRAL_API_KEY");
    if (!MISTRAL_API_KEY) throw new Error("MISTRAL_API_KEY not configured");

    let classified = 0;

    for (const email of emails) {
      try {
        const isOutgoing = sentFolderId && email.folder_id === sentFolderId;

        // === Determine relevant party (sender for incoming, recipient for outgoing) ===
        const partyAddress = isOutgoing
          ? (email.to_addresses?.[0] || "").toLowerCase()
          : (email.from_address || "").toLowerCase();

        // Direct exact-email match (sender for inbox, recipient for sent)
        let directContactId: string | null = partyAddress
          ? emailToContactId[partyAddress] || null
          : null;

        // Domain fallback: company-only contacts where domain matches uniquely
        // (skip generic free-mail domains)
        const FREE_DOMAINS = new Set([
          "gmail.com", "googlemail.com", "gmx.de", "gmx.net", "web.de",
          "yahoo.com", "yahoo.de", "hotmail.com", "hotmail.de", "outlook.com",
          "outlook.de", "live.de", "t-online.de", "icloud.com", "me.com",
          "aol.com", "freenet.de", "mail.de",
        ]);
        if (!directContactId && partyAddress.includes("@")) {
          const domain = partyAddress.split("@")[1];
          if (domain && !FREE_DOMAINS.has(domain)) {
            const matches = Object.entries(emailToContactId).filter(([addr]) =>
              addr.endsWith("@" + domain)
            );
            const uniqueIds = new Set(matches.map(([, id]) => id));
            if (uniqueIds.size === 1) {
              directContactId = [...uniqueIds][0];
            }
          }
        }

        // === Building pre-match ===
        const subjectNorm = normalizeText(email.subject);
        const bodyNorm = normalizeText((email.body_text || "").substring(0, 2000));

        const subjectMatches = buildingsWithTokens.filter((b) =>
          b.tokens.some((t) => t.length >= 5 && subjectNorm.includes(t))
        );
        const bodyMatches = buildingsWithTokens.filter((b) =>
          b.tokens.some((t) => t.length >= 5 && bodyNorm.includes(t))
        );

        let preMatchedBuildingId: string | null = null;
        let buildingCandidates: typeof buildingsWithTokens = [];

        // Priority: unambiguous text match (subject or body) > contact assignment > ambiguous candidates
        if (subjectMatches.length === 1) {
          preMatchedBuildingId = subjectMatches[0].id;
        } else if (bodyMatches.length === 1) {
          // Eindeutiger Text-Treffer im Body schlägt Kontakt-Zuordnung,
          // damit Handwerker/Dienstleister mit mehreren Objekten korrekt zugeordnet werden.
          preMatchedBuildingId = bodyMatches[0].id;
        } else if (subjectMatches.length > 1) {
          buildingCandidates = subjectMatches;
        } else if (directContactId && contactBuildings[directContactId]?.length === 1) {
          preMatchedBuildingId = contactBuildings[directContactId][0];
        } else if (directContactId && contactBuildings[directContactId]?.length > 1) {
          const ids = new Set(contactBuildings[directContactId]);
          buildingCandidates = buildingsWithTokens.filter((b) => ids.has(b.id));
        } else if (bodyMatches.length > 1) {
          buildingCandidates = bodyMatches;
        }

        // Limit candidates passed to AI
        if (buildingCandidates.length > 10) {
          buildingCandidates = buildingCandidates.slice(0, 10);
        }

        const buildingListForAi = preMatchedBuildingId
          ? "" // already determined, AI doesn't need to choose
          : (buildingCandidates.length > 0
              ? buildingCandidates
                  .map((b) => `- "${b.name}" (${[b.address, b.city].filter(Boolean).join(", ")}) [ID: ${b.id}]`)
                  .join("\n")
              : "(Keine eindeutigen Gebäude-Kandidaten gefunden)");

        const directionHint = isOutgoing
          ? "Dies ist eine GESENDETE E-Mail (von uns). Der zuzuordnende Kontakt ist der EMPFÄNGER."
          : "Dies ist eine EINGEHENDE E-Mail. Der zuzuordnende Kontakt ist der ABSENDER. Niemals den Empfänger oder eine im Text genannte dritte Person zuordnen.";

        const emailContent = isOutgoing
          ? `Betreff: ${email.subject || "(kein Betreff)"}
An: ${email.to_addresses?.join(", ") || ""}
Inhalt (Auszug): ${(email.body_text || "").substring(0, 1500)}`
          : `Betreff: ${email.subject || "(kein Betreff)"}
Von: ${email.from_name || ""} <${email.from_address || ""}>
Inhalt (Auszug): ${(email.body_text || "").substring(0, 1500)}`;

        const systemPrompt = `Du bist ein KI-Assistent für eine Hausverwaltung. Klassifiziere E-Mails (Kategorie, Priorität, Zusammenfassung).

WICHTIG zur Zuordnung:
${directionHint}

Hinweis zur Kategorie "Werbung": Newsletter, Marketing, Produktankündigungen.
Hinweis zur Kategorie "Sonstiges": Alles, was sich nicht eindeutig zuordnen lässt.

${preMatchedBuildingId
  ? "Das zugehörige Gebäude wurde bereits automatisch ermittelt - du musst kein building_id zurückgeben."
  : `Mögliche Gebäude-Kandidaten (wähle nur aus dieser Liste exakt eine UUID, sonst null):
${buildingListForAi}`}

Nur wenn der Absender/Empfänger NICHT eindeutig per E-Mail-Adresse zugeordnet werden konnte, darfst du contact_id null lassen. Halluziniere keine UUIDs.`;

        const tools: any[] = [
          {
            type: "function",
            function: {
              name: "classify_email",
              description: "Klassifiziere eine E-Mail für die Hausverwaltung",
              parameters: {
                type: "object",
                properties: {
                  category: {
                    type: "string",
                    enum: [
                      "Schadensmeldung", "Rechnung", "Anfrage", "Behörde",
                      "Versicherung", "Handwerker", "Eigentümer", "Mieter",
                      "Hausgeld", "Versammlung", "Kündigung", "Werbung", "Sonstiges",
                    ],
                  },
                  priority: {
                    type: "string",
                    enum: ["hoch", "mittel", "niedrig"],
                  },
                  summary: { type: "string" },
                  building_id: {
                    type: "string",
                    description:
                      "UUID aus den oben gelisteten Kandidaten ODER null. Niemals erfinden.",
                  },
                },
                required: ["category", "priority", "summary"],
                additionalProperties: false,
              },
            },
          },
        ];

        const response = await fetch(
          "https://api.mistral.ai/v1/chat/completions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${MISTRAL_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "mistral-medium-3-5",
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: emailContent },
              ],
              tools,
              tool_choice: {
                type: "function",
                function: { name: "classify_email" },
              },
            }),
          }
        );

        if (!response.ok) {
          const errText = await response.text();
          console.error(`AI classify error ${response.status}:`, errText);
          continue;
        }

        const result = await response.json();
        const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
        if (!toolCall) continue;

        const classification = JSON.parse(toolCall.function.arguments);

        // Validate AI building_id against candidate set (or full set if pre-match was used)
        let aiBuildingId: string | null = null;
        if (classification.building_id && typeof classification.building_id === "string") {
          const candidateIds = preMatchedBuildingId
            ? validBuildingIds
            : new Set(buildingCandidates.map((b) => b.id));
          if (candidateIds.has(classification.building_id)) {
            aiBuildingId = classification.building_id;
          } else {
            console.warn(
              `[${email.id}] AI returned hallucinated building_id ${classification.building_id} - ignored`
            );
          }
        }

        // Final building decision: pre-match wins, else AI from candidates, else null
        const finalBuildingId =
          preMatchedBuildingId ||
          aiBuildingId ||
          (buildingCandidates.length === 1 ? buildingCandidates[0].id : null);

        // Final contact: ONLY direct match - never trust AI for contacts (avoids
        // recipient/third-party mis-assignment)
        const finalContactId = directContactId;

        const updateData: Record<string, any> = {
          ai_category: classification.category,
          ai_priority: classification.priority,
          ai_summary: classification.summary,
        };
        if (finalContactId) updateData.contact_id = finalContactId;
        if (finalBuildingId) updateData.building_id = finalBuildingId;

        console.log(
          `[${email.id}] direction=${isOutgoing ? "out" : "in"} party=${partyAddress} ` +
          `directContact=${directContactId} preBuilding=${preMatchedBuildingId} ` +
          `subjMatches=${subjectMatches.length} bodyMatches=${bodyMatches.length} ` +
          `aiBuilding=${aiBuildingId} finalBuilding=${finalBuildingId}`
        );

        const { error: updateErr } = await supabaseAdmin
          .from("emails")
          .update(updateData)
          .eq("id", email.id);

        if (updateErr) {
          console.error("Update error:", updateErr.message);
        } else {
          classified++;
        }

        // Trigger case suggestion if a building is known
        if (finalBuildingId) {
          try {
            await fetch(
              `${Deno.env.get("SUPABASE_URL")}/functions/v1/case-suggest-for-email`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  email_id: email.id,
                  building_id: finalBuildingId,
                }),
              }
            );
          } catch (e) {
            console.error("case-suggest-for-email failed:", e);
          }
        }

        await new Promise((r) => setTimeout(r, 500));
      } catch (emailErr: any) {
        console.error(
          `Error classifying email ${email.id}:`,
          emailErr.message
        );
      }
    }

    return new Response(
      JSON.stringify({ success: true, classified, total: emails.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("classify-email error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
