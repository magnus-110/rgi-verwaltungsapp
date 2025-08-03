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
    const { message, userId, managementMode, buildingId } = await req.json();

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

    // Get OpenAI API key from secrets
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({ error: 'OpenAI API key not configured' }),
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

    // Get user profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

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

    // Call OpenAI API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: settings.model || 'gpt-4o-mini',
        messages: [
          { 
            role: 'system', 
            content: `${settings.system_prompt}\n\nWissensdatenbank:\n${settings.knowledge_base}\n\nAktuelle Kontextdaten:${contextData}\n\nSie sprechen mit: ${profile?.first_name} ${profile?.last_name} (${profile?.email})${managementMode === 'weg' ? ' - WEG-Eigentümer' : ' - Mieter'}${buildingId ? `. Gebäude-ID: ${buildingId}` : managementMode === 'weg' ? '. Keine spezifische Gebäude-ID angegeben - bitten Sie um die Gebäude-ID für spezifische Informationen.' : ''}`
          },
          { role: 'user', content: message }
        ],
        temperature: settings.temperature || 0.7,
        max_tokens: settings.max_tokens || 500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', errorText);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const botResponse = data.choices[0].message.content;

    return new Response(
      JSON.stringify({ response: botResponse }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

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