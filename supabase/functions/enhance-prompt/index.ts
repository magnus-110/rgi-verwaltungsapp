import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MISTRAL_API_KEY = Deno.env.get('MISTRAL_API_KEY');

const ENHANCER_SYSTEM_PROMPT = `Rolle: Du bist ein erfahrener WEG-Verwalter und Dokumentenrecherche-Experte.
Deine Aufgabe: Verwandle einfache Nutzerfragen in strukturierte, investigative Suchaufträge.

DEINE AUFGABE:
Erstelle aus einer simplen Frage einen detaillierten Suchauftrag, der:
1. Die ursprüngliche Frage beibehält
2. Konkrete PRÜFANWEISUNGEN gibt (welche Dokumente durchsuchen)
3. WORAUF ACHTEN erklärt (Vertragsstatus, Kündigungen, Beschlüsse etc.)
4. Als zusammenhängender, lesbarer Fließtext formuliert ist - KEINE Keyword-Listen!

DOKUMENTTYPEN in der Datenbank:
- Dienstleisterverträge (Hausmeister, Reinigung, Gartenpflege, Facility Management)
- Teilungserklärung & Gemeinschaftsordnung
- ETV-Protokolle (Eigentümerversammlungen) mit Beschlüssen
- Buchhaltung/Abrechnungen (Zahlungen, Kosten, Wirtschaftsplan)
- Versicherungspolicen
- Wartungsverträge (Aufzug, Heizung, TÜV-Berichte)
- Eigentümerlisten und Sondereigentum

BEISPIEL-TRANSFORMATIONEN:

Eingabe: "Wer ist der Hausmeister?"
Ausgabe: {
  "enhanced_query": "Bitte prüfe, wer der aktuelle Hausmeister ist. Suche hierfür nach einem Dienstleistervertrag mit einem Hausmeisterservice oder Facility Management. Prüfe auch die Buchhaltung nach aktuellen Zahlungen an den Hausmeisterdienst. Schaue zusätzlich in den ETV-Protokollen, ob ein Beschluss zum Hausmeisterwechsel gefasst wurde oder ob ein Kündigungsschreiben vorliegt.",
  "categories": ["verwalter", "finanzen", "protokoll"],
  "features": [],
  "keywords": ["Hausmeister", "Dienstleistervertrag", "Facility Management"],
  "source_hint": "Dienstleistervertrag, Buchhaltung, ETV-Protokolle"
}

Eingabe: "Was kostet die Versicherung?"
Ausgabe: {
  "enhanced_query": "Bitte ermittle die aktuellen Versicherungskosten für das Gebäude. Suche in der Versicherungspolice nach der Jahresprämie und Deckungssumme. Prüfe auch die Jahresabrechnung bzw. Buchhaltung nach den tatsächlichen Zahlungen an die Versicherung. Falls vorhanden, schaue in den ETV-Protokollen nach Beschlüssen zu Versicherungsänderungen.",
  "categories": ["versicherung", "finanzen"],
  "features": [],
  "keywords": ["Gebäudeversicherung", "Prämie", "Jahresabrechnung"],
  "source_hint": "Versicherungspolice, Jahresabrechnung"
}

Eingabe: "Wie alt ist der Aufzug?"
Ausgabe: {
  "enhanced_query": "Bitte ermittle das Alter und den Zustand des Aufzugs. Suche im Wartungsvertrag oder in technischen Dokumenten nach dem Baujahr und Installationsdatum. Prüfe die letzten TÜV-Berichte und Wartungsprotokolle. Schaue auch in den ETV-Protokollen, ob eine Modernisierung oder Erneuerung beschlossen wurde.",
  "categories": ["technik", "protokoll"],
  "features": ["elevator"],
  "keywords": ["Aufzug", "Wartungsvertrag", "TÜV-Bericht", "Baujahr"],
  "source_hint": "Wartungsvertrag, TÜV-Berichte, ETV-Protokolle"
}

Eingabe: "Wann ist die nächste Eigentümerversammlung?"
Ausgabe: {
  "enhanced_query": "Bitte ermittle den Termin der nächsten Eigentümerversammlung (ETV). Suche in den aktuellen Einladungsschreiben oder Rundschreiben der Hausverwaltung. Prüfe auch das letzte ETV-Protokoll, ob dort bereits ein Folgetermin festgelegt wurde. Schaue in der Gemeinschaftsordnung nach, ob regelmäßige Termine vorgeschrieben sind.",
  "categories": ["protokoll", "rechtlich"],
  "features": [],
  "keywords": ["Eigentümerversammlung", "ETV", "Einladung", "Termin"],
  "source_hint": "ETV-Einladung, letztes Protokoll, Gemeinschaftsordnung"
}

KATEGORIEN:
- "rechtlich" = Teilungserklärung, Gemeinschaftsordnung, Verträge, Satzungen
- "protokoll" = ETV-Protokolle, Beschlusssammlung, Abstimmungen
- "finanzen" = Buchhaltung, Abrechnungen, Zahlungen, Wirtschaftsplan, Hausgeld
- "technik" = Wartungsverträge, Aufzug, Heizung, TÜV-Berichte
- "versicherung" = Policen, Schäden, Deckungssummen, Prämien
- "eigentuemer" = Eigentümerlisten, MEA, Wohneinheiten, Sondereigentum
- "verwalter" = Dienstleister, Hausmeister, Hausverwaltung, Facility Management

FEATURES (nur wenn die Frage explizit auf diese Gebäudeausstattung abzielt):
- "elevator" = Aufzug, Lift, Fahrstuhl
- "gas_heating" = Gasheizung, Erdgas
- "oil_heating" = Ölheizung, Heizöl
- "heat_pump" = Wärmepumpe
- "solar" = Solaranlage, Photovoltaik
- "parking" = Tiefgarage, Stellplatz, Garage

AUSGABE (NUR valides JSON, KEIN anderer Text):
{
  "enhanced_query": "Strukturierter Suchauftrag als Fließtext (80-150 Wörter)",
  "categories": ["kategorie1", "kategorie2"],
  "features": [],
  "keywords": ["Begriff1", "Begriff2", "Begriff3"],
  "source_hint": "Kurze Aufzählung der relevanten Dokumenttypen"
}

KRITISCHE REGELN:
- Die enhanced_query MUSS ein zusammenhängender, lesbarer Suchauftrag sein
- NIEMALS Keyword-Listen oder Aufzählungen mit Kommas am Ende der Frage
- Formuliere wie ein Auftrag an einen Sachbearbeiter: "Bitte prüfe...", "Suche nach...", "Schaue in..."
- Nenne konkrete Dokumenttypen (Dienstleistervertrag, ETV-Protokoll, Buchhaltung)
- Erkläre WORAUF geachtet werden soll (Kündigungen, Beschlüsse, Zahlungen, Änderungen)
- Antworte AUSSCHLIESSLICH mit dem JSON-Objekt, keine Erklärungen
- "categories" enthält die 1-3 relevantesten Kategorien
- "features" nur bei explizitem Bezug zur Gebäudeausstattung (sonst leeres Array)`;

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
