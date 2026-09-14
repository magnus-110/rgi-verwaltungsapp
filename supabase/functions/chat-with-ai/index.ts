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
    const body = await req.json();
    const { message, managementMode, buildingId, healthCheck, sessionId } = body;

    // Health check endpoint (public, no auth needed)
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

    // SECURITY: Verify JWT and derive userId from token claims (never trust client)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const token = authHeader.replace('Bearer ', '');
    const anonClient = createClient(
      'https://eebphowrbarzawwixqcc.supabase.co',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );
    // Zweiter Client, der die Rechte des Fragenden traegt. Alles, was der Nutzer
    // inhaltlich sehen darf (Beschluesse, Dokumente), wird ueber ihn geladen, damit
    // die RLS entscheidet - nicht der Service-Role-Key weiter unten.
    const userClient = createClient(
      'https://eebphowrbarzawwixqcc.supabase.co',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: authData, error: authError } = await anonClient.auth.getUser(token);
    if (authError || !authData?.user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const userId = authData.user.id;

    if (!message || !managementMode) {
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

    // Build context data
    let contextData = "";

    // Helper function to fetch building managers
    const fetchBuildingManagers = async (buildingId: string) => {
      const { data: managers } = await supabase
        .from('building_managers')
        .select('building_id, user_id')
        .eq('building_id', buildingId);
      
      if (managers && managers.length > 0) {
        const managerProfiles = await Promise.all(
          managers.map(async (m) => {
            const { data: profile } = await supabase
              .from('profiles')
              .select('first_name, last_name, email, phone')
              .eq('user_id', m.user_id)
              .single();
            return profile;
          })
        );
        return managerProfiles.filter(p => p !== null);
      }
      return [];
    };

    // For tenants - get building info from profile
    if (managementMode === 'rent' && profile?.building_id) {
      const { data: building } = await supabase
        .from('buildings')
        .select('*')
        .eq('id', profile.building_id)
        .maybeSingle();
      
      if (building) {
        contextData += `\n\nGebäudeinformationen:\nName: ${building.name}\nAdresse: ${[building.address, building.city].filter(Boolean).join(", ")}\nTyp: ${building.type}\nVerwaltungsmodus: ${building.management_mode}`;
        
        // Fetch building managers for tenant's building
        const managerProfiles = await fetchBuildingManagers(profile.building_id);
        if (managerProfiles.length > 0) {
          contextData += `\n\nIhr zuständiger Verwalter:\n`;
          managerProfiles.forEach(manager => {
            const fullName = [manager.first_name, manager.last_name].filter(Boolean).join(' ') || 'Nicht angegeben';
            contextData += `Name: ${fullName}\n`;
            if (manager.email) contextData += `E-Mail: ${manager.email}\n`;
            if (manager.phone) contextData += `Telefon: ${manager.phone}\n`;
          });
        }
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
          contextData += `- ${building.name} (${[building.address, building.city].filter(Boolean).join(", ")})\n`;
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
            
            // Fetch managers for this specific building
            const managerProfiles = await fetchBuildingManagers(specificBuilding.id);
            if (managerProfiles.length > 0) {
              contextData += `\nZuständiger Verwalter:\n`;
              managerProfiles.forEach(manager => {
                const fullName = [manager.first_name, manager.last_name].filter(Boolean).join(' ') || 'Nicht angegeben';
                contextData += `  Name: ${fullName}\n`;
                if (manager.email) contextData += `  E-Mail: ${manager.email}\n`;
                if (manager.phone) contextData += `  Telefon: ${manager.phone}\n`;
              });
            }
          }
        } else {
          contextData += `\n\nHinweis: Sie haben keinen Zugriff auf Gebäude-ID "${buildingId}". Bitte überprüfen Sie Ihre Gebäude-Zuordnungen in den Einstellungen.\n`;
        }
      }

      // Add user's assigned buildings context with manager info
      const { data: userBuildings } = await supabase
        .from('weg_owner_buildings')
        .select('building_id')
        .eq('user_id', userId);

      if (userBuildings && userBuildings.length > 0) {
        contextData += `\n\nIhre zugewiesenen Gebäude mit Verwaltern:\n`;
        for (const ub of userBuildings) {
          const { data: building } = await supabase
            .from('buildings')
            .select('name, address, postal_code, city')
            .eq('id', ub.building_id)
            .single();
          
          if (building) {
            contextData += `\n- ${building.name} (${[building.address, building.city].filter(Boolean).join(", ")})\n`;
            const managerProfiles = await fetchBuildingManagers(ub.building_id);
            if (managerProfiles.length > 0) {
              managerProfiles.forEach(manager => {
                const fullName = [manager.first_name, manager.last_name].filter(Boolean).join(' ') || 'Nicht angegeben';
                contextData += `  Verwalter: ${fullName}`;
                if (manager.email) contextData += ` | ${manager.email}`;
                if (manager.phone) contextData += ` | ${manager.phone}`;
                contextData += `\n`;
              });
            }
          }
        }
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

    // Extract keywords from user message (used by knowledge_documents scoring below)
    const messageWords = message.toLowerCase()
      .replace(/[^\wäöüß\s]/g, '')
      .split(/\s+/)
      .filter((w: string) => w.length > 2);

    // ===== KATEGORIE-BEWUSSTES RAG (über query-documents) =====
    // Statt eigener Volltext-Scoring-Logik nutzen wir die einheitliche RAG-Pipeline,
    // die DMS-Ordnerstruktur (building_files + building_file_categories) berücksichtigt.
    let fileDocContext = "";
    let ragSources: any[] = [];

    const userBuildingId = profile?.building_id || buildingId;

    // Sammle alle relevanten Building-IDs für den Nutzer
    const ragBuildingIds: string[] = [];
    if (userBuildingId) ragBuildingIds.push(userBuildingId);
    if (managementMode === 'weg') {
      const { data: wegBuildings } = await supabase
        .from('weg_owner_buildings')
        .select('building_id')
        .eq('user_id', userId);
      wegBuildings?.forEach(wb => {
        if (!ragBuildingIds.includes(wb.building_id)) ragBuildingIds.push(wb.building_id);
      });
    }

    if (ragBuildingIds.length > 0) {
      try {
        const ragRes = await fetch(`${supabaseUrl}/functions/v1/query-documents`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sessionId: null,
            question: message,
            buildingId: ragBuildingIds[0] || null,
            buildingIds: ragBuildingIds.length > 1 ? ragBuildingIds : null,
            includeGeneral: true,
            userId,
            internalCall: true, // hint for query-documents to skip session writes if needed
          }),
        });

        if (ragRes.ok) {
          const ragData = await ragRes.json();
          ragSources = ragData.sources || [];
          if (ragSources.length > 0) {
            fileDocContext = "\n\n=== RELEVANTE DOKUMENTE (kategorie-bewusste RAG) ===\n";
            ragSources.forEach((src: any, idx: number) => {
              const folderPath = Array.isArray(src.folderPath) && src.folderPath.length > 0
                ? src.folderPath.join(' › ')
                : null;
              const header = [
                src.fileName || 'Unbekannt',
                folderPath ? `Ordner: ${folderPath}` : null,
                src.pageNumber ? `S. ${src.pageNumber}` : null,
              ].filter(Boolean).join(' — ');
              fileDocContext += `\n--- [Quelle ${idx + 1}] ${header} ---\n`;
              fileDocContext += (src.content || '') + "\n";
            });
            fileDocContext += "\n=== ENDE DOKUMENTE ===\n";
            console.log(`RAG context: ${ragSources.length} sources from query-documents`);
          } else {
            console.log('RAG returned no sources');
          }
        } else {
          const errText = await ragRes.text();
          console.error(`query-documents call failed (${ragRes.status}):`, errText.slice(0, 300));
        }
      } catch (err) {
        console.error('Error calling query-documents:', err);
      }
    }

    // ===== BESCHLUESSE DER EIGENTUEMERVERSAMMLUNG =====
    // Ueber den userClient, damit die vorhandene Policy greift: nur veroeffentlichte
    // Beschluesse der Gebaeude, denen der Nutzer als Kontakt zugeordnet ist.
    let beschlussContext = "";
    const suchbegriffe = messageWords.filter((w: string) => w.length > 3).slice(0, 8);
    if (suchbegriffe.length > 0) {
      const orFilter = suchbegriffe.map((w: string) => `resolution_text.ilike.%${w}%`).join(',');
      const { data: beschluesse, error: beschlussErr } = await userClient
        .from('etv_resolutions')
        .select('resolution_number, resolution_text, result, resolved_at, building_id')
        .or(orFilter)
        .order('resolved_at', { ascending: false })
        .limit(6);

      if (beschlussErr) {
        console.error('Beschluss-Suche fehlgeschlagen:', beschlussErr.message);
      } else if (beschluesse && beschluesse.length > 0) {
        beschlussContext = "\n\n=== BESCHLUESSE DER EIGENTUEMERVERSAMMLUNG (zur Frage passend) ===\n";
        beschluesse.forEach((b: any) => {
          const datum = b.resolved_at ? new Date(b.resolved_at).toLocaleDateString('de-DE') : 'Datum unbekannt';
          const ergebnis = b.result === 'passed' || b.result === 'angenommen' ? 'angenommen' : b.result || 'unbekannt';
          beschlussContext += `\n--- Beschluss Nr. ${b.resolution_number || '?'} vom ${datum} (${ergebnis}) ---\n${b.resolution_text || ''}\n`;
        });
        beschlussContext += "\n=== ENDE BESCHLUESSE ===\n";
        console.log(`Beschluss-Kontext: ${beschluesse.length} Treffer`);
      }
    }

    // Intelligent knowledge document search based on user message
    let knowledgeContext = "";
    
    // Determine user type for applies_to filter
    const userType = managementMode === 'rent' ? 'mieter' : 'weg_eigentuemer';
    
    // Fetch relevant knowledge documents
    const { data: knowledgeDocs, error: knowledgeError } = await supabase
      .from('chatbot_knowledge_documents')
      .select('*')
      .or(`applies_to.eq.alle,applies_to.eq.${userType}`)
      .eq('management_mode', managementMode)
      .order('created_at', { ascending: false });
    
    if (knowledgeError) {
      console.error('Error fetching knowledge documents:', knowledgeError);
    } else if (knowledgeDocs && knowledgeDocs.length > 0) {
      // Score documents by keyword match
      const scoredDocs = knowledgeDocs.map(doc => {
        let score = 0;
        const docKeywords = doc.keywords || [];
        const docCategory = doc.category?.toLowerCase() || '';
        const docTitle = doc.title?.toLowerCase() || '';
        
        // Check keyword matches
        messageWords.forEach((word: string) => {
          if (docKeywords.some((k: string) => k.toLowerCase().includes(word) || word.includes(k.toLowerCase()))) {
            score += 3; // High score for keyword match
          }
          if (docCategory.includes(word)) {
            score += 2; // Medium score for category match
          }
          if (docTitle.includes(word)) {
            score += 1; // Lower score for title match
          }
        });
        
        return { ...doc, score };
      });
      
      // Sort by score and take top documents
      const relevantDocs = scoredDocs
        .filter(doc => doc.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3); // Max 3 documents
      
      if (relevantDocs.length > 0) {
        knowledgeContext = "\n\n=== RELEVANTE WISSENSDOKUMENTE ===\n";
        relevantDocs.forEach(doc => {
          knowledgeContext += `\n--- ${doc.title} (${doc.category}) ---\n`;
          knowledgeContext += doc.content;
          knowledgeContext += "\n";
        });
        knowledgeContext += "\n=== ENDE WISSENSDOKUMENTE ===\n";
        
        console.log(`Loaded ${relevantDocs.length} relevant knowledge documents for query`);
      }
    }

    // Build knowledge base string from knowledge_items or fallback to knowledge_base (legacy)
    let knowledgeString = "";
    if (settings.knowledge_items && Array.isArray(settings.knowledge_items) && settings.knowledge_items.length > 0) {
      knowledgeString = settings.knowledge_items
        .map(item => `${item.title}: ${item.content}`)
        .join('\n\n');
    } else if (settings.knowledge_base) {
      knowledgeString = settings.knowledge_base;
    }

    // Load conversation history for CURRENT SESSION only (not all user messages)
    const { data: conversationHistory, error: historyError } = await supabase
      .from('chatbot_messages')
      .select('role, content, created_at')
      .eq('session_id', currentSessionId)
      .order('created_at', { ascending: true })
      .limit(20);

    if (historyError) {
      console.error('Error fetching conversation history:', historyError);
      // Continue without history - don't fail the request
    }

    // Check if this is the first message in the SESSION (not across all conversations)
    const isFirstMessage = !conversationHistory || conversationHistory.length === 0;
    
    // Build conversation behavior instructions with strict rules
    const conversationBehavior = `

=== KRITISCHE VERHALTENSREGELN (IMMER BEFOLGEN) ===

1. BEGRÜSSUNG:
${isFirstMessage 
  ? `   ✓ ERSTE NACHRICHT: Beginnen Sie mit "Guten Tag, ${profile?.first_name} ${profile?.last_name}!" und beantworten Sie dann die Frage.` 
  : `   ✗ FOLGENACHRICHT: KEINE Begrüßung, KEIN Name. Antworten Sie DIREKT auf die Frage ohne jede Anrede.`}

2. ABSCHLUSS:
   ✗ VERBOTEN (niemals verwenden): "Kann ich Ihnen sonst noch weiterhelfen?"
   ✓ ERLAUBT (abwechselnd oder gar nicht):
     - Einfach mit der Antwort enden (oft am besten)
     - "Bei weiteren Fragen stehe ich gerne zur Verfügung."
     - "Melden Sie sich gerne bei Rückfragen."
     - "Lassen Sie mich wissen, wenn Sie weitere Informationen benötigen."
   Jede Antwort sollte einen ANDEREN oder gar keinen Abschluss haben.

3. FORMATIERUNG:
   ✗ Verwende KEINE Markdown-Zeichen wie **, ##, ###, oder * für Aufzählungen
   ✓ Verwende Fließtext mit klaren Absätzen
   ✓ Verwende einfache Spiegelstriche (–) für Aufzählungen
   ✓ Verwende Zeilenumbrüche für Struktur
   ✓ Schreibe Überschriften als normalen fettgedruckten Text ohne # Zeichen

4. WAHRHEIT & EHRLICHKEIT (EXTREM WICHTIG - ANTI-HALLUZINATION):
   ✗ Erfinden Sie NIEMALS Namen, Telefonnummern, E-Mail-Adressen oder andere Fakten
   ✗ Nennen Sie KEINE Verwalter, Kontaktpersonen oder Details, die nicht explizit in den Kontextdaten stehen
   ✓ Wenn Information NICHT verfügbar: "Diese Information liegt mir leider nicht vor."
   ✓ Bei Fragen nach unbekannten Kontaktdaten: "Bitte kontaktieren Sie die Hausverwaltung direkt unter info@rgi-immobilien.de oder 08363 960656."
   ✓ Sagen Sie lieber "Das weiß ich leider nicht" als etwas zu erfinden

5. NIEMALS VERNEINEN, WAS SIE NICHT GEPRÜFT HABEN (WICHTIGSTE REGEL):
   Sie sehen ausschließlich das, was Ihnen oben unter BESCHLUESSE, RELEVANTE DOKUMENTE
   und WISSENSDOKUMENTE mitgegeben wurde. Sie können NICHT in die gesamte Verwaltung
   hineinsehen und wissen daher NIE, ob es etwas gibt oder nicht gibt.
   ✗ VERBOTEN sind Aussagen wie: "Es gibt keinen Beschluss dazu", "Dazu ist nichts
     dokumentiert", "Die App bietet diese Funktion nicht", "Für Ihr Gebäude liegt
     nichts vor." Solche Sätze sind schon mehrfach falsch gewesen und haben Eigentümer
     in die Irre geführt.
   ✓ RICHTIG, wenn im Kontext nichts Passendes steht: "Dazu finde ich hier nichts.
     Das bedeutet nicht, dass es nichts gibt — bitte wenden Sie sich an die
     Hausverwaltung, dort wird das geprüft."
   ✓ RICHTIG, wenn etwas vorliegt: Antworten Sie daraus und nennen Sie die Quelle,
     also den Dokumentnamen oder die Beschlussnummer mit Datum.
   ✓ Fragt jemand nach einem Menüpunkt, den er nicht findet: Viele Menüpunkte werden
     nur unter bestimmten Bedingungen eingeblendet (siehe Wissensdokument zur App).
     Erklären Sie die Bedingung, statt die Funktion zu verneinen.

=== ENDE VERHALTENSREGELN ===`;

    // Construct system prompt using admin-configured prompt + behavioral rules
    const systemPrompt = `${settings.system_prompt}${conversationBehavior}\n\nWissensdatenbank (allgemein):\n${knowledgeString}${knowledgeContext}${beschlussContext}${fileDocContext}\n\nAktuelle Kontextdaten:${contextData}\n\nNutzerinformationen (nur für Kontext): ${profile?.first_name} ${profile?.last_name} (${profile?.email})${managementMode === 'weg' ? ' - WEG-Eigentümer' : ' - Mieter'}${buildingId ? `. Gebäude-ID: ${buildingId}` : managementMode === 'weg' ? '. Keine spezifische Gebäude-ID angegeben.' : ''}`;

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

    // Modell aus den Einstellungen verwenden. Bisher stand hier fest mistral-small-latest,
    // waehrend in chatbot_settings noch "gpt-4o" aus der OpenAI-Zeit hinterlegt war - die
    // Einstellung in der Oberflaeche war damit wirkungslos und die Protokolle nannten ein
    // Modell, das nie geantwortet hat. Fremde Modellnamen werden hier abgefangen.
    const gewaehltesModell = typeof settings.model === 'string' && settings.model.startsWith('mistral')
      ? settings.model
      : 'mistral-large-latest';
    const maxTokens = Number(settings.max_tokens) > 0 ? Number(settings.max_tokens) : 2000;
    // Bewusst ?? statt ||: Eine eingestellte 0 ist ein gueltiger Wert und darf nicht
    // stillschweigend zu 0.7 werden.
    const temperatur = settings.temperature ?? 0.3;

    console.log(`Sending request to Mistral with model: ${gewaehltesModell},`, messages.length, 'messages, isFirstMessage:', isFirstMessage);

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

    // Werkzeug fuer Meldungen. Das Modell legt NICHTS an - es bereitet nur einen
    // Vorschlag vor, den der Nutzer in der Oberflaeche bestaetigen muss. So kann
    // aus einem missverstandenen Satz keine Meldung an die Verwaltung entstehen.
    const tools = [{
      type: 'function',
      function: {
        name: 'meldung_vorschlagen',
        description:
          'Bereitet eine Meldung an die Hausverwaltung vor. Aufrufen, wenn der Nutzer einen Schaden, Mangel oder ein Anliegen schildert, um das sich die Verwaltung kuemmern muss (defekte Heizung, Wasserschaden, kaputtes Licht, Verschmutzung, Laermbelaestigung). NICHT aufrufen bei reinen Informationsfragen und NICHT bei akuter Gefahr - dort zuerst auf den Notruf 112 hinweisen.',
        parameters: {
          type: 'object',
          properties: {
            titel: { type: 'string', description: 'Kurzer Betreff, hoechstens 80 Zeichen' },
            beschreibung: {
              type: 'string',
              description: 'Sachliche Beschreibung des Anliegens in vollstaendigen Saetzen, aus Sicht des Melders formuliert',
            },
          },
          required: ['titel', 'beschreibung'],
        },
      },
    }];

    // Call Mistral API
    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${mistralApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: gewaehltesModell,
        messages: messages,
        max_tokens: maxTokens,
        temperature: temperatur,
        tools,
        tool_choice: 'auto'
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
    const antwort = data.choices[0]?.message;

    // Meldungsvorschlag auslesen. Er wird nur zurueckgegeben, nicht gespeichert -
    // angelegt wird die Meldung erst, wenn der Nutzer sie in der Oberflaeche bestaetigt.
    let reportDraft: { title: string; description: string } | null = null;
    const toolCall = antwort?.tool_calls?.[0];
    if (toolCall?.function?.name === 'meldung_vorschlagen') {
      try {
        const args = JSON.parse(toolCall.function.arguments || '{}');
        if (args.titel && args.beschreibung) {
          reportDraft = {
            title: String(args.titel).slice(0, 120),
            description: String(args.beschreibung).slice(0, 4000),
          };
        }
      } catch (err) {
        console.error('Meldungsvorschlag konnte nicht gelesen werden:', err);
      }
    }

    let assistantMessage = antwort?.content || '';
    if (!assistantMessage) {
      assistantMessage = reportDraft
        ? 'Ich habe daraus eine Meldung an die Hausverwaltung vorbereitet. Bitte prüfen Sie den Text und senden Sie ihn ab, wenn er passt.'
        : 'Entschuldigung, ich konnte keine Antwort generieren.';
    }

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
          model: gewaehltesModell,
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
      sources: ragSources,
      reportDraft,
      usage: data.usage,
      sessionId: currentSessionId
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in chat-with-ai function:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Entschuldigung, es gab einen Fehler bei der Verarbeitung Ihrer Anfrage. Bitte wenden Sie sich direkt an die Hausverwaltung unter info@rgi-immobilien.de oder Tel: 08363 960656.'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});