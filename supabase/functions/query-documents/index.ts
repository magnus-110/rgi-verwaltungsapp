import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MISTRAL_API_KEY = Deno.env.get('MISTRAL_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

interface QueryDocumentsRequest {
  sessionId: string;
  question: string;
  buildingId: string | null;
  buildingIds?: string[] | null;
  includeGeneral: boolean;
  userId: string;
  searchAllBuildings?: boolean;
  useWebSearch?: boolean;
  useDeepResearch?: boolean;
  // New metadata filter options
  filterCategories?: string[];
  filterFeatures?: string[];
}

// Rule-based metadata extraction (no LLM call needed)
function extractMetadataFromQuestion(question: string): {
  categories: string[];
  features: string[];
} {
  const lowerQuestion = question.toLowerCase();
  
  const categoryKeywords: Record<string, string[]> = {
    'finanzen': ['hausgeld', 'abrechnung', 'kosten', 'rücklage', 'wirtschaftsplan', 'zahlung', 'geld', 'euro', 'preis', 'gebühr', 'budget', 'konto', 'bilanz', 'einnahmen', 'ausgaben'],
    'rechtlich': ['teilungserklärung', 'gemeinschaftsordnung', 'gesetz', 'recht', 'vertrag', 'paragraph', 'klausel', 'satzung', 'ordnung', 'regelung'],
    'protokoll': ['beschluss', 'versammlung', 'abstimmung', 'protokoll', 'eigentümerversammlung', 'weg', 'tagesordnung', 'antrag'],
    'technik': ['heizung', 'aufzug', 'lift', 'wartung', 'reparatur', 'dach', 'fassade', 'sanitär', 'elektro', 'installation', 'instandhaltung', 'anlage'],
    'versicherung': ['versicherung', 'police', 'schaden', 'deckung', 'prämie', 'versichert', 'schadensfall'],
    'eigentuemer': ['eigentümer', 'wohnung', 'einheit', 'miteigentumsanteil', 'mea', 'sondereigentum', 'teileigentum']
  };
  
  const featureKeywords: Record<string, string[]> = {
    'elevator': ['aufzug', 'lift', 'fahrstuhl'],
    'gas_heating': ['gasheizung', 'gas-heizung', 'erdgas'],
    'oil_heating': ['ölheizung', 'öl-heizung', 'heizöl'],
    'heat_pump': ['wärmepumpe', 'wärme-pumpe'],
    'solar': ['solar', 'photovoltaik', 'pv-anlage'],
    'parking': ['tiefgarage', 'stellplatz', 'parkplatz', 'garage']
  };
  
  const categories = Object.entries(categoryKeywords)
    .filter(([_, keywords]) => keywords.some(kw => lowerQuestion.includes(kw)))
    .map(([category]) => category);
  
  const features = Object.entries(featureKeywords)
    .filter(([_, keywords]) => keywords.some(kw => lowerQuestion.includes(kw)))
    .map(([feature]) => feature);
  
  return { categories, features };
}

// ============================================================
// CATEGORY DETECTOR (LLM-light) — maps question to DMS folders
// ============================================================

interface TaxonomyEntry {
  slug: string;
  name: string;
  path: string[];
}

// In-memory cache per invocation (lifetime of single edge function call is short, but helps within batches)
let _taxonomyCache: { buildingId: string | null; entries: TaxonomyEntry[]; ts: number } | null = null;

async function loadCategoryTaxonomy(supabase: any, buildingId: string | null): Promise<TaxonomyEntry[]> {
  if (_taxonomyCache && _taxonomyCache.buildingId === buildingId && Date.now() - _taxonomyCache.ts < 60_000) {
    return _taxonomyCache.entries;
  }
  try {
    const { data, error } = await supabase.rpc('get_category_taxonomy', { p_building_id: buildingId });
    if (error) {
      console.error('get_category_taxonomy error:', error);
      return [];
    }
    const entries: TaxonomyEntry[] = (data || []).map((row: any) => ({
      slug: row.slug,
      name: row.name,
      path: Array.isArray(row.path) ? row.path : [],
    })).filter((e: TaxonomyEntry) => e.slug);
    _taxonomyCache = { buildingId, entries, ts: Date.now() };
    return entries;
  } catch (err) {
    console.error('Failed to load taxonomy:', err);
    return [];
  }
}

async function detectCategorySlugs(question: string, taxonomy: TaxonomyEntry[]): Promise<string[]> {
  if (taxonomy.length === 0) return [];

  // Build a compact list for the LLM: "slug | full path"
  const list = taxonomy
    .map(t => `${t.slug} | ${t.path.join(' › ') || t.name}`)
    .join('\n');

  const systemPrompt = `Du bist ein Klassifizierer für Dokumentenordner einer Hausverwaltung.
Du bekommst eine Frage und eine Liste verfügbarer Ordner (Format: "slug | Pfad").
Wähle 0 bis 3 slugs, in deren Ordnern die Antwort am wahrscheinlichsten zu finden ist.

REGELN:
- Antworte AUSSCHLIESSLICH mit JSON-Array von slugs, z.B. ["stammakte-teilungserklaerung"]
- Wenn die Frage keinem Ordner klar zuzuordnen ist: []
- Bei Oberbegriffen (z.B. "Verträge") wähle alle relevanten Unterordner
- KEINE Erklärung, nur das Array`;

  try {
    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MISTRAL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'mistral-small-latest',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Verfügbare Ordner:\n${list}\n\nFrage: ${question}` }
        ],
        temperature: 0.1,
        max_tokens: 150,
        response_format: { type: 'json_object' },
      }),
    });
    if (!response.ok) {
      console.error('Category detector failed:', await response.text());
      return [];
    }
    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content || '[]';
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // try to extract array from string
      const match = raw.match(/\[[^\]]*\]/);
      parsed = match ? JSON.parse(match[0]) : [];
    }
    // Accept either array directly, or { slugs: [...] } / { categories: [...] }
    let slugs: string[] = [];
    if (Array.isArray(parsed)) slugs = parsed;
    else if (Array.isArray(parsed.slugs)) slugs = parsed.slugs;
    else if (Array.isArray(parsed.categories)) slugs = parsed.categories;

    // Validate slugs against taxonomy
    const validSlugs = new Set(taxonomy.map(t => t.slug));
    const filtered = slugs.filter(s => typeof s === 'string' && validSlugs.has(s)).slice(0, 3);
    console.log(`Category detector → [${filtered.join(', ')}]`);
    return filtered;
  } catch (err) {
    console.error('Category detection error:', err);
    return [];
  }
}

// Hybrid retrieval: category-filtered + global fallback + boost
async function hybridCategoryRetrieval(
  supabase: any,
  embedding: number[],
  buildingId: string | null,
  categorySlugs: string[],
  limit: number = 8
): Promise<any[]> {
  const seen = new Set<string>();
  const results: any[] = [];

  // Phase 1: category-filtered search via new RPC
  if (categorySlugs.length > 0) {
    try {
      const { data, error } = await supabase.rpc('search_chunks_by_category', {
        p_query_embedding: `[${embedding.join(',')}]`,
        p_building_id: buildingId,
        p_category_slugs: categorySlugs,
        p_match_count: limit,
        p_boost: 0.1,
      });
      if (!error && data) {
        for (const chunk of data) {
          if (!seen.has(chunk.id)) {
            seen.add(chunk.id);
            results.push(chunk);
          }
        }
        console.log(`Phase 1 (category-filtered): ${data.length} chunks`);
      } else if (error) {
        console.error('search_chunks_by_category error:', error);
      }
    } catch (err) {
      console.error('Phase 1 retrieval error:', err);
    }
  }

  // Phase 2: global fallback if too few hits or low similarity
  const bestSim = results.length > 0 ? Math.max(...results.map(r => r.similarity || 0)) : 0;
  if (results.length < 4 || bestSim < 0.65) {
    console.log(`Phase 2 (global fallback): existing=${results.length} bestSim=${bestSim.toFixed(2)}`);
    try {
      const { data, error } = await supabase.rpc('search_chunks_by_category', {
        p_query_embedding: `[${embedding.join(',')}]`,
        p_building_id: buildingId,
        p_category_slugs: null,
        p_match_count: 4,
        p_boost: 0,
      });
      if (!error && data) {
        for (const chunk of data) {
          if (!seen.has(chunk.id)) {
            seen.add(chunk.id);
            results.push(chunk);
          }
        }
      } else if (error) {
        console.error('Fallback search error:', error);
      }
    } catch (err) {
      console.error('Phase 2 retrieval error:', err);
    }
  }

  // Sort by similarity (already boosted) and trim
  results.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
  return results.slice(0, limit);
}

// Default system prompts
const DEFAULT_DOCUMENT_SYSTEM_PROMPT = `Du bist ein Dokumenten-Assistent für die Immobilienverwaltung.

STRENGE REGELN - UNBEDINGT BEFOLGEN:
1. Antworte AUSSCHLIESSLICH basierend auf den bereitgestellten Dokumenten
2. Verwende KEIN eigenes Wissen - nur die Dokumente zählen
3. Wenn die Information NICHT in den Dokumenten vorhanden ist, antworte:
   "Diese Information ist in den verfügbaren Dokumenten nicht enthalten. 
   Aktivieren Sie die Internet-Suche (🌐) für eine Recherche im Web."
4. Erfinde NIEMALS Informationen
5. Gib bei jeder Antwort die Quelle an (Dokumentname, Seite)
6. Antworte auf Deutsch
7. Sei präzise und zitiere relevante Passagen

Du hast KEINEN Zugang zum Internet. Deine EINZIGE Wissensquelle sind die Dokumente.`;

const DEFAULT_WEB_SYSTEM_PROMPT = `Du bist ein Recherche-Assistent für die Immobilienverwaltung.

DU HAST ZWEI WISSENSQUELLEN:
1. INTERNE DOKUMENTE: Dir werden relevante interne Dokumente bereitgestellt (siehe "KONTEXT AUS INTERNEN DOKUMENTEN")
2. INTERNET-RECHERCHE: Du kannst zusätzlich im Internet recherchieren

VORGEHENSWEISE:
1. Prüfe ZUERST, ob die Information in den internen Dokumenten vorhanden ist
2. Nutze die internen Dokumente als primäre und vertrauenswürdigste Quelle
3. Ergänze mit Internet-Recherche, wenn:
   - Die internen Dokumente keine Antwort liefern
   - Aktuelle Gesetzestexte oder Urteile benötigt werden
   - Der Nutzer explizit nach externen Informationen fragt

RICHTLINIEN:
- Kennzeichne klar, ob die Information aus internen Dokumenten oder dem Internet stammt
- Bei Informationen aus internen Dokumenten: Gib das Dokument und die Seite an
- Bei rechtlichen Fragen: Verweise auf offizielle Quellen (Gesetze, BGH-Urteile)
- Antworte auf Deutsch
- Weise bei rechtlichen Themen darauf hin, dass dies keine Rechtsberatung ist

Du kombinierst internes Wissen mit aktueller Internet-Recherche.`;

interface DocumentInfo {
  id: string;
  file_name: string;
  file_path: string;
  signedUrl?: string;
}

// Retry helper for transient API errors
async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 2): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, options);
    if (response.ok || attempt === maxRetries) return response;
    const errorText = await response.text();
    const isTransient = response.status >= 500 || errorText.includes('overflow') || errorText.includes('reset');
    if (!isTransient) {
      // Non-transient error, don't retry
      return new Response(errorText, { status: response.status, statusText: response.statusText });
    }
    console.log(`Retry ${attempt + 1}/${maxRetries} after transient error: ${response.status}`);
    await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
  }
  throw new Error('Unreachable');
}

// Generate embedding for the question
async function generateQuestionEmbedding(question: string): Promise<number[]> {
  const response = await fetchWithRetry('https://api.mistral.ai/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MISTRAL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'mistral-embed',
      input: [question],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Embedding generation failed: ${errorText}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

// Search for similar chunks using vector similarity with AUTOMATIC metadata filtering
async function searchSimilarChunks(
  supabase: any,
  embedding: number[],
  buildingId: string | null,
  includeGeneral: boolean,
  limit: number = 10,
  searchAllBuildings: boolean = false,
  filterCategories: string[] | null = null,
  filterFeatures: string[] | null = null
): Promise<Array<{id: string, document_id: string, content: string, metadata: any, building_id: string | null, similarity: number}>> {
  
  // Use the metadata-aware RPC function for filtered search
  const hasFilters = (filterCategories && filterCategories.length > 0) || 
                     (filterFeatures && filterFeatures.length > 0);
  
  if (hasFilters) {
    console.log(`Searching with metadata filters: categories=${JSON.stringify(filterCategories)}, features=${JSON.stringify(filterFeatures)}`);
  }
  
  // Use search_document_chunks_with_metadata RPC for filtered search
  const { data, error } = await supabase.rpc('search_document_chunks_with_metadata', {
    query_embedding: `[${embedding.join(',')}]`,
    filter_building_id: buildingId,
    include_general: includeGeneral,
    match_count: limit,
    search_all_buildings: searchAllBuildings,
    filter_categories: filterCategories && filterCategories.length > 0 ? filterCategories : null,
    filter_features: filterFeatures && filterFeatures.length > 0 ? filterFeatures : null
  });

  if (error) {
    console.error('Vector search error:', error);
    
    // Fallback to simple RPC without metadata filters
    const { data: fallbackData, error: fallbackError } = await supabase.rpc('search_document_chunks', {
      query_embedding: `[${embedding.join(',')}]`,
      filter_building_id: buildingId,
      include_general: includeGeneral,
      match_count: limit,
      search_all_buildings: searchAllBuildings
    });
    
    if (fallbackError) {
      console.error('Fallback search also failed:', fallbackError);
      return [];
    }
    
    return fallbackData || [];
  }

  return data || [];
}

// Search for similar chunks across multiple buildings
async function searchSimilarChunksMultipleBuildings(
  supabase: any,
  embedding: number[],
  buildingIds: string[],
  includeGeneral: boolean,
  limit: number = 10
): Promise<Array<{id: string, document_id: string, content: string, metadata: any, building_id: string | null, similarity: number}>> {
  if (buildingIds.length === 0) {
    return [];
  }
  
  if (buildingIds.length === 1) {
    // Single building - use the regular function
    return searchSimilarChunks(supabase, embedding, buildingIds[0], includeGeneral, limit, false);
  }
  
  // Multiple buildings - search each and combine results
  const allResults: Array<{id: string, document_id: string, content: string, metadata: any, building_id: string | null, similarity: number}> = [];
  const seenIds = new Set<string>();
  
  // Search each building
  for (const buildingId of buildingIds) {
    const chunks = await searchSimilarChunks(supabase, embedding, buildingId, false, Math.ceil(limit / buildingIds.length) + 5, false);
    for (const chunk of chunks) {
      if (!seenIds.has(chunk.id)) {
        seenIds.add(chunk.id);
        allResults.push(chunk);
      }
    }
  }
  
  // Include general documents if requested
  if (includeGeneral) {
    const generalChunks = await searchSimilarChunks(supabase, embedding, null, true, 5, false);
    for (const chunk of generalChunks) {
      if (!seenIds.has(chunk.id) && chunk.building_id === null) {
        seenIds.add(chunk.id);
        allResults.push(chunk);
      }
    }
  }
  
  // Sort by similarity and take top results
  allResults.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
  return allResults.slice(0, limit);
}

// Get document info and generate signed URLs
async function getDocumentInfoWithUrls(
  supabase: any,
  documentIds: string[]
): Promise<Map<string, DocumentInfo>> {
  if (documentIds.length === 0) {
    return new Map();
  }

  // Fetch document metadata
  const { data: documents, error } = await supabase
    .from('building_documents')
    .select('id, file_name, file_path')
    .in('id', documentIds);

  if (error) {
    console.error('Error fetching document info:', error);
    return new Map();
  }

  // Generate signed URLs in parallel
  const documentsWithUrls = await Promise.all(
    (documents || []).map(async (doc: any) => {
      try {
        const { data: signedUrlData, error: signedUrlError } = await supabase.storage
          .from('building-documents')
          .createSignedUrl(doc.file_path, 3600); // 1 hour validity

        if (signedUrlError) {
          console.error(`Error creating signed URL for ${doc.file_name}:`, signedUrlError);
          return { ...doc, signedUrl: null };
        }

        return { ...doc, signedUrl: signedUrlData?.signedUrl };
      } catch (err) {
        console.error(`Error processing document ${doc.id}:`, err);
        return { ...doc, signedUrl: null };
      }
    })
  );

  // Create a map for quick lookup
  const documentMap = new Map<string, DocumentInfo>();
  documentsWithUrls.forEach((doc) => {
    documentMap.set(doc.id, doc);
  });

  return documentMap;
}

// Get chat settings from database - now with mode-specific prompts
async function getChatSettings(
  supabase: any, 
  useWebSearch: boolean
): Promise<{systemPrompt: string, model: string, temperature: number, maxTokens: number}> {
  const defaults = {
    documentSystemPrompt: DEFAULT_DOCUMENT_SYSTEM_PROMPT,
    webSystemPrompt: DEFAULT_WEB_SYSTEM_PROMPT,
    model: 'mistral-medium-3-5',
    temperature: 0.3,
    maxTokens: 2000,
  };

  try {
    const { data, error } = await supabase
      .from('document_chat_settings')
      .select('*')
      .limit(1)
      .single();

    if (error || !data) {
      console.log('No settings found, using defaults');
      return {
        systemPrompt: useWebSearch ? defaults.webSystemPrompt : defaults.documentSystemPrompt,
        model: defaults.model,
        temperature: defaults.temperature,
        maxTokens: defaults.maxTokens,
      };
    }

    // Select the appropriate prompt based on mode
    const documentPrompt = data.system_prompt || defaults.documentSystemPrompt;
    const webPrompt = data.web_system_prompt || defaults.webSystemPrompt;

    return {
      systemPrompt: useWebSearch ? webPrompt : documentPrompt,
      model: data.model || defaults.model,
      temperature: parseFloat(data.temperature) ?? defaults.temperature,
      maxTokens: data.max_tokens ?? defaults.maxTokens,
    };
  } catch {
    return {
      systemPrompt: useWebSearch ? defaults.webSystemPrompt : defaults.documentSystemPrompt,
      model: defaults.model,
      temperature: defaults.temperature,
      maxTokens: defaults.maxTokens,
    };
  }
}

// Query with Mistral Conversations API (Internet Search) - with document context
async function queryWithWebAgent(
  question: string,
  conversationHistory: Array<{role: string, content: string}>,
  systemPrompt: string,
  documentContext: string = ''
): Promise<{answer: string, sources: any[]}> {
  console.log('Using Mistral Conversations API with web_search connector');
  
  // Create a WEB SEARCH SPECIFIC system prompt that forces internet research
  const webSearchSystemPrompt = `Du bist NOVA, der interne KI-Assistent von RGI Immobilien.

WICHTIG: Der Benutzer hat die INTERNET-SUCHE AKTIVIERT!

=== KRITISCHE ANTWORT-REGELN (UNBEDINGT BEFOLGEN!) ===

1. Gib IMMER vollständige Antworten - brich NIEMALS mitten im Satz oder Aufzählung ab
2. Bei nummerierten Listen: Führe ALLE Punkte vollständig auf (z.B. 1., 2., 3., 4., 5... bis zum Ende)
3. Wenn du eine Liste mit mehreren Punkten hast, zeige JEDEN einzelnen Punkt
4. Beende deine Antwort IMMER mit einem vollständigen Satz (mit Punkt, Ausrufezeichen oder Fragezeichen)
5. Schreibe am Ende eine kurze Zusammenfassung wenn sinnvoll
6. NIEMALS nach "1." oder mitten in einer Aufzählung stoppen!

=== DEINE AUFGABE ===

1. FÜHRE IMMER eine Internet-Recherche durch für die gestellte Frage
2. Suche aktiv nach aktuellen, relevanten Informationen im Internet
3. Nutze den internen Dokumentkontext nur als ERGÄNZUNG, nicht als Ersatz für die Web-Suche
4. Antworte IMMER auf Deutsch

=== ANTWORTFORMAT ===

- Strukturiere mit Überschriften und Aufzählungen
- Bei Listen: Zeige ALLE relevanten Einträge (mindestens 5-10 wenn verfügbar)
- Verweise auf die verwendeten Internet-Quellen
- Kombiniere Internet-Wissen mit internem Kontext, wenn sinnvoll

${documentContext ? `=== INTERNER DOKUMENTKONTEXT (zur Ergänzung) ===
${documentContext.slice(0, 8000)}` : ''}

=== ORIGINAL SYSTEM-ANWEISUNGEN ===
${systemPrompt}`;

  console.log(`Web search prompt length: ${webSearchSystemPrompt.length} chars`);
  
  // Conversations API only accepts 'user' and 'assistant' roles - NO 'system' role!
  // Prepend system instructions to the first user message
  const firstUserMessage = `[SYSTEM-ANWEISUNGEN - BEFOLGE DIESE STRIKT]
${webSearchSystemPrompt}

[NUTZERFRAGE - FÜHRE EINE INTERNET-SUCHE DURCH]
${question}`;

  // Build inputs array - only user/assistant messages from history, then our enriched user message
  const historyMessages = conversationHistory
    .slice(-10)
    .filter(msg => msg.role === 'user' || msg.role === 'assistant')
    .map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content
    }));

  // Build and validate inputs - MUST only contain user/assistant roles
  let validatedInputs = [
    ...historyMessages,
    { role: 'user' as const, content: firstUserMessage }
  ];
  
  // Final safety check - filter out any non-user/assistant roles
  validatedInputs = validatedInputs.filter(msg => 
    msg.role === 'user' || msg.role === 'assistant'
  );
  
  // Ensure we always have at least the user question
  if (validatedInputs.length === 0) {
    validatedInputs.push({ role: 'user' as const, content: firstUserMessage });
  }
  
  console.log('Conversations API inputs:', JSON.stringify(validatedInputs.map(i => ({ 
    role: i.role, 
    contentLength: i.content.length 
  }))));

  // Call Conversations API with model + web_search tool
  // NOTE: tool_choice is NOT supported, but tools array works
  console.log('Calling Mistral Conversations API with web_search tool');
  
  const response = await fetch('https://api.mistral.ai/v1/conversations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MISTRAL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'mistral-medium-3-5',
      inputs: validatedInputs,
      tools: [{ type: 'web_search' }]
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Conversations API error:', response.status, errorText);
    throw new Error(`Web search failed: ${errorText}`);
  }

  const data = await response.json();
  console.log('Conversations API response:', JSON.stringify(data).slice(0, 1500));
  
  // Find the message.output entry (not tool.execution)
  const messageOutput = data.outputs?.find(
    (output: any) => output.type === 'message.output'
  );
  
  // Extract text from content array - content is [{type: "text", text: "..."}]
  let answer = 'Keine Antwort vom Internet-Agenten erhalten.';
  if (messageOutput?.content) {
    if (Array.isArray(messageOutput.content)) {
      // Content is an array of objects with {type, text}
      const textContent = messageOutput.content.find(
        (c: any) => c.type === 'text'
      );
      answer = textContent?.text || answer;
    } else if (typeof messageOutput.content === 'string') {
      // Fallback if content is a direct string
      answer = messageOutput.content;
    }
  }
  
  // Log answer quality for debugging
  console.log('Extracted answer length:', answer.length);
  const lastChars = answer.slice(-50);
  const endsWithPunctuation = /[.!?:)\]]$/.test(answer.trim());
  console.log('Answer ends with:', lastChars);
  console.log('Looks complete:', endsWithPunctuation);
  
  // Add warning if answer seems truncated (short + no proper ending)
  if (answer.length < 200 && !endsWithPunctuation && !answer.includes('1.')) {
    console.log('Warning: Answer may be truncated');
    answer += '\n\n⚠️ Die Antwort wurde möglicherweise unvollständig generiert. Bitte stellen Sie die Frage erneut.';
  }
  
  // Extract web sources from citations
  // Citations can be at message level or in the outputs
  const citations = messageOutput?.citations || 
                    data.citations || 
                    [];
  
  const webSources = citations.map((citation: any) => ({
    type: 'web',
    content: citation.title || citation.url || 'Internet-Quelle',
    metadata: { 
      source: 'Internet-Suche',
      url: citation.url 
    },
    fileName: citation.title || 'Internet-Suche',
    documentUrl: citation.url,
    pageNumber: null
  }));
  
  // Fallback if no citations available
  if (webSources.length === 0) {
    webSources.push({
      type: 'web',
      content: 'Internet-Recherche',
      metadata: { source: 'Internet-Suche' },
      fileName: 'Internet-Suche',
      documentUrl: null,
      pageNumber: null
    });
  }

  return {
    answer,
    sources: webSources
  };
}

// Deep Research System Prompt
const DEEP_RESEARCH_SYSTEM_PROMPT = `Du bist NOVA, ein KI-Assistent für umfassende Immobiliendokument-Analyse.

=== KRITISCHE REGELN ===
1. VOLLSTÄNDIGKEIT: Analysiere ALLE bereitgestellten Dokumente gründlich
2. QUELLENANGABE: Bei jeder Information → Dokument + Seite angeben
3. FEHLENDE INFOS: Klar mit ❌ markieren was NICHT gefunden wurde
4. STRUKTUR: Folge der vom Benutzer gewünschten Struktur/Format

=== ZEITLICHE PRÜFUNG (WICHTIG!) ===
Aktuelles Datum: ${new Date().toLocaleDateString('de-DE')}

Prüfe bei jedem Dokument:
- Dokumentdatum/Stand → zeige das Datum an
- "Gültig bis" vergangen? → ⚠️ ABGELAUFEN markieren
- "Ab [Datum]" in Zukunft? → 📅 AB [DATUM] markieren
- Beschluss hebt älteren auf? → den aktuellen verwenden

=== BEISPIELE ===
✅ "Hausgeld: 280€/Monat (Beschluss vom 15.03.2024, S. 12)"
⚠️ "Gebäudeversicherung bei XY: ABGELAUFEN am 31.12.2023 (Stammakte S. 45)"
📅 "Hausgelderhöhung auf 295€ AB 01.01.2025 (Beschluss S. 3)"
❌ "Wartungsvertrag Aufzug: Nicht in Dokumenten gefunden"

Der Benutzer gibt vor, welche Struktur/Kategorien er benötigt.`;

// Generate sub-queries for deep research
async function generateSubQueries(question: string): Promise<string[]> {
  console.log('Generating sub-queries for deep research...');
  
  try {
    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MISTRAL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'mistral-small-latest',
        messages: [
          { 
            role: 'system', 
            content: `Du generierst Such-Queries für Immobiliendokumente.
          
Teile die Benutzeranfrage in 6-8 fokussierte Such-Queries auf (je 2-4 Keywords).

Kategorien: Eigentümer/Anteile, Versicherungen, Beschlüsse, Hausgeld/Finanzen, Verträge, Technik/Heizung

Antworte NUR mit JSON-Array: ["Query 1", "Query 2", ...]`
          },
          { role: 'user', content: question }
        ],
        temperature: 0.3,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      console.error('Sub-query generation failed, using fallback');
      throw new Error('API call failed');
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content || '[]';
    
    try {
      const queries = JSON.parse(content);
      console.log(`Generated ${queries.length} sub-queries`);
      return [question, ...queries.slice(0, 7)];
    } catch {
      throw new Error('Failed to parse sub-queries');
    }
  } catch {
    // Fallback queries
    console.log('Using fallback sub-queries');
    return [
      question,
      "Eigentümer Anteile MEA Wohneinheiten",
      "Versicherungen Policen Ablaufdatum",
      "Beschlüsse Protokolle Versammlung",
      "Hausgeld Zahlungen Wirtschaftsplan",
      "Verträge Dienstleister",
      "Heizung technische Anlagen"
    ];
  }
}

// Perform deep research with multi-query strategy
async function performDeepResearch(
  supabase: any,
  question: string,
  buildingId: string | null,
  includeGeneral: boolean,
  searchAllBuildings: boolean
): Promise<{ chunks: any[]; subQueries: string[] }> {
  console.log(`Deep research: building=${buildingId}, searchAll=${searchAllBuildings}`);
  
  const subQueries = await generateSubQueries(question);
  console.log(`Processing ${subQueries.length} sub-queries`);
  
  const allChunks: any[] = [];
  const seenChunkIds = new Set<string>();
  
  for (const subQuery of subQueries) {
    try {
      const embedding = await generateQuestionEmbedding(subQuery);
      const effectiveBuildingId = searchAllBuildings ? null : buildingId;
      const chunks = await searchSimilarChunks(supabase, embedding, effectiveBuildingId, includeGeneral, 15, searchAllBuildings);
      
      for (const chunk of chunks) {
        if (!seenChunkIds.has(chunk.id)) {
          seenChunkIds.add(chunk.id);
          allChunks.push(chunk);
        }
      }
    } catch (err) {
      console.error(`Error processing sub-query "${subQuery}":`, err);
    }
  }
  
  console.log(`Deep research collected ${allChunks.length} unique chunks`);
  return { chunks: allChunks, subQueries };
}

// Build context with temporal information for deep research
function buildDeepResearchContext(chunks: any[], documentMap: Map<string, DocumentInfo>): string {
  // Sort by similarity (best first)
  const sortedChunks = chunks.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
  
  return sortedChunks.map((chunk, index) => {
    const docInfo = documentMap.get(chunk.document_id);
    const metadata = chunk.metadata || {};
    const dates = metadata.dates || {};
    
    let timeInfo = '';
    if (dates.documentDate) timeInfo += `Stand: ${dates.documentDate}`;
    if (dates.validUntil) timeInfo += ` | Gültig bis: ${dates.validUntil}`;
    if (dates.validFrom) timeInfo += ` | Gültig ab: ${dates.validFrom}`;
    if (dates.decisionDate) timeInfo += ` | Beschluss vom: ${dates.decisionDate}`;
    if (dates.effectiveDate) timeInfo += ` | Wirksam ab: ${dates.effectiveDate}`;
    
    return `[Quelle ${index + 1} - ${docInfo?.file_name || 'Unbekannt'}, S. ${metadata.pages || '?'}]
${timeInfo ? `Zeitraum: ${timeInfo}` : ''}
Kategorie: ${metadata.category || 'allgemein'}

${chunk.content}`;
  }).join('\n\n---\n\n');
}

// Generate response with Mistral
async function generateResponse(
  question: string,
  context: string,
  conversationHistory: Array<{role: string, content: string}>,
  settings: {systemPrompt: string, model: string, temperature: number, maxTokens: number},
  useDeepResearch: boolean = false
): Promise<{answer: string, sources: any[]}> {
  const basePrompt = useDeepResearch ? DEEP_RESEARCH_SYSTEM_PROMPT : settings.systemPrompt;
  const systemPrompt = `${basePrompt}

KONTEXT AUS DOKUMENTEN:
${context}`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory.slice(-10),
    { role: 'user', content: question }
  ];

  const response = await fetchWithRetry('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MISTRAL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: settings.model,
      messages,
      temperature: settings.temperature,
      max_tokens: useDeepResearch ? 4000 : settings.maxTokens,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Response generation failed: ${errorText}`);
  }

  const data = await response.json();
  const answer = data.choices[0]?.message?.content || 'Ich konnte keine Antwort generieren.';

  return {
    answer,
    sources: []
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // SECURITY: Verify JWT and derive userId from token claims (never trust client)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const jwt = authHeader.replace('Bearer ', '');
    const anonClient = createClient(SUPABASE_URL!, Deno.env.get('SUPABASE_ANON_KEY') ?? '');
    const { data: authData, error: authError } = await anonClient.auth.getUser(jwt);
    if (authError || !authData?.user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const verifiedUserId = authData.user.id;

    const { sessionId, question, buildingId, buildingIds, includeGeneral, useWebSearch, searchAllBuildings, useDeepResearch } = await req.json() as QueryDocumentsRequest;
    const userId = verifiedUserId;
    
    // Handle multiple building IDs - if buildingIds is provided, use it; otherwise use buildingId
    const effectiveBuildingIds: string[] = buildingIds && buildingIds.length > 0 
      ? buildingIds 
      : (buildingId ? [buildingId] : []);
    
    console.log(`Query: "${question}", Session: ${sessionId}, BuildingIds: ${JSON.stringify(effectiveBuildingIds)}, IncludeGeneral: ${includeGeneral}, WebSearch: ${useWebSearch}, DeepResearch: ${useDeepResearch}, SearchAll: ${searchAllBuildings}`);

    if (!MISTRAL_API_KEY) {
      throw new Error('MISTRAL_API_KEY is not configured');
    }

    if (!question || question.trim().length === 0) {
      throw new Error('Question is required');
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Get or create session
    let currentSessionId = sessionId;
    let isNewSession = false;
    if (!currentSessionId) {
      // Check if user already has 20 sessions - if so, delete the oldest one
      const { data: existingSessions } = await supabase
        .from('document_chat_sessions')
        .select('id, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });
      
      if (existingSessions && existingSessions.length >= 20) {
        const oldestSessionId = existingSessions[0].id;
        console.log(`User has ${existingSessions.length} sessions, deleting oldest: ${oldestSessionId}`);
        
        // Delete messages first
        await supabase
          .from('document_chat_messages')
          .delete()
          .eq('session_id', oldestSessionId);
        
        // Then delete session
        await supabase
          .from('document_chat_sessions')
          .delete()
          .eq('id', oldestSessionId);
      }
      
      // Generate AI-powered short title (max 3 words) using Mistral Small
      let title = question.length > 50 ? question.substring(0, 47) + '...' : question;
      
      try {
        console.log('Generating AI title for new session...');
        const titleResponse = await fetch('https://api.mistral.ai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${MISTRAL_API_KEY}`
          },
          body: JSON.stringify({
            model: 'mistral-small-latest',
            messages: [
              {
                role: 'system',
                content: `Du generierst ultra-kurze Chat-Titel (maximal 3 Wörter) für Immobilienverwaltungs-Anfragen.

REGELN:
- Maximal 3 Wörter
- Deutsch
- Beschreibe das Thema/die Absicht, nicht die Frage
- Keine Satzzeichen
- Keine Artikel (der, die, das)
- Substantive großschreiben

BEISPIELE:
"Was kostet die Heizungsreparatur?" → "Heizung Kosten"
"Wann findet die nächste Eigentümerversammlung statt?" → "Nächste Versammlung"
"Wie hoch ist die Rücklage?" → "Rücklage Stand"
"Was steht in der Teilungserklärung zu Balkonen?" → "Balkon Regelung"
"Wer ist für den Aufzug zuständig?" → "Aufzug Zuständigkeit"`
              },
              {
                role: 'user',
                content: question
              }
            ],
            max_tokens: 20,
            temperature: 0.3
          })
        });

        if (titleResponse.ok) {
          const titleData = await titleResponse.json();
          const generatedTitle = titleData.choices?.[0]?.message?.content?.trim();
          if (generatedTitle && generatedTitle.length > 0 && generatedTitle.length <= 50) {
            title = generatedTitle;
            console.log('Generated AI title:', title);
          }
        }
      } catch (titleError) {
        console.log('Failed to generate AI title, using fallback:', titleError);
        // Keep the truncated question as fallback
      }
      
      // Create session with retry logic for transient network errors
      let newSession = null;
      let sessionError = null;
      const maxRetries = 3;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const { data, error } = await supabase
          .from('document_chat_sessions')
          .insert({
            user_id: userId,
            building_id: buildingId,
            building_ids: effectiveBuildingIds.length > 0 ? effectiveBuildingIds : null,
            include_general: includeGeneral,
            search_scope: buildingId ? (includeGeneral ? 'all' : 'building') : 'all',
            title: title
          })
          .select()
          .single();
        
        if (!error) {
          newSession = data;
          sessionError = null;
          break;
        }
        
        sessionError = error;
        console.log(`Session creation attempt ${attempt} failed:`, error.message);
        
        if (attempt < maxRetries) {
          // Wait before retry (exponential backoff: 100ms, 200ms, 400ms)
          await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt - 1)));
        }
      }

      if (sessionError || !newSession) {
        throw new Error(`Failed to create session after ${maxRetries} attempts: ${sessionError?.message}`);
      }
      currentSessionId = newSession.id;
      isNewSession = true;
    }

    // Get conversation history
    const { data: historyData } = await supabase
      .from('document_chat_messages')
      .select('role, content')
      .eq('session_id', currentSessionId)
      .order('created_at', { ascending: true })
      .limit(20);

    const conversationHistory = historyData || [];

    // Save user message
    await supabase
      .from('document_chat_messages')
      .insert({
        session_id: currentSessionId,
        role: 'user',
        content: question
      });

    // Get chat settings (now with mode-specific prompts)
    const chatSettings = await getChatSettings(supabase, useWebSearch || false);

    // If web search is enabled, FIRST get document context, THEN use web agent
    if (useWebSearch) {
      console.log('Web search mode: fetching document context first...');
      
      // Generate embedding for the question
      const questionEmbedding = await generateQuestionEmbedding(question);

      // Search for relevant chunks - support multiple building IDs
      let relevantChunks;
      if (effectiveBuildingIds.length > 1) {
        relevantChunks = await searchSimilarChunksMultipleBuildings(
          supabase,
          questionEmbedding,
          effectiveBuildingIds,
          includeGeneral,
          10
        );
      } else {
        relevantChunks = await searchSimilarChunks(
          supabase,
          questionEmbedding,
          effectiveBuildingIds[0] || null,
          includeGeneral,
          10,
          searchAllBuildings || false
        );
      }

      // Build document context from chunks
      let documentContext = '';
      let documentSources: any[] = [];
      
      if (relevantChunks.length > 0) {
        console.log(`Found ${relevantChunks.length} relevant document chunks for web agent context`);
        
        const uniqueDocumentIds = [...new Set(relevantChunks.map(chunk => chunk.document_id).filter(Boolean))] as string[];
        const documentMap = await getDocumentInfoWithUrls(supabase, uniqueDocumentIds);
        
        documentContext = relevantChunks.map((chunk, index) => {
          const metadata = chunk.metadata || {};
          const docInfo = documentMap.get(chunk.document_id);
          const sourceInfo = [
            docInfo?.file_name && `Dokument: ${docInfo.file_name}`,
            metadata.page && `Seite: ${metadata.page}`,
          ].filter(Boolean).join(', ');
          
          return `[Interne Quelle ${index + 1}${sourceInfo ? ` - ${sourceInfo}` : ''}]\n${chunk.content}`;
        }).join('\n\n---\n\n');

        // Extract document sources
        documentSources = relevantChunks.slice(0, 3).map(chunk => {
          const docInfo = documentMap.get(chunk.document_id);
          // Parse page number from metadata - handles formats like "10-11" or "13"
          const rawPage = chunk.metadata?.pages || chunk.metadata?.page;
          const pageNumber = rawPage ? parseInt(String(rawPage).split('-')[0], 10) : null;
          return {
            type: 'document',
            content: chunk.content.slice(0, 150) + '...',
            metadata: chunk.metadata,
            documentId: chunk.document_id,
            fileName: docInfo?.file_name || null,
            documentUrl: docInfo?.signedUrl || null,
            pageNumber: pageNumber && !isNaN(pageNumber) ? pageNumber : null
          };
        });
      } else {
        console.log('No document chunks found, web agent will use internet only');
      }
      
      // Filter conversation history to only include user/assistant roles BEFORE calling web agent
      const filteredHistory = conversationHistory.filter(
        (msg: any) => msg.role === 'user' || msg.role === 'assistant'
      );
      console.log(`Filtered history: ${conversationHistory.length} -> ${filteredHistory.length} messages`);
      
      // Call web agent WITH document context
      const { answer, sources: webSources } = await queryWithWebAgent(
        question, 
        filteredHistory, 
        chatSettings.systemPrompt,
        documentContext
      );
      
      // Combine document sources with web source
      const combinedSources = [...documentSources, ...webSources];
      
      // Save assistant message
      await supabase
        .from('document_chat_messages')
        .insert({
          session_id: currentSessionId,
          role: 'assistant',
          content: answer,
          sources: combinedSources
        });

      // Update session
      await supabase
        .from('document_chat_sessions')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', currentSessionId);

      return new Response(
        JSON.stringify({
          answer,
          sources: combinedSources,
          sessionId: currentSessionId
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine effective building ID based on searchAllBuildings
    const effectiveBuildingId = searchAllBuildings ? null : (effectiveBuildingIds.length === 1 ? effectiveBuildingIds[0] : null);

    // DEEP RESEARCH MODE
    if (useDeepResearch) {
      console.log('Deep research mode activated');
      
      // For deep research with multiple buildings, use the first building ID or null
      const deepResearchBuildingId = effectiveBuildingIds.length > 0 ? effectiveBuildingIds[0] : null;
      const searchAll = searchAllBuildings || effectiveBuildingIds.length > 1;
      
      const { chunks: relevantChunks } = await performDeepResearch(
        supabase,
        question,
        deepResearchBuildingId,
        includeGeneral,
        searchAll
      );

      if (relevantChunks.length === 0) {
        const noDocsAnswer = 'Es wurden keine relevanten Dokumente für die Tiefenrecherche gefunden. Bitte laden Sie zunächst Dokumente hoch.';
        
        await supabase
          .from('document_chat_messages')
          .insert({
            session_id: currentSessionId,
            role: 'assistant',
            content: noDocsAnswer,
            sources: []
          });

        return new Response(
          JSON.stringify({
            answer: noDocsAnswer,
            sources: [],
            sessionId: currentSessionId
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get document info for sources
      const uniqueDocumentIds = [...new Set(relevantChunks.map(chunk => chunk.document_id).filter(Boolean))];
      console.log(`Deep research: ${relevantChunks.length} chunks from ${uniqueDocumentIds.length} documents`);
      
      const documentMap = await getDocumentInfoWithUrls(supabase, uniqueDocumentIds);

      // Build context with temporal information
      const context = buildDeepResearchContext(relevantChunks, documentMap);
      const maxContextLength = 50000; // Extended context for deep research
      const truncatedContext = context.slice(0, maxContextLength);

      // Generate response with deep research prompt
      const { answer } = await generateResponse(
        question,
        truncatedContext,
        conversationHistory,
        chatSettings,
        true // useDeepResearch
      );

      // Extract sources (more sources for deep research)
      const extractedSources = relevantChunks.slice(0, 10).map(chunk => {
        const docInfo = documentMap.get(chunk.document_id);
        const rawPage = chunk.metadata?.pages || chunk.metadata?.page;
        const pageNumber = rawPage ? parseInt(String(rawPage).split('-')[0], 10) : null;
        
        return {
          content: chunk.content.slice(0, 200) + '...',
          metadata: chunk.metadata,
          buildingId: chunk.building_id,
          documentId: chunk.document_id,
          fileName: docInfo?.file_name || null,
          documentUrl: docInfo?.signedUrl || null,
          pageNumber: pageNumber && !isNaN(pageNumber) ? pageNumber : null
        };
      });

      // Save assistant message
      await supabase
        .from('document_chat_messages')
        .insert({
          session_id: currentSessionId,
          role: 'assistant',
          content: answer,
          sources: extractedSources
        });

      // Update session
      await supabase
        .from('document_chat_sessions')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', currentSessionId);

      return new Response(
        JSON.stringify({
          answer,
          sources: extractedSources,
          sessionId: currentSessionId,
          deepResearch: true,
          chunksAnalyzed: relevantChunks.length
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // NORMAL MODE - Generate embedding for the question
    const questionEmbedding = await generateQuestionEmbedding(question);

    // CATEGORY DETECTION (DMS folder-aware)
    let detectedSlugs: string[] = [];
    try {
      const taxonomy = await loadCategoryTaxonomy(supabase, effectiveBuildingId);
      console.log(`Taxonomy loaded: ${taxonomy.length} categories for building ${effectiveBuildingId}`);
      if (taxonomy.length > 0) {
        detectedSlugs = await detectCategorySlugs(question, taxonomy);
      }
    } catch (err) {
      console.error('Category detection failed, falling back:', err);
    }

    // Search relevant chunks
    let relevantChunks: any[];
    if (effectiveBuildingIds.length > 1) {
      relevantChunks = await searchSimilarChunksMultipleBuildings(
        supabase,
        questionEmbedding,
        effectiveBuildingIds,
        includeGeneral,
        10
      );
    } else if (detectedSlugs.length > 0) {
      relevantChunks = await hybridCategoryRetrieval(
        supabase,
        questionEmbedding,
        effectiveBuildingId,
        detectedSlugs,
        10
      );
    } else {
      const autoFilters = extractMetadataFromQuestion(question);
      console.log(`Auto-detected filters: categories=${JSON.stringify(autoFilters.categories)}, features=${JSON.stringify(autoFilters.features)}`);
      relevantChunks = await searchSimilarChunks(
        supabase,
        questionEmbedding,
        effectiveBuildingId,
        includeGeneral,
        10,
        searchAllBuildings || false,
        autoFilters.categories.length > 0 ? autoFilters.categories : null,
        autoFilters.features.length > 0 ? autoFilters.features : null
      );
    }

    if (relevantChunks.length === 0) {
      const noDocsAnswer = 'Es wurden keine relevanten Dokumente gefunden. Bitte laden Sie zunächst Dokumente hoch oder aktivieren Sie die Internet-Suche (🌐).';
      
      await supabase
        .from('document_chat_messages')
        .insert({
          session_id: currentSessionId,
          role: 'assistant',
          content: noDocsAnswer,
          sources: []
        });

      return new Response(
        JSON.stringify({
          answer: noDocsAnswer,
          sources: [],
          sessionId: currentSessionId
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch source info for both legacy (building_documents) and new (building_files) chunks
    const legacyDocIds = [...new Set(relevantChunks.map(c => c.document_id).filter(Boolean))];
    const fileIds = [...new Set(relevantChunks.map(c => c.file_id).filter(Boolean))];
    console.log(`Sources: ${legacyDocIds.length} legacy docs + ${fileIds.length} DMS files`);

    const documentMap = await getDocumentInfoWithUrls(supabase, legacyDocIds);

    const fileMap = new Map<string, { display_name: string; file_path: string }>();
    if (fileIds.length > 0) {
      const { data: filesData } = await supabase
        .from('building_files')
        .select('id, display_name, file_path')
        .in('id', fileIds);
      (filesData || []).forEach((f: any) => fileMap.set(f.id, f));
    }

    // Build context with folder path
    const context = relevantChunks.map((chunk, index) => {
      const metadata = chunk.metadata || {};
      const fileInfo = chunk.file_id ? fileMap.get(chunk.file_id) : null;
      const docInfo = chunk.document_id ? documentMap.get(chunk.document_id) : null;
      const fileName = fileInfo?.display_name || docInfo?.file_name || 'Unbekannt';
      const folderPath = Array.isArray(chunk.category_path) && chunk.category_path.length > 0
        ? chunk.category_path.join(' › ')
        : null;
      const sourceInfo = [
        `Dokument: ${fileName}`,
        folderPath && `Ordner: ${folderPath}`,
        metadata.section && `Abschnitt: ${metadata.section}`,
        metadata.page && `Seite: ${metadata.page}`,
      ].filter(Boolean).join(', ');
      return `[Quelle ${index + 1} - ${sourceInfo}]\n${chunk.content}`;
    }).join('\n\n---\n\n');

    // Generate response
    const { answer } = await generateResponse(
      question,
      context,
      conversationHistory,
      chatSettings,
      false
    );

    // Extract sources for UI
    const extractedSources = await Promise.all(relevantChunks.slice(0, 5).map(async chunk => {
      const fileInfo = chunk.file_id ? fileMap.get(chunk.file_id) : null;
      const docInfo = chunk.document_id ? documentMap.get(chunk.document_id) : null;
      const rawPage = chunk.metadata?.pages || chunk.metadata?.page;
      const pageNumber = rawPage ? parseInt(String(rawPage).split('-')[0], 10) : null;

      let signedUrl: string | null = docInfo?.signedUrl || null;
      if (!signedUrl && fileInfo?.file_path) {
        try {
          const { data } = await supabase.storage
            .from('building-files')
            .createSignedUrl(fileInfo.file_path, 3600);
          signedUrl = data?.signedUrl || null;
        } catch (err) {
          console.error(`Failed to sign URL for file ${chunk.file_id}:`, err);
        }
      }

      return {
        content: chunk.content.slice(0, 200) + '...',
        metadata: chunk.metadata,
        buildingId: chunk.building_id,
        documentId: chunk.document_id || null,
        fileId: chunk.file_id || null,
        fileName: fileInfo?.display_name || docInfo?.file_name || null,
        folderPath: Array.isArray(chunk.category_path) ? chunk.category_path : [],
        categorySlug: chunk.category_slug || null,
        documentUrl: signedUrl,
        pageNumber: pageNumber && !isNaN(pageNumber) ? pageNumber : null
      };
    }));

    // Save assistant message
    await supabase
      .from('document_chat_messages')
      .insert({
        session_id: currentSessionId,
        role: 'assistant',
        content: answer,
        sources: extractedSources
      });

    // Update session
    await supabase
      .from('document_chat_sessions')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', currentSessionId);

    return new Response(
      JSON.stringify({
        answer,
        sources: extractedSources,
        sessionId: currentSessionId
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error querying documents:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
