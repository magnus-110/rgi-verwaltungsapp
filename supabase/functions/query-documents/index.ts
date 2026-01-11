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
  includeGeneral: boolean;
  userId: string;
  searchAllBuildings?: boolean;
  useWebSearch?: boolean;
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

// Generate embedding for the question
async function generateQuestionEmbedding(question: string): Promise<number[]> {
  const response = await fetch('https://api.mistral.ai/v1/embeddings', {
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

// Search for similar chunks using vector similarity
async function searchSimilarChunks(
  supabase: any,
  embedding: number[],
  buildingId: string | null,
  includeGeneral: boolean,
  limit: number = 10
): Promise<Array<{id: string, document_id: string, content: string, metadata: any, building_id: string | null, similarity: number}>> {
  // Use RPC for vector similarity search
  const { data, error } = await supabase.rpc('search_document_chunks', {
    query_embedding: `[${embedding.join(',')}]`,
    filter_building_id: buildingId,
    include_general: includeGeneral,
    match_count: limit
  });

  if (error) {
    console.error('Vector search error:', error);
    
    // Fallback: use simple query without vector search
    const { data: fallbackData, error: fallbackError } = await supabase
      .from('document_chunks')
      .select('id, document_id, content, metadata, building_id')
      .limit(limit);
    
    if (fallbackError) {
      throw new Error(`Search failed: ${fallbackError.message}`);
    }
    
    return fallbackData.map((chunk: any) => ({
      ...chunk,
      similarity: 0.5
    }));
  }

  return data || [];
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
    model: 'mistral-large-latest',
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

DEINE AUFGABE:
1. FÜHRE IMMER eine Internet-Recherche durch für die gestellte Frage
2. Suche aktiv nach aktuellen, relevanten Informationen im Internet
3. Nutze den internen Dokumentkontext nur als ERGÄNZUNG, nicht als Ersatz für die Web-Suche
4. Antworte IMMER auf Deutsch

ANTWORTFORMAT:
- Gib eine klare, strukturierte Zusammenfassung der gefundenen Informationen
- Verweise auf die verwendeten Internet-Quellen
- Kombiniere Internet-Wissen mit internem Kontext, wenn sinnvoll

${documentContext ? `INTERNER DOKUMENTKONTEXT (zur Ergänzung):
${documentContext.slice(0, 8000)}` : ''}

ORIGINAL SYSTEM-ANWEISUNGEN:
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

  // Call Conversations API with Mistral Web Search Agent
  // NOTE: Must use agent_id (not model + tools) for web search - tool_choice is NOT supported
  const MISTRAL_WEB_AGENT_ID = 'ag_019ba89a0a6d722fb79f7afa8c035798';
  
  console.log(`Calling Mistral Web Agent: ${MISTRAL_WEB_AGENT_ID}`);
  
  const response = await fetch('https://api.mistral.ai/v1/conversations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MISTRAL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      agent_id: MISTRAL_WEB_AGENT_ID,  // Use agent instead of model+tools
      inputs: validatedInputs
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Conversations API error:', response.status, errorText);
    throw new Error(`Web search failed: ${errorText}`);
  }

  const data = await response.json();
  console.log('Conversations API response:', JSON.stringify(data).slice(0, 800));
  
  // Extract answer from outputs array
  const answer = data.outputs?.[0]?.content || 
                 'Keine Antwort vom Internet-Agenten erhalten.';
  
  // Extract web sources from citations if available
  const webSources = (data.outputs?.[0]?.citations || []).map((citation: any) => ({
    type: 'web',
    content: citation.title || 'Internet-Quelle',
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

// Generate response with Mistral
async function generateResponse(
  question: string,
  context: string,
  conversationHistory: Array<{role: string, content: string}>,
  settings: {systemPrompt: string, model: string, temperature: number, maxTokens: number}
): Promise<{answer: string, sources: any[]}> {
  const systemPrompt = `${settings.systemPrompt}

KONTEXT AUS DOKUMENTEN:
${context}`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory.slice(-10), // Last 10 messages for context
    { role: 'user', content: question }
  ];

  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MISTRAL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: settings.model,
      messages,
      temperature: settings.temperature,
      max_tokens: settings.maxTokens,
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
    sources: [] // Sources are extracted from context
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { sessionId, question, buildingId, includeGeneral, userId, useWebSearch } = await req.json() as QueryDocumentsRequest;
    
    console.log(`Query: "${question}", Session: ${sessionId}, Building: ${buildingId}, IncludeGeneral: ${includeGeneral}, WebSearch: ${useWebSearch}`);

    if (!MISTRAL_API_KEY) {
      throw new Error('MISTRAL_API_KEY is not configured');
    }

    if (!question || question.trim().length === 0) {
      throw new Error('Question is required');
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Get or create session
    let currentSessionId = sessionId;
    if (!currentSessionId) {
      const { data: newSession, error: sessionError } = await supabase
        .from('document_chat_sessions')
        .insert({
          user_id: userId,
          building_id: buildingId,
          include_general: includeGeneral,
          search_scope: buildingId ? (includeGeneral ? 'all' : 'building') : 'all'
        })
        .select()
        .single();

      if (sessionError) {
        throw new Error(`Failed to create session: ${sessionError.message}`);
      }
      currentSessionId = newSession.id;
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

      // Search for relevant chunks (same as document mode)
      const relevantChunks = await searchSimilarChunks(
        supabase,
        questionEmbedding,
        buildingId,
        includeGeneral,
        10
      );

      // Build document context from chunks
      let documentContext = '';
      let documentSources: any[] = [];
      
      if (relevantChunks.length > 0) {
        console.log(`Found ${relevantChunks.length} relevant document chunks for web agent context`);
        
        const uniqueDocumentIds = [...new Set(relevantChunks.map(chunk => chunk.document_id).filter(Boolean))];
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
          return {
            type: 'document',
            content: chunk.content.slice(0, 150) + '...',
            metadata: chunk.metadata,
            documentId: chunk.document_id,
            fileName: docInfo?.file_name || null,
            documentUrl: docInfo?.signedUrl || null,
            pageNumber: chunk.metadata?.page || null
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

    // Generate embedding for the question
    const questionEmbedding = await generateQuestionEmbedding(question);

    // Search for relevant chunks
    const relevantChunks = await searchSimilarChunks(
      supabase,
      questionEmbedding,
      buildingId,
      includeGeneral,
      10
    );

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

    // Get unique document IDs and fetch document info with signed URLs
    const uniqueDocumentIds = [...new Set(relevantChunks.map(chunk => chunk.document_id).filter(Boolean))];
    console.log(`Found ${uniqueDocumentIds.length} unique documents for sources`);
    
    const documentMap = await getDocumentInfoWithUrls(supabase, uniqueDocumentIds);

    // Build context from chunks
    const context = relevantChunks.map((chunk, index) => {
      const metadata = chunk.metadata || {};
      const docInfo = documentMap.get(chunk.document_id);
      const sourceInfo = [
        docInfo?.file_name && `Dokument: ${docInfo.file_name}`,
        metadata.section && `Abschnitt: ${metadata.section}`,
        metadata.page && `Seite: ${metadata.page}`,
        metadata.category && `Kategorie: ${metadata.category}`
      ].filter(Boolean).join(', ');
      
      return `[Quelle ${index + 1}${sourceInfo ? ` - ${sourceInfo}` : ''}]\n${chunk.content}`;
    }).join('\n\n---\n\n');

    // Generate response
    const { answer } = await generateResponse(
      question,
      context,
      conversationHistory,
      chatSettings
    );

    // Extract sources from chunks with document URLs
    const extractedSources = relevantChunks.slice(0, 5).map(chunk => {
      const docInfo = documentMap.get(chunk.document_id);
      return {
        content: chunk.content.slice(0, 200) + '...',
        metadata: chunk.metadata,
        buildingId: chunk.building_id,
        documentId: chunk.document_id,
        fileName: docInfo?.file_name || null,
        documentUrl: docInfo?.signedUrl || null,
        pageNumber: chunk.metadata?.page || null
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
