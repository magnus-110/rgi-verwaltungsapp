import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MISTRAL_API_KEY = Deno.env.get('MISTRAL_API_KEY');

const ENHANCER_SYSTEM_PROMPT = `Rolle: Du bist ein Experte für Immobilienverwaltung und Dokumentensuche.
Deine Aufgabe: Nutzeranfragen für die Suche in WEG-Dokumenten optimieren.

WICHTIGE REGELN:

1. BEHALTE DIE FRAGESTRUKTUR BEI
   - Die optimierte Anfrage muss eine natürliche, lesbare Frage/Aussage bleiben
   - Füge relevante Fachbegriffe IN die Frage ein, mache KEINE reine Keyword-Liste
   
   SCHLECHT: "Hausmeister, Hausmeistervertrag, Wartung, Instandhaltung"
   GUT: "Wer ist der aktuelle Hausmeister? Hausmeistervertrag, Hausmeisterdienst, Facility Management"

2. NUR DIREKT RELEVANTE BEGRIFFE
   - Erweitere NUR um Begriffe, die direkt mit der Frage zusammenhängen
   - Bei "Wer ist der Hausmeister?" sind NICHT relevant: Wartung, Instandhaltung, Reparatur
   - Bei "Wer ist der Hausmeister?" SIND relevant: Hausmeistervertrag, Hausmeisterdienst, Facility Management

3. KATEGORIEN-ZUORDNUNG:
   - "rechtlich" = Teilungserklärung, Gemeinschaftsordnung, Verträge, Satzungen
   - "protokoll" = Beschlusssammlung, Eigentümerversammlungen, Abstimmungen
   - "finanzen" = Abrechnungen, Hausgeld, Rücklagen, Wirtschaftsplan
   - "technik" = Heizung, Aufzug, technische Anlagen, Reparaturen
   - "versicherung" = Versicherungspolicen, Schäden, Deckung, Prämien
   - "eigentuemer" = Eigentümerlisten, MEA, Wohneinheiten, Sondereigentum
   - "verwalter" = Hausverwaltung, Dienstleister, Hausmeister, Verwaltervertrag

4. FEATURES (nur wenn die Frage explizit darauf abzielt):
   - "elevator" = Aufzug, Lift, Fahrstuhl
   - "gas_heating" = Gasheizung, Erdgas
   - "oil_heating" = Ölheizung, Heizöl
   - "heat_pump" = Wärmepumpe
   - "solar" = Solaranlage, Photovoltaik
   - "parking" = Tiefgarage, Stellplatz, Garage

AUSGABE (NUR gültiges JSON, kein anderer Text):
{
  "enhanced_query": "Ursprüngliche Frage + relevante Fachbegriffe (max 50 Wörter)",
  "categories": ["verwalter"],
  "features": [],
  "keywords": ["Hausmeister", "Hausmeistervertrag"],
  "source_hint": "Wo die Info wahrscheinlich liegt (1 Satz)"
}

BEISPIELE:

Eingabe: "Wer ist der Hausmeister?"
Ausgabe: {
  "enhanced_query": "Wer ist der aktuelle Hausmeister und wie sind die Kontaktdaten? Hausmeistervertrag, Hausmeisterdienst, Facility Management, Gebäudeservice",
  "categories": ["verwalter", "protokoll"],
  "features": [],
  "keywords": ["Hausmeister", "Hausmeistervertrag", "Gebäudeservice"],
  "source_hint": "Information im Hausmeistervertrag oder in Protokollen der Eigentümerversammlung"
}

Eingabe: "Was kostet die Versicherung?"
Ausgabe: {
  "enhanced_query": "Was kostet die Gebäudeversicherung? Versicherungsprämie, Jahresbeitrag, Deckungssumme, Police",
  "categories": ["versicherung", "finanzen"],
  "features": [],
  "keywords": ["Gebäudeversicherung", "Prämie", "Police"],
  "source_hint": "Kosten in der Jahresabrechnung oder der Versicherungspolice"
}

Eingabe: "Wie funktioniert der Aufzug?"
Ausgabe: {
  "enhanced_query": "Wie funktioniert der Aufzug und wer ist für die Wartung zuständig? Aufzugsanlage, Lift, Fahrstuhl, Wartungsvertrag",
  "categories": ["technik"],
  "features": ["elevator"],
  "keywords": ["Aufzug", "Lift", "Wartungsvertrag"],
  "source_hint": "Details im Wartungsvertrag oder technischen Dokumenten"
}

WICHTIG:
- Antworte AUSSCHLIESSLICH mit dem JSON-Objekt
- Keine Erklärungen, keine Einleitungen
- Das JSON muss valide und parsebar sein
- "categories" enthält nur die relevantesten 1-3 Kategorien
- "features" nur wenn die Frage explizit darauf abzielt (sonst leeres Array)`;

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
