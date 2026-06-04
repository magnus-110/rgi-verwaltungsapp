import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.52.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { meetingId } = await req.json();
    if (!meetingId) {
      return new Response(JSON.stringify({ error: 'meetingId required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const mistralApiKey = Deno.env.get('MISTRAL_API_KEY');
    if (!mistralApiKey) {
      return new Response(JSON.stringify({ error: 'Mistral API key not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || 'https://eebphowrbarzawwixqcc.supabase.co';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseServiceKey) {
      return new Response(JSON.stringify({ error: 'Service config error' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('generate-meeting-protocol meetingId:', meetingId);

    // Load meeting
    const { data: meeting, error: meetingErr } = await supabase
      .from('etv_meetings')
      .select('*, buildings(name, address, manager_name, unit_count)')
      .eq('id', meetingId)
      .maybeSingle();
    if (meetingErr) {
      console.error('meeting query error', meetingErr);
      throw meetingErr;
    }
    if (!meeting) {
      return new Response(JSON.stringify({ error: `Versammlung mit ID ${meetingId} wurde nicht gefunden.` }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Load agenda items
    const { data: agendaItems, error: aiErr } = await supabase
      .from('etv_agenda_items')
      .select('*')
      .eq('meeting_id', meetingId)
      .order('sort_order');
    if (aiErr) throw aiErr;

    // Load attendees (LEFT join — include attendees without assignments)
    const { data: attendees, error: attErr } = await supabase
      .from('etv_attendees')
      .select(`
        *,
        contact_building_assignments(
          unit_number,
          contacts(first_name, last_name, company_name),
          contact_building_shares(share_type, share_value)
        )
      `)
      .eq('meeting_id', meetingId);
    if (attErr) {
      console.error('attendees query error', attErr);
      throw attErr;
    }

    const building = meeting.buildings;
    const present = (attendees || []).filter((a: any) => a.attendance_type === 'present');
    const proxied = (attendees || []).filter((a: any) => a.attendance_type === 'proxy');
    const absent = (attendees || []).filter((a: any) => a.attendance_type === 'absent');

    const getName = (a: any) => {
      const c = a.contact_building_assignments?.contacts;
      if (!c) return 'Unbekannt';
      return c.company_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unbenannt';
    };

    const getUnit = (a: any) => a.contact_building_assignments?.unit_number || '';
    const getMea = (a: any) => {
      const shares = a.contact_building_assignments?.contact_building_shares || [];
      const mea = shares.find((s: any) => s.share_type === 'mea');
      return mea?.share_value || 0;
    };

    const totalMea = (attendees || []).reduce((s: number, a: any) => s + getMea(a), 0);
    const presentMea = [...present, ...proxied].reduce((s: number, a: any) => s + getMea(a), 0);

    // Build attendee lists
    const presentList = present.map((a: any) => `${getName(a)} (Einheit ${getUnit(a)}, MEA: ${getMea(a).toFixed(4)})`).join('\n');
    const proxiedList = proxied.map((a: any) => `${getName(a)} (Einheit ${getUnit(a)}, vertreten durch Vollmacht)`).join('\n');
    const absentList = absent.map((a: any) => `${getName(a)} (Einheit ${getUnit(a)})`).join('\n');

    // Build agenda summary
    const agendaSummary = (agendaItems || []).map((item: any, idx: number) => {
      const resultText = item.result === 'passed' ? 'ANGENOMMEN'
        : item.result === 'failed' ? 'ABGELEHNT'
        : 'Keine Abstimmung';
      
      const votingPrinciple = item.voting_principle === 'mea' ? 'Wertprinzip (MEA)'
        : item.voting_principle === 'headcount' ? 'Kopfprinzip'
        : item.voting_principle === 'double_qualified' ? 'Doppelt qualifizierte Mehrheit'
        : item.voting_principle || 'Nicht festgelegt';

      return `TOP ${idx + 1}: ${item.title}
Beschreibung: ${item.description || 'Keine Beschreibung'}
Beschlusstext: ${item.resolution_text || 'Kein Beschlusstext vorhanden'}
Abstimmungsprinzip: ${votingPrinciple}
Ergebnis: ${resultText}${item.status === 'voted' ? ` (Ja: ${item.yes_count || 0}, Nein: ${item.no_count || 0}, Enthaltung: ${item.abstain_count || 0})` : ''}
Admin-Notizen/Diskussion: ${item.admin_notes || 'Keine Notizen'}`;
    }).join('\n\n');

    const meetingDate = meeting.meeting_date
      ? new Date(meeting.meeting_date).toLocaleDateString('de-DE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : 'Datum unbekannt';

    const prompt = `Du bist ein juristischer Protokollführer für WEG-Eigentümerversammlungen in Deutschland. Erstelle ein formelles, rechtssicheres Niederschrift/Protokoll nach § 24 Abs. 6 WEG.

VERSAMMLUNGSDATEN:
Titel: ${meeting.title}
Datum/Uhrzeit: ${meetingDate}
Ort: ${meeting.location || 'Nicht angegeben'}
Liegenschaft: ${building?.name || ''}, ${building?.address || ''}
Verwalter: ${building?.manager_name || 'Nicht angegeben'}
Gesamtanzahl Einheiten: ${building?.unit_count || 'Unbekannt'}
Gesamt-MEA: ${totalMea.toFixed(4)}

ANWESENHEIT:
Persönlich anwesend (${present.length}):
${presentList || 'Keine'}

Per Vollmacht vertreten (${proxied.length}):
${proxiedList || 'Keine'}

Abwesend (${absent.length}):
${absentList || 'Keine'}

Vertretene MEA-Anteile: ${presentMea.toFixed(4)} von ${totalMea.toFixed(4)} (${totalMea > 0 ? ((presentMea / totalMea) * 100).toFixed(1) : 0}%)
Beschlussfähigkeit: ${present.length + proxied.length >= 1 ? 'JA' : 'NEIN'}

TAGESORDNUNG UND ERGEBNISSE:
${agendaSummary}

ANFORDERUNGEN AN DAS PROTOKOLL:
1. Beginne mit einem formellen Kopf: "Niederschrift über die ordentliche Eigentümerversammlung der WEG [Name]"
2. Nenne Datum, Uhrzeit, Ort, Versammlungsleiter
3. Stelle die Beschlussfähigkeit fest mit konkreten Zahlen
4. Für jeden TOP:
   - Überschrift "TOP [Nr.]: [Titel]"
   - Kurze Zusammenfassung der Diskussion basierend auf den Admin-Notizen
   - Exakter Beschlusstext (wenn vorhanden)
   - Abstimmungsergebnis mit konkreten Zahlen und Abstimmungsprinzip
   - Fazit: "Der Beschluss wurde mit [X] Ja-Stimmen, [Y] Nein-Stimmen und [Z] Enthaltungen [angenommen/abgelehnt]."
5. Schlussteil: "Die Versammlung wurde um [Uhrzeit] geschlossen."
6. Unterschriftszeilen für Versammlungsleiter und Protokollführer

Schreibe NUR den Protokolltext. Kein Markdown. Nutze Absätze und Leerzeilen zur Gliederung.`;

    // Call Mistral
    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${mistralApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'mistral-medium-3-5',
        messages: [
          { role: 'system', content: 'Du bist ein erfahrener Protokollführer für WEG-Eigentümerversammlungen. Du erstellst rechtssichere, formelle Niederschriften nach deutschem WEG-Recht.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Mistral API error: ${response.status} - ${errText}`);
    }

    const result = await response.json();
    const protocolText = result.choices?.[0]?.message?.content || '';

    // Save to meeting
    const { error: updateErr } = await supabase
      .from('etv_meetings')
      .update({
        protocol_text: protocolText,
        protocol_generated_at: new Date().toISOString(),
      })
      .eq('id', meetingId);
    if (updateErr) throw updateErr;

    return new Response(JSON.stringify({ protocol: protocolText }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('Protocol generation error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
