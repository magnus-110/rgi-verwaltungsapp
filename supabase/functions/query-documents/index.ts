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

const MISTRAL_WEB_AGENT_ID = 'ag_019ba89a0a6d722fb79f7afa8c035798';

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

// Get chat settings from database
async function getChatSettings(supabase: any): Promise<{systemPrompt: string, model: string, temperature: number, maxTokens: number}> {
  const defaults = {
    systemPrompt: `Du bist ein hilfreicher Assistent für die Immobilienverwaltung. Du beantwortest Fragen basierend auf den bereitgestellten Dokumenten.

WICHTIGE REGELN:
1. Antworte NUR basierend auf den bereitgestellten Dokumenten
2. Wenn die Information nicht in den Dokumenten vorhanden ist, sage das klar
3. Gib immer die Quelle an (Dokument, Seite, Abschnitt)
4. Beziehe dich auf vorherige Fragen in der Konversation wenn relevant
5. Antworte auf Deutsch
6. Sei präzise und hilfreich`,
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
      return defaults;
    }

    return {
      systemPrompt: data.system_prompt || defaults.systemPrompt,
      model: data.model || defaults.model,
      temperature: parseFloat(data.temperature) ?? defaults.temperature,
      maxTokens: data.max_tokens ?? defaults.maxTokens,
    };
  } catch {
    return defaults;
  }
}

// Query with Mistral Web Agent (Internet Search)
async function queryWithWebAgent(
  question: string,
  conversationHistory: Array<{role: string, content: string}>
): Promise<{answer: string, sources: any[]}> {
  console.log('Using Mistral Web Agent for internet search');
  
  // Format conversation history for the agent
  const inputs = [
    ...conversationHistory.slice(-10).map(msg => ({
      role: msg.role,
      content: msg.content
    })),
    { role: 'user', content: question }
  ];

  const response = await fetch('https://api.mistral.ai/v1/agents/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MISTRAL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      agent_id: MISTRAL_WEB_AGENT_ID,
      messages: inputs
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Web agent error:', errorText);
    throw new Error(`Web agent query failed: ${errorText}`);
  }

  const data = await response.json();
  console.log('Web agent response received');
  
  // Extract the answer from the agent response
  const answer = data.choices?.[0]?.message?.content || 
                 'Keine Antwort vom Internet-Agenten erhalten.';

  return {
    answer,
    sources: [{ 
      type: 'web',
      content: 'Ergebnis aus Internet-Suche',
      metadata: { source: 'Internet-Suche' },
      fileName: 'Internet-Suche',
      documentUrl: null,
      pageNumber: null
    }]
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

    // If web search is enabled, use the web agent instead of document search
    if (useWebSearch) {
      const { answer, sources } = await queryWithWebAgent(question, conversationHistory);
      
      // Save assistant message
      await supabase
        .from('document_chat_messages')
        .insert({
          session_id: currentSessionId,
          role: 'assistant',
          content: answer,
          sources: sources
        });

      // Update session
      await supabase
        .from('document_chat_sessions')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', currentSessionId);

      return new Response(
        JSON.stringify({
          answer,
          sources,
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
      const noDocsAnswer = 'Es wurden keine relevanten Dokumente gefunden. Bitte laden Sie zunächst Dokumente hoch.';
      
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

    // Get chat settings
    const chatSettings = await getChatSettings(supabase);

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
