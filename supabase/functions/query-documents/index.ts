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
): Promise<Array<{content: string, metadata: any, building_id: string | null, similarity: number}>> {
  // Build the filter conditions
  let filterConditions = '';
  
  if (buildingId && includeGeneral) {
    filterConditions = `building_id = '${buildingId}' OR category = 'general'`;
  } else if (buildingId) {
    filterConditions = `building_id = '${buildingId}'`;
  } else if (includeGeneral) {
    filterConditions = `category = 'general'`;
  } else {
    // Search all documents
    filterConditions = '1=1';
  }

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
      .select('content, metadata, building_id')
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

// Generate response with Mistral Large
async function generateResponse(
  question: string,
  context: string,
  conversationHistory: Array<{role: string, content: string}>
): Promise<{answer: string, sources: any[]}> {
  const systemPrompt = `Du bist ein hilfreicher Assistent für die Immobilienverwaltung. Du beantwortest Fragen basierend auf den bereitgestellten Dokumenten.

WICHTIGE REGELN:
1. Antworte NUR basierend auf den bereitgestellten Dokumenten
2. Wenn die Information nicht in den Dokumenten vorhanden ist, sage das klar
3. Gib immer die Quelle an (Dokument, Seite, Abschnitt)
4. Beziehe dich auf vorherige Fragen in der Konversation wenn relevant
5. Antworte auf Deutsch
6. Sei präzise und hilfreich

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
      model: 'mistral-large-latest',
      messages,
      temperature: 0.3,
      max_tokens: 2000,
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
    const { sessionId, question, buildingId, includeGeneral, userId } = await req.json() as QueryDocumentsRequest;
    
    console.log(`Query: "${question}", Session: ${sessionId}, Building: ${buildingId}, IncludeGeneral: ${includeGeneral}`);

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

    // Build context from chunks
    const context = relevantChunks.map((chunk, index) => {
      const metadata = chunk.metadata || {};
      const sourceInfo = [
        metadata.section && `Abschnitt: ${metadata.section}`,
        metadata.page && `Seite: ${metadata.page}`,
        metadata.category && `Kategorie: ${metadata.category}`
      ].filter(Boolean).join(', ');
      
      return `[Quelle ${index + 1}${sourceInfo ? ` - ${sourceInfo}` : ''}]\n${chunk.content}`;
    }).join('\n\n---\n\n');

    // Generate response
    const { answer, sources } = await generateResponse(
      question,
      context,
      conversationHistory
    );

    // Extract sources from chunks
    const extractedSources = relevantChunks.slice(0, 5).map(chunk => ({
      content: chunk.content.slice(0, 200) + '...',
      metadata: chunk.metadata,
      buildingId: chunk.building_id
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
