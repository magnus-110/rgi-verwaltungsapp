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

    // Status der Meldungen so, wie der Nutzer sie in der App sieht.
    const statusText = (status: string) =>
      ({ open: 'Offen', in_progress: 'In Bearbeitung', resolved: 'Erledigt' } as Record<string, string>)[status] || status;

    // Gebaeude, fuer die der Nutzer eine Meldung abgeben darf. Wird unten fuer das
    // Meldungs-Werkzeug gebraucht, damit eine Meldung beim richtigen Objekt landet.
    const meldeGebaeude: { id: string; name: string }[] = [];

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
        meldeGebaeude.push({ id: building.id, name: building.name });
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
          contextData += `- ${report.title} (Status: ${statusText(report.status)}${report.priority ? `, Priorität: ${report.priority}` : ''}, Erstellt: ${new Date(report.created_at).toLocaleDateString('de-DE')})\n`;
          if (report.admin_notes) {
            contextData += `  Verwalter-Notiz: ${report.admin_notes}\n`;
          }
        });
      }
    }

    // For WEG owners
    if (managementMode === 'weg') {
      // Frueher wurde hier die Liste ALLER WEG-Gebaeude der Verwaltung in den Kontext
      // gegeben. Das hat fremde Objekte offengelegt und den Assistenten verwirrt
      // (er hielt sie fuer Objekte des Fragenden). Relevant sind nur die eigenen
      // Gebaeude, die weiter unten geladen werden.

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
          contextData += `- ${report.title} (Status: ${statusText(report.status)}${report.priority ? `, Priorität: ${report.priority}` : ''}, Erstellt: ${new Date(report.created_at).toLocaleDateString('de-DE')})\n`;
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
            meldeGebaeude.push({ id: ub.building_id, name: building.name });
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

    // Lange Wissensdokumente (z. B. der Verwaltervertrag mit rund 43.000 Zeichen) wurden
    // bisher komplett eingefuegt. Das verdraengt alles andere und das Modell findet die
    // passende Stelle schlechter. Bei langen Texten nehmen wir die Absaetze, in denen die
    // Begriffe der Frage vorkommen, plus jeweils den Absatz davor und danach.
    const auszugFuerFrage = (text: string, woerter: string[], maxZeichen = 6000): string => {
      if (text.length <= maxZeichen) return text;
      const absaetze = text.split(/\n\s*\n/);
      const begriffe = woerter.filter((w) => w.length > 3);
      const treffer = new Set<number>();
      absaetze.forEach((a, i) => {
        const klein = a.toLowerCase();
        if (begriffe.some((b) => klein.includes(b))) {
          treffer.add(i - 1); treffer.add(i); treffer.add(i + 1);
        }
      });
      const indizes = [...treffer].filter((i) => i >= 0 && i < absaetze.length).sort((a, b) => a - b);
      if (indizes.length === 0) return text.slice(0, maxZeichen) + '\n[... gekuerzt]';
      let auszug = '';
      let letzter = -2;
      for (const i of indizes) {
        const teil = (i !== letzter + 1 ? '\n[...]\n' : '\n') + absaetze[i];
        if (auszug.length + teil.length > maxZeichen) break;
        auszug += teil;
        letzter = i;
      }
      return auszug.trim() + '\n[... weitere Abschnitte nicht relevant für diese Frage]';
    };

    // Intelligent knowledge document search based on user message
    let knowledgeContext = "";
    
    // Determine user type for applies_to filter
    const userType = managementMode === 'rent' ? 'mieter' : 'weg_eigentuemer';
    
    // Fetch relevant knowledge documents
    const { data: knowledgeDocs, error: knowledgeError } = await supabase
      .from('chatbot_knowledge_documents')
      .select('*')
      // Dokumente "fuer alle" gelten unabhaengig vom Bereich. Bisher wurden sie zusaetzlich
      // nach management_mode gefiltert - Notfall-Leitfaden und Kontaktdaten, die unter "weg"
      // angelegt sind, kamen dadurch nie bei Mietern an.
      .or(`applies_to.eq.alle,and(applies_to.eq.${userType},management_mode.eq.${managementMode})`)
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
          knowledgeContext += auszugFuerFrage(doc.content || '', messageWords);
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
      .select('role, content, created_at, metadata')
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

3. FORMATIERUNG UND LÄNGE:
   ✓ Kurz und direkt: Beantworten Sie zuerst genau die gestellte Frage, in wenigen Sätzen.
   ✓ Einfache Sprache ohne Fachbegriffe. Ist ein Fachbegriff nötig, erklären Sie ihn kurz.
   ✓ Erlaubt: **fett** für Wichtiges und einfache Aufzählungen mit "- ".
   ✗ Keine Überschriften mit #, keine Tabellen, keine langen Listen mit Unterpunkten.
   ✗ Keine allgemeinen Ratschläge, nach denen nicht gefragt wurde.

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

6. MELDUNGEN AN DIE HAUSVERWALTUNG (Sie KÖNNEN Meldungen vorbereiten):
   Sie haben das Werkzeug "meldung_vorschlagen". Damit erscheint unter Ihrer Antwort ein
   fertiger Meldungsentwurf mit dem Knopf "Meldung absenden". Erst der Klick des Nutzers
   schickt die Meldung ab - Sie selbst senden nichts.
   ✓ Schildert der Nutzer einen Schaden, Mangel, Defekt oder ein Problem, um das sich die
     Verwaltung kümmern muss (auch technische Probleme mit der App, z. B. Dokumente lassen
     sich nicht öffnen), rufen Sie das Werkzeug SOFORT in derselben Antwort auf.
   ✗ Fragen Sie NICHT vorher "Soll ich eine Meldung vorbereiten?" - der Entwurf IST bereits
     die Rückfrage, der Nutzer entscheidet per Knopf.
   ✓ Antwortet der Nutzer mit "Ja", "gerne", "bitte melden" o. ä. auf ein Angebot zur Meldung,
     rufen Sie das Werkzeug ebenfalls sofort auf.
   ✓ Fehlen wichtige Angaben (wo genau? seit wann?), bereiten Sie den Entwurf trotzdem vor und
     schreiben Sie dazu, dass der Nutzer diese Angaben ergänzen kann.
   ✓ Begleittext dazu: ein bis zwei Sätze, z. B. dass der Entwurf unten bereitsteht. Keine
     Bürozeiten-Abhandlung, keine Aufzählung von Vorgehensweisen.
   ✓ Bei akuter Gefahr (Feuer, Gasgeruch, Wasser an der Elektrik, Personen in Gefahr):
     zuerst auf Notruf 112 bzw. den Notfall-Leitfaden hinweisen, KEINE Meldung vorschlagen.
   ✗ Behaupten Sie nie, Sie könnten keine Meldungen erstellen.

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
        // Hat der Assistent in einer frueheren Antwort schon eine Meldung vorbereitet,
        // muss er das wissen - sonst bietet er sie beim naechsten "Ja" erneut an oder
        // behauptet, es gebe keine.
        const entwurf = (msg as any).metadata?.reportDraft;
        const zusatz = msg.role === 'assistant' && entwurf?.title
          ? `\n\n[Hinweis fuer den Assistenten: In dieser Antwort wurde ein Meldungsvorschlag "${entwurf.title}" angezeigt. Der Nutzer sendet ihn per Knopf selbst ab.]`
          : '';
        messages.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content + zusatz
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
    const werkzeugParameter: any = {
      type: 'object',
      properties: {
        titel: { type: 'string', description: 'Kurzer Betreff, hoechstens 80 Zeichen, z. B. "Licht im Treppenhaus ausgefallen"' },
        beschreibung: {
          type: 'string',
          description: 'Sachliche Beschreibung des Anliegens in vollstaendigen Saetzen, aus Sicht des Melders formuliert (Ich-Form). Nur Angaben verwenden, die der Nutzer gemacht hat.',
        },
      },
      required: ['titel', 'beschreibung'],
    };
    // Bei mehreren Objekten soll das Modell das betroffene benennen, damit die Meldung
    // nicht pauschal beim erstbesten Gebaeude landet.
    if (meldeGebaeude.length > 1) {
      werkzeugParameter.properties.gebaeude = {
        type: 'string',
        enum: meldeGebaeude.map((g) => g.name),
        description: 'Betroffenes Gebaeude. Nur angeben, wenn es aus dem Gespraech eindeutig hervorgeht.',
      };
    }
    const tools = [{
      type: 'function',
      function: {
        name: 'meldung_vorschlagen',
        description:
          'Zeigt dem Nutzer einen fertigen Meldungsentwurf an die Hausverwaltung mit dem Knopf "Meldung absenden". Sofort aufrufen, wenn der Nutzer einen Schaden, Mangel, Defekt oder ein Problem schildert, um das sich die Verwaltung kuemmern muss (z. B. defekte Heizung, Wasserschaden, Licht im Treppenhaus ausgefallen, Verschmutzung, Laermbelaestigung, Dokumente in der App lassen sich nicht oeffnen) - oder wenn er einer angebotenen Meldung zustimmt. Nicht vorher nachfragen. NICHT aufrufen bei reinen Informationsfragen und NICHT bei akuter Gefahr - dort zuerst auf den Notruf 112 hinweisen.',
        parameters: werkzeugParameter,
      },
    }];

    const frageMistral = async (toolChoice: 'auto' | 'any', verlauf: any[]) => {
      const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mistralApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: gewaehltesModell,
          messages: verlauf,
          max_tokens: maxTokens,
          temperature: temperatur,
          tools,
          tool_choice: toolChoice,
        }),
      });
      return res;
    };

    const leseEntwurf = (nachricht: any): { title: string; description: string; buildingId?: string | null; buildingName?: string | null } | null => {
      const aufruf = nachricht?.tool_calls?.find((t: any) => t?.function?.name === 'meldung_vorschlagen');
      if (!aufruf) return null;
      try {
        const roh = aufruf.function.arguments;
        const args = typeof roh === 'string' ? JSON.parse(roh || '{}') : (roh || {});
        if (!args.titel || !args.beschreibung) return null;
        const gewaehlt = args.gebaeude ? meldeGebaeude.find((g) => g.name === args.gebaeude) : null;
        const ziel = gewaehlt
          || meldeGebaeude.find((g) => g.id === buildingId)
          || (meldeGebaeude.length === 1 ? meldeGebaeude[0] : null);
        return {
          title: String(args.titel).slice(0, 120),
          description: String(args.beschreibung).slice(0, 4000),
          buildingId: ziel?.id ?? null,
          buildingName: ziel?.name ?? null,
        };
      } catch (err) {
        console.error('Meldungsvorschlag konnte nicht gelesen werden:', err);
        return null;
      }
    };

    // Call Mistral API
    const response = await frageMistral('auto', messages);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Mistral API error:', response.status, errorText.slice(0, 500));
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
    let reportDraft = leseEntwurf(antwort);

    // Sicherheitsnetz: Das Modell hat in der Praxis oft nur GEFRAGT ("Soll ich eine
    // Meldung vorbereiten?"), statt das Werkzeug zu benutzen - oder auf ein "Ja" hin
    // erneut nur Text geschrieben. Erkennen wir das, holen wir den Entwurf mit einem
    // zweiten Aufruf, der das Werkzeug erzwingt.
    if (!reportDraft) {
      const text = String(antwort?.content || '');
      // Nur ein echtes ANGEBOT des Assistenten zaehlt ("Soll ich ...", "Ich kann ...
      // Meldung vorbereiten"), nicht eine Erklaerung, wie man selbst eine Meldung anlegt.
      const bietetMeldungAn =
        /(soll ich|möchten sie|moechten sie|darf ich|kann ich|ich kann|ich könnte|ich koennte|ich würde|ich wuerde)[^.?!\n]{0,120}meldung/i.test(text)
        || /meldung[^.!\n]{0,80}(vorbereit|erstell|aufnehm|anleg|weiterleit|übernehm|uebernehm)[^.!\n]{0,40}\?/i.test(text);
      const letzteBotAntwort = [...(conversationHistory || [])].reverse().find((m: any) => m.role === 'assistant');
      const vorherAngeboten = !!letzteBotAntwort
        && !(letzteBotAntwort as any).metadata?.reportDraft
        && /meldung/i.test(letzteBotAntwort.content || '')
        && /\?/.test(letzteBotAntwort.content || '');
      const stimmtZu = /^\s*(ja|jap|jo|gerne|gern|bitte|ok|okay|mach(en sie)? (das|bitte)|ja,? bitte|ja gerne)\b/i.test(message.trim());
      if (bietetMeldungAn || (vorherAngeboten && stimmtZu)) {
        try {
          const zweiterVersuch = await frageMistral('any', messages);
          if (zweiterVersuch.ok) {
            const daten2 = await zweiterVersuch.json();
            reportDraft = leseEntwurf(daten2.choices?.[0]?.message);
            if (reportDraft) console.log('Meldungsentwurf ueber erzwungenen Werkzeugaufruf erzeugt');
          } else {
            console.error('Erzwungener Werkzeugaufruf fehlgeschlagen:', zweiterVersuch.status);
          }
        } catch (err) {
          console.error('Erzwungener Werkzeugaufruf fehlgeschlagen:', err);
        }
        if (reportDraft) {
          // Der erste Text fragt meist noch "Soll ich ...?" - das passt nicht mehr zum
          // angezeigten Entwurf.
          if (antwort) antwort.content = '';
        }
      }
    }

    let assistantMessage = antwort?.content || '';
    if (!assistantMessage) {
      assistantMessage = reportDraft
        ? 'Ich habe eine Meldung an die Hausverwaltung vorbereitet. Bitte prüfen Sie den Text unten und tippen Sie auf „Meldung absenden", wenn alles passt.'
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
          reportDraft,
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
