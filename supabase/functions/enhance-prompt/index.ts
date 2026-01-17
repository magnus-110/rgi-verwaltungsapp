import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MISTRAL_API_KEY = Deno.env.get('MISTRAL_API_KEY');

const ENHANCER_SYSTEM_PROMPT = `Rolle: Du bist ein hochqualifizierter Senior-Berater für Immobilienverwaltung.
Deine Aufgabe ist es, Nutzeranfragen so aufzubereiten, dass sie in einem Sammeldokument 
(Teilungserklärung, Beschlüsse, Buchhaltung, Versicherungen) zielsicher die richtigen Textstellen finden.

ANALYSE-SCHRITTE:

1. QUELLEN-IDENTIFIKATION (Kategorien in der Datenbank):
   - "rechtlich" = Teilungserklärung, Gemeinschaftsordnung, Verträge, Gesetze, Satzungen
   - "protokoll" = Beschlusssammlung, Eigentümerversammlungen, Abstimmungen
   - "finanzen" = Abrechnungen, Hausgeld, Rücklagen, Wirtschaftsplan, Kontoauszüge
   - "technik" = Heizung, Aufzug, Wartung, Reparaturen, Instandhaltung, Gebäudetechnik
   - "versicherung" = Versicherungspolicen, Schäden, Deckung, Prämien
   - "eigentuemer" = Eigentümerlisten, MEA, Wohneinheiten, Sondereigentum
   - "verwalter" = Verwaltungsthemen, Hausverwaltung, Verwaltervertrag

2. TERMINOLOGISCHE EXPANSION:
   Erweitere die Anfrage um professionelle Fachbegriffe und Synonyme, die im Dokument vorkommen könnten.
   
   Beispiele:
   - "Versicherung" → "Gebäudeversicherung", "Versicherungspolice", "Versicherungsschein", "Deckungsumfang", "Prämienzahlung"
   - "Kaputtes Dach" → "Dachinstandsetzung", "Dachsanierung", "Mangel am Gemeinschaftseigentum", "Kostenvoranschlag"
   - "Hausgeld" → "Wohngeld", "monatliche Vorauszahlung", "Hausgeldabrechnung", "Wirtschaftsplan"
   - "Aufzug" → "Lift", "Fahrstuhl", "Aufzugsanlage", "Wartungsvertrag Aufzug"

3. FEATURE-ERKENNUNG (falls relevant für die Anfrage):
   - "gas_heating" = Gasheizung, Erdgas
   - "oil_heating" = Ölheizung, Heizöl
   - "heat_pump" = Wärmepumpe
   - "district_heating" = Fernwärme
   - "solar" = Solaranlage, Photovoltaik, PV-Anlage
   - "elevator" = Aufzug, Lift, Fahrstuhl
   - "parking" = Tiefgarage, Stellplatz, Parkplatz, Garage

AUSGABE (NUR gültiges JSON, kein anderer Text):
{
  "enhanced_query": "Optimierte Suchanfrage mit Fachbegriffen (max 100 Wörter)",
  "categories": ["finanzen", "protokoll"],
  "features": ["elevator"],
  "keywords": ["Hausgeld", "Rücklage", "Wirtschaftsplan"],
  "source_hint": "Kurze Erklärung wo die Information wahrscheinlich liegt (1 Satz)"
}

WICHTIG:
- Antworte AUSSCHLIESSLICH mit dem JSON-Objekt
- Keine Erklärungen, keine Einleitungen
- Das JSON muss valide und parsebar sein
- "categories" enthält nur die relevantesten 1-3 Kategorien
- "features" nur wenn explizit relevant (sonst leeres Array)`;

interface EnhancePromptRequest {
  question: string;
}

interface EnhancePromptResponse {
  original: string;
  enhanced_query: string;
  categories: string[];
  features: string[];
  keywords: string[];
  source_hint: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { question } = await req.json() as EnhancePromptRequest;

    if (!question || question.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'Question is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!MISTRAL_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'MISTRAL_API_KEY is not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Enhancing prompt: "${question.substring(0, 100)}..."`);

    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MISTRAL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'mistral-small-latest',
        messages: [
          { role: 'system', content: ENHANCER_SYSTEM_PROMPT },
          { role: 'user', content: question }
        ],
        temperature: 0.3,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Mistral API error:', response.status, errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to enhance prompt' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content || '';

    console.log('Raw LLM response:', content);

    // Parse JSON response
    let parsed: any;
    try {
      // Try to extract JSON from the response (in case there's extra text)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Failed to parse LLM response as JSON:', parseError);
      // Return a fallback response using the original question
      parsed = {
        enhanced_query: question,
        categories: [],
        features: [],
        keywords: [],
        source_hint: 'Konnte Prompt nicht optimieren'
      };
    }

    const result: EnhancePromptResponse = {
      original: question,
      enhanced_query: parsed.enhanced_query || question,
      categories: parsed.categories || [],
      features: parsed.features || [],
      keywords: parsed.keywords || [],
      source_hint: parsed.source_hint || '',
    };

    console.log(`Enhanced prompt: categories=${result.categories.join(',')}, features=${result.features.join(',')}`);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Enhance prompt error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
