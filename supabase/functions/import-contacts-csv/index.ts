import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CsvRow {
  stichwort?: string;
  anrede?: string;
  nachname?: string;
  name2?: string;
  name3?: string;
  strasse?: string;
  plz?: string;
  ort?: string;
  telefon?: string[];
  fax?: string;
  emails?: string[];
  iban?: string;
  bic?: string;
  inhaber?: string;
  bank?: string;
  webseite?: string;
}

interface ParsedContact {
  short_name: string | null;
  salutation: string | null;
  contact_type: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  address_street: string | null;
  address_zip: string | null;
  address_city: string | null;
  notes: string | null;
  persons: Array<{
    salutation: string | null;
    first_name: string | null;
    last_name: string | null;
    is_primary: boolean;
  }>;
  phones: Array<{ phone_number: string; label: string; note: string | null }>;
  emails: Array<{ email: string; label: string; note: string | null }>;
  bank: {
    iban: string | null;
    bic: string | null;
    account_holder: string | null;
    bank_name: string | null;
  } | null;
  ai_corrections: string[];
  is_duplicate: boolean;
}

async function analyzeWithMistral(rows: CsvRow[]): Promise<any[]> {
  const MISTRAL_API_KEY = Deno.env.get("MISTRAL_API_KEY");
  if (!MISTRAL_API_KEY) throw new Error("MISTRAL_API_KEY not configured");

  // Process in batches of 20 to avoid token limits
  const batchSize = 20;
  const results: any[] = [];

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);

    const prompt = `Du bist ein Daten-Parser für ein Hausverwaltungssystem. Analysiere die folgenden Adressdaten aus einem CSV-Export und extrahiere strukturierte Kontaktdaten.

Regeln:
1. Wenn "Nachname" mehrere Personen enthält (z.B. "Andrea und Heiko Weber", "Eheleute Müller/Schmidt"), splitte in separate Personen mit korrektem Vor- und Nachnamen.
2. Wenn "Anrede" = "Firma" ist, setze contact_type auf "company" und den Nachname-Wert als company_name.
3. Extrahiere aus Telefonnummern eingebettete Notizen (z.B. "0157/58081955 Andrea" → phone: "0157/58081955", note: "Andrea").
4. Wenn Name2 oder Name3 vorhanden sind, erstelle zusätzliche Personen.
5. Erkenne "Dienstleister" wenn Stichwort Begriffe wie "Handwerker", "Wartung", "Service", "Reinigung", "Garten" enthält → contact_type = "service_provider".

Für jede Zeile gib ein JSON-Objekt zurück mit:
- contact_type: "person" | "company" | "service_provider"
- first_name, last_name (der Hauptperson)
- company_name (nur wenn Firma)
- additional_persons: [{first_name, last_name}] (weitere Personen)
- phone_notes: [{original, cleaned_number, note}] (für Telefonnummern mit eingebetteten Notizen)
- ai_notes: string[] (was die KI korrigiert/erkannt hat)

Eingabedaten (JSON):
${JSON.stringify(batch, null, 2)}

Antworte NUR mit einem JSON-Array, keine Erklärung.`;

    const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${MISTRAL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "mistral-small-latest",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Mistral error:", response.status, err);
      // Return empty analysis for this batch
      results.push(...batch.map(() => null));
      continue;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "[]";
    
    try {
      const parsed = JSON.parse(content);
      const arr = Array.isArray(parsed) ? parsed : (parsed.results || parsed.contacts || [parsed]);
      results.push(...arr);
    } catch {
      console.error("Failed to parse Mistral response:", content.substring(0, 200));
      results.push(...batch.map(() => null));
    }
  }

  return results;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, rows } = await req.json();

    if (action === "analyze") {
      // Step 1: AI analysis only — return parsed suggestions
      if (!rows || !Array.isArray(rows) || rows.length === 0) {
        return new Response(JSON.stringify({ error: "No rows provided" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check for duplicates
      const { data: existingContacts } = await supabase
        .from("contacts")
        .select("short_name, company_name, first_name, last_name");

      const existingNames = new Set(
        (existingContacts || []).map(c => 
          (c.short_name || c.company_name || `${c.last_name}_${c.first_name}`).toLowerCase().trim()
        )
      );

      // Run AI analysis on rows with complex names
      const complexRows = rows.map((row: CsvRow, idx: number) => {
        const name = row.nachname || "";
        const hasMultiple = /\bund\b|&|\//i.test(name) || (row.anrede || "").toLowerCase() === "eheleute";
        const hasPhoneNotes = (row.telefon || []).some((t: string) => /[a-zA-ZäöüÄÖÜ]{3,}/.test(t.replace(/[\d\s\-\/\+\(\)]/g, "")));
        return { ...row, _index: idx, _needsAi: hasMultiple || hasPhoneNotes || (row.anrede || "").toLowerCase() === "firma" };
      });

      const aiNeeded = complexRows.filter((r: any) => r._needsAi);
      let aiResults: any[] = [];
      
      if (aiNeeded.length > 0) {
        aiResults = await analyzeWithMistral(aiNeeded);
      }

      // Build result for all rows
      let aiIdx = 0;
      const parsedContacts: ParsedContact[] = complexRows.map((row: any) => {
        const aiResult = row._needsAi ? aiResults[aiIdx++] : null;
        const anrede = (row.anrede || "").trim();
        const isCompany = anrede.toLowerCase() === "firma" || (aiResult?.contact_type === "company");
        const isServiceProvider = aiResult?.contact_type === "service_provider";

        let contactType = "person";
        if (isCompany) contactType = "company";
        else if (isServiceProvider) contactType = "service_provider";

        const firstName = aiResult?.first_name || null;
        const lastName = aiResult?.last_name || row.nachname || null;
        const companyName = isCompany ? (row.nachname || aiResult?.company_name || null) : null;

        // Build persons
        const persons: ParsedContact["persons"] = [];
        if (firstName || lastName) {
          persons.push({ salutation: anrede || null, first_name: firstName, last_name: isCompany ? null : lastName, is_primary: true });
        }
        // Additional persons from AI
        if (aiResult?.additional_persons) {
          for (const p of aiResult.additional_persons) {
            persons.push({ salutation: null, first_name: p.first_name, last_name: p.last_name, is_primary: false });
          }
        }
        // Name2, Name3
        if (row.name2 && !aiResult?.additional_persons?.length) {
          persons.push({ salutation: null, first_name: null, last_name: row.name2, is_primary: false });
        }
        if (row.name3) {
          persons.push({ salutation: null, first_name: null, last_name: row.name3, is_primary: false });
        }

        // Phones with note extraction
        const phones: ParsedContact["phones"] = [];
        const phoneNoteMap = new Map<string, { cleaned_number: string; note: string }>();
        if (aiResult?.phone_notes) {
          for (const pn of aiResult.phone_notes) {
            phoneNoteMap.set(pn.original, { cleaned_number: pn.cleaned_number, note: pn.note });
          }
        }
        (row.telefon || []).forEach((t: string, i: number) => {
          if (!t || t.trim() === "") return;
          const mapped = phoneNoteMap.get(t);
          phones.push({
            phone_number: mapped?.cleaned_number || t.trim(),
            label: i === 0 ? "Festnetz" : "Mobil",
            note: mapped?.note || null,
          });
        });
        if (row.fax && row.fax.trim()) {
          phones.push({ phone_number: row.fax.trim(), label: "Fax", note: null });
        }

        // Emails
        const emails: ParsedContact["emails"] = (row.emails || [])
          .filter((e: string) => e && e.trim())
          .map((e: string, i: number) => ({
            email: e.trim(),
            label: i === 0 ? "Geschäftlich" : "Privat",
            note: null,
          }));

        // Bank
        const bank = (row.iban || row.bic || row.inhaber || row.bank) ? {
          iban: row.iban || null,
          bic: row.bic || null,
          account_holder: row.inhaber || null,
          bank_name: row.bank || null,
        } : null;

        // Duplicate check
        const checkName = (row.stichwort || companyName || `${lastName}_${firstName}`).toLowerCase().trim();
        const isDuplicate = existingNames.has(checkName);

        // Notes
        const noteParts: string[] = [];
        if (row.webseite) noteParts.push(`Webseite: ${row.webseite}`);
        
        return {
          short_name: row.stichwort || null,
          salutation: anrede || null,
          contact_type: contactType,
          first_name: isCompany ? null : firstName,
          last_name: isCompany ? null : lastName,
          company_name: companyName,
          address_street: row.strasse || null,
          address_zip: row.plz || null,
          address_city: row.ort || null,
          notes: noteParts.length > 0 ? noteParts.join("\n") : null,
          persons,
          phones,
          emails,
          bank,
          ai_corrections: aiResult?.ai_notes || [],
          is_duplicate: isDuplicate,
        };
      });

      return new Response(JSON.stringify({ contacts: parsedContacts }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "import") {
      // Step 2: Bulk insert confirmed contacts
      const contacts = rows as ParsedContact[];
      if (!contacts || contacts.length === 0) {
        return new Response(JSON.stringify({ error: "No contacts to import" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let imported = 0;
      let errors: string[] = [];

      // Process in batches of 50
      for (let i = 0; i < contacts.length; i += 50) {
        const batch = contacts.slice(i, i + 50);
        
        for (const c of batch) {
          try {
            // Insert contact
            const { data: contactData, error: contactError } = await supabase
              .from("contacts")
              .insert({
                short_name: c.short_name,
                salutation: c.salutation,
                contact_type: c.contact_type,
                first_name: c.first_name,
                last_name: c.last_name,
                company_name: c.company_name,
                address_street: c.address_street,
                address_zip: c.address_zip,
                address_city: c.address_city,
                notes: c.notes,
              })
              .select("id")
              .single();

            if (contactError || !contactData) {
              errors.push(`${c.short_name || c.last_name}: ${contactError?.message}`);
              continue;
            }

            const contactId = contactData.id;

            // Insert persons
            if (c.persons.length > 0) {
              const personInserts = c.persons.map((p, idx) => ({
                contact_id: contactId,
                salutation: p.salutation,
                first_name: p.first_name,
                last_name: p.last_name,
                is_primary: p.is_primary,
                sort_order: idx,
              }));
              await supabase.from("contact_persons").insert(personInserts);
            }

            // Insert phones
            if (c.phones.length > 0) {
              const phoneInserts = c.phones.map(p => ({
                contact_id: contactId,
                phone_number: p.phone_number,
                label: p.label,
                note: p.note,
              }));
              await supabase.from("contact_phones").insert(phoneInserts);
            }

            // Insert emails
            if (c.emails.length > 0) {
              const emailInserts = c.emails.map((e, idx) => ({
                contact_id: contactId,
                email: e.email,
                label: e.label,
                is_primary: idx === 0,
                note: e.note,
              }));
              await supabase.from("contact_emails").insert(emailInserts);
            }

            // Insert bank account
            if (c.bank && (c.bank.iban || c.bank.account_holder)) {
              await supabase.from("contact_bank_accounts").insert({
                contact_id: contactId,
                iban: c.bank.iban,
                bic: c.bank.bic,
                account_holder: c.bank.account_holder,
                bank_name: c.bank.bank_name,
                is_default: true,
              });
            }

            imported++;
          } catch (e) {
            errors.push(`${c.short_name || c.last_name}: ${e.message}`);
          }
        }
      }

      return new Response(JSON.stringify({ imported, errors, total: contacts.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("import-contacts-csv error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
