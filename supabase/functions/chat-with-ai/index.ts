import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.52.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, userId, managementMode, buildingId, healthCheck, sessionId } = await req.json();

    // Health check endpoint
    if (healthCheck === true || message === '__healthcheck__') {
      const mistralApiKey = Deno.env.get('MISTRAL_API_KEY');
      if (mistralApiKey) {
        return new Response(
          JSON.stringify({ online: true, status: 'healthy' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else {
        return new Response(
          JSON.stringify({ online: false, status: 'unhealthy', error: 'Mistral API key not configured' }),
          { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    if (!message || !userId || !managementMode) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client with service role for admin access
    const supabaseUrl = 'https://eebphowrbarzawwixqcc.supabase.co';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: 'Service configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get Mistral API key from secrets
    const mistralApiKey = Deno.env.get('MISTRAL_API_KEY');
    if (!mistralApiKey) {
      return new Response(
        JSON.stringify({ error: 'Mistral API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch chatbot settings
    const { data: settings } = await supabase
      .from('chatbot_settings')
      .select('*')
      .eq('management_mode', managementMode)
      .single();

    if (!settings) {
      return new Response(
        JSON.stringify({ error: 'Chatbot settings not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get or create session
    let currentSessionId = sessionId;
    if (!currentSessionId) {
      const { data: newSession, error: sessionError } = await supabase
        .from('chatbot_sessions')
        .insert({
          user_id: userId,
          management_mode: managementMode,
          building_id: buildingId
        })
        .select()
        .single();

      if (sessionError) {
        console.error('Error creating session:', sessionError);
        return new Response(JSON.stringify({ error: 'Failed to create session' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      currentSessionId = newSession.id;
    }

    // Get user profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (!profile) {
      return new Response(JSON.stringify({ error: 'User profile not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Load conversation history (last 20 messages from last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const { data: conversationHistory, error: historyError } = await supabase
      .from('chatbot_messages')
      .select('role, content, created_at')
      .eq('user_id', userId)
      .eq('management_mode', managementMode)
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: true })
      .limit(20);

    if (historyError) {
      console.error('Error fetching conversation history:', historyError);
      // Continue without history - don't fail the request
    }

    // Build context data
    let contextData = "";

    // For tenants - get building info from profile
    if (managementMode === 'rent' && profile?.building_id) {
      const { data: building } = await supabase
        .from('buildings')
        .select('*')
        .eq('id', profile.building_id)
        .maybeSingle();
      
      if (building) {
        contextData += `\n\nGebäudeinformationen:\nName: ${building.name}\nAdresse: ${building.address}\nTyp: ${building.type}\nVerwaltungsmodus: ${building.management_mode}`;
      }

      // Get tenant reports
      const { data: userReports } = await supabase
        .from('miete_reports')
        .select('*')
        .eq('reported_by', userId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (userReports && userReports.length > 0) {
        contextData += `\n\nIhre letzten Meldungen:\n`;
        userReports.forEach(report => {
          contextData += `- ${report.title} (Status: ${report.status}, Priorität: ${report.priority}, Erstellt: ${new Date(report.created_at).toLocaleDateString('de-DE')})\n`;
          if (report.admin_notes) {
            contextData += `  Verwalter-Notiz: ${report.admin_notes}\n`;
          }
        });
      }
    }

    // For WEG owners
    if (managementMode === 'weg') {
      // Get buildings information
      const { data: buildings } = await supabase
        .from('buildings')
        .select('*')
        .eq('management_mode', 'weg')
        .order('created_at', { ascending: false });

      if (buildings && buildings.length > 0) {
        contextData += `\n\nVerfügbare Gebäude:\n`;
        buildings.forEach(building => {
          contextData += `- ${building.name} (${building.address})\n`;
        });
      }

      // Get WEG owner reports
      const { data: userReports } = await supabase
        .from('weg_reports')
        .select('*')
        .eq('reported_by', userId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (userReports && userReports.length > 0) {
        contextData += `\n\nIhre letzten Meldungen:\n`;
        userReports.forEach(report => {
          contextData += `- ${report.title} (Status: ${report.status}, Priorität: ${report.priority}, Erstellt: ${new Date(report.created_at).toLocaleDateString('de-DE')})\n`;
          if (report.admin_notes) {
            contextData += `  Verwalter-Notiz: ${report.admin_notes}\n`;
          }
        });
      }

      // Add building ID context if provided
      if (buildingId) {
        // First check if this user has access to this building ID
        const { data: buildingAccess } = await supabase
          .from('weg_owner_buildings')
          .select('building_id')
          .eq('user_id', userId)
          .eq('building_id', buildingId)
          .maybeSingle();

        if (buildingAccess) {
          const { data: specificBuilding } = await supabase
            .from('buildings')
            .select('*')
            .or(`name.ilike.%${buildingId}%,id.eq.${buildingId}`)
            .maybeSingle();

          if (specificBuilding) {
            contextData += `\n\nSpezifisches Gebäude (${buildingId}):\n`;
            contextData += `- Name: ${specificBuilding.name}\n- Adresse: ${specificBuilding.address}\n- Typ: ${specificBuilding.type}\n`;
          }
        } else {
          contextData += `\n\nHinweis: Sie haben keinen Zugriff auf Gebäude-ID "${buildingId}". Bitte überprüfen Sie Ihre Gebäude-Zuordnungen in den Einstellungen.\n`;
        }
      }

      // Add user's assigned buildings context
      const { data: userBuildings } = await supabase
        .from('weg_owner_buildings')
        .select('building_id')
        .eq('user_id', userId);

      if (userBuildings && userBuildings.length > 0) {
        contextData += `\n\nIhre zugewiesenen Gebäude-IDs:\n`;
        userBuildings.forEach(building => {
          contextData += `- ${building.building_id}\n`;
        });
      }
    }

    // Get forum posts for additional context
    const { data: forumPosts } = await supabase
      .from('forum_posts')
      .select('*')
      .eq('management_mode', managementMode)
      .order('created_at', { ascending: false })
      .limit(5);

    if (forumPosts && forumPosts.length > 0) {
      contextData += `\n\nAktuelle Forum-Beiträge:\n`;
      forumPosts.forEach(post => {
        contextData += `- ${post.title}: ${post.content.substring(0, 100)}...\n`;
      });
    }

    // Build knowledge base string from knowledge_items or fallback to knowledge_base
    let knowledgeString = "";
    if (settings.knowledge_items && Array.isArray(settings.knowledge_items) && settings.knowledge_items.length > 0) {
      knowledgeString = settings.knowledge_items
        .map(item => `${item.title}: ${item.content}`)
        .join('\n\n');
    } else if (settings.knowledge_base) {
      knowledgeString = settings.knowledge_base;
    }

    // Construct system prompt
     // Check if this is the first message in the conversation (no history = first message)
     const isFirstMessage = !conversationHistory || conversationHistory.length === 0;
     
     // Build conversation behavior instructions
     const conversationBehavior = `
 
 🗣️ WICHTIG - Gesprächsverhalten:
 - Begrüßen Sie den Nutzer NUR bei der ERSTEN Nachricht mit Namen (z.B. "Guten Tag, ${profile?.first_name} ${profile?.last_name}!").
 - Bei ALLEN WEITEREN Nachrichten in derselben Konversation: KEINE erneute Begrüßung mit Namen.
 - Variieren Sie Ihre Abschlussformulierungen. Vermeiden Sie repetitive Phrasen wie "Kann ich Ihnen sonst noch weiterhelfen?". Nutzen Sie stattdessen natürliche Varianten oder lassen Sie die Schlussformel ganz weg, wenn die Antwort vollständig ist.
 - Der Gesprächsverlauf wird Ihnen bereitgestellt - nutzen Sie diesen Kontext für kohärente Antworten.
 ${isFirstMessage ? '- Dies ist die ERSTE Nachricht - begrüßen Sie den Nutzer mit Namen.' : '- Dies ist eine FOLGENACHRICHT - KEINE Begrüßung mit Namen mehr.'}`;
 
     const systemPrompt = `${settings.system_prompt}${conversationBehavior}\n\nWissensdatenbank:\n${knowledgeString}\n\nAktuelle Kontextdaten:${contextData}\n\nNutzerinformationen (nur für Kontext, NICHT bei jeder Nachricht ansprechen): ${profile?.first_name} ${profile?.last_name} (${profile?.email})${managementMode === 'weg' ? ' - WEG-Eigentümer' : ' - Mieter'}${buildingId ? `. Gebäude-ID: ${buildingId}` : managementMode === 'weg' ? '. Keine spezifische Gebäude-ID angegeben - bitten Sie um die Gebäude-ID für spezifische Informationen.' : ''}`;

    // Construct messages for OpenAI with conversation history
    const messages = [
      {
        role: 'system',
        content: systemPrompt
      }
    ];

    // Add conversation history if available
    if (conversationHistory && conversationHistory.length > 0) {
      console.log(`Adding ${conversationHistory.length} messages from conversation history`);
      conversationHistory.forEach(msg => {
        messages.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content
        });
      });
    }

    // Add current user message
    messages.push({
      role: 'user',
      content: message
    });

    console.log('Sending request to Mistral with model: mistral-small-latest and', messages.length, 'messages');

    // Save user message
    const { error: userMsgError } = await supabase
      .from('chatbot_messages')
      .insert({
        session_id: currentSessionId,
        user_id: userId,
        building_id: buildingId,
        management_mode: managementMode,
        role: 'user',
        content: message,
        metadata: { timestamp: new Date().toISOString() }
      });

    if (userMsgError) {
      console.error('Error saving user message:', userMsgError);
      // Continue - don't fail the request for logging issues
    }

    // Call Mistral API
    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${mistralApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'mistral-small-latest',
        messages: messages,
        max_tokens: settings.max_tokens || 1000,
        temperature: settings.temperature || 0.7
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', errorText);
      return new Response(JSON.stringify({ 
        error: 'AI service temporarily unavailable',
        details: response.status === 429 ? 'Rate limit exceeded' : 'Service error'
      }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    const assistantMessage = data.choices[0]?.message?.content || 'Entschuldigung, ich konnte keine Antwort generieren.';

    // Save assistant message
    const { error: assistantMsgError } = await supabase
      .from('chatbot_messages')
      .insert({
        session_id: currentSessionId,
        user_id: userId,
        building_id: buildingId,
        management_mode: managementMode,
        role: 'assistant',
        content: assistantMessage,
        metadata: { 
          model: settings.model,
          usage: data.usage,
          timestamp: new Date().toISOString()
        }
      });

    if (assistantMsgError) {
      console.error('Error saving assistant message:', assistantMsgError);
      // Continue - don't fail the request for logging issues
    }

    return new Response(JSON.stringify({ 
      response: assistantMessage,
      usage: data.usage,
      sessionId: currentSessionId
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in chat-with-ai function:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Entschuldigung, es gab einen Fehler bei der Verarbeitung Ihrer Anfrage. Bitte wenden Sie sich direkt an die Hausverwaltung unter info@rgi-immobilien.de oder Tel: 08362-123456.' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});