import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface NotificationRequest {
  reportId: string;
  buildingId: string;
  buildingName: string;
  reportTitle: string;
  reportType: 'miete' | 'weg';
}

// Einfache Web Push Implementierung ohne externe Libraries
async function sendPushNotification(subscription: any, payload: string, vapidKeys: any) {
  const webpushEndpoint = 'https://fcm.googleapis.com/fcm/send';
  
  const options = {
    method: 'POST',
    headers: {
      'Authorization': `key=${vapidKeys.serverKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: subscription.endpoint.split('/').pop(),
      notification: JSON.parse(payload),
      data: JSON.parse(payload)
    })
  };

  const response = await fetch(webpushEndpoint, options);
  return response;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS request');
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    console.log('Starting push notification function');
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const payload: NotificationRequest = await req.json();
    console.log('Processing notification for:', payload);

    // Für jetzt: vereinfachte Test-Implementation
    // Sende direkt eine Benachrichtigung über FCM
    
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Push notification system ready',
        received: payload
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Function error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error.message 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});