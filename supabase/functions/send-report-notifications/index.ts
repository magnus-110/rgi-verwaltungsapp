import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PushSubscription {
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface NotificationPayload {
  reportId: string;
  buildingId: string;
  buildingName: string;
  reportTitle: string;
  reportType: 'miete' | 'weg';
}

// Helper function to generate VAPID JWT token
async function generateVAPIDToken(vapidPrivateKey: string, vapidPublicKey: string, audience: string) {
  // Import the private key
  const privateKeyBytes = Uint8Array.from(atob(vapidPrivateKey.replace(/_/g, '/').replace(/-/g, '+')), c => c.charCodeAt(0));
  
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    privateKeyBytes,
    {
      name: 'ECDSA',
      namedCurve: 'P-256',
    },
    false,
    ['sign']
  );

  const header = {
    typ: 'JWT',
    alg: 'ES256'
  };

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: audience,
    exp: now + (12 * 60 * 60), // 12 hours
    sub: 'mailto:admin@rgi.de'
  };

  const encoder = new TextEncoder();
  
  // Base64URL encode
  const base64UrlEncode = (data: Uint8Array) => {
    return btoa(String.fromCharCode(...data))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  };

  const encodedHeader = base64UrlEncode(encoder.encode(JSON.stringify(header)));
  const encodedPayload = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    cryptoKey,
    encoder.encode(signingInput)
  );

  const encodedSignature = base64UrlEncode(new Uint8Array(signature));
  
  return `${signingInput}.${encodedSignature}`;
}

// Helper function to send web push notification
async function sendWebPushNotification(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: string,
  vapidPrivateKey: string,
  vapidPublicKey: string
) {
  const url = new URL(subscription.endpoint);
  const audience = `${url.protocol}//${url.host}`;
  
  const vapidToken = await generateVAPIDToken(vapidPrivateKey, vapidPublicKey, audience);

  const response = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `vapid t=${vapidToken}, k=${vapidPublicKey}`,
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'TTL': '2419200' // 4 weeks
    },
    body: payload
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Push notification failed: ${response.status} ${response.statusText} - ${errorText}`);
  }

  return response;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const payload: NotificationPayload = await req.json();
    console.log('Processing notification for:', payload);

    // Finde alle Verwalter für dieses Gebäude
    const { data: buildingManagers, error: managersError } = await supabaseClient
      .from('building_managers')
      .select('user_id')
      .eq('building_id', payload.buildingId);

    if (managersError) {
      console.error('Error fetching building managers:', managersError);
      throw managersError;
    }

    if (!buildingManagers || buildingManagers.length === 0) {
      console.log('No managers found for building:', payload.buildingId);
      return new Response(
        JSON.stringify({ success: true, message: 'No managers to notify' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${buildingManagers.length} managers for building ${payload.buildingId}`);
    const managerIds = buildingManagers.map(m => m.user_id);

    // Hole Push-Subscriptions für diese Verwalter
    const { data: subscriptions, error: subscriptionsError } = await supabaseClient
      .from('push_subscriptions')
      .select('*')
      .in('user_id', managerIds);

    if (subscriptionsError) {
      console.error('Error fetching subscriptions:', subscriptionsError);
      throw subscriptionsError;
    }

    if (!subscriptions || subscriptions.length === 0) {
      console.log('No push subscriptions found for managers');
      return new Response(
        JSON.stringify({ success: true, message: 'No subscriptions to send to' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${subscriptions.length} push subscriptions`);

    // VAPID Keys - diese sollten als Secrets konfiguriert werden
    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');

    console.log('VAPID Public Key loaded:', vapidPublicKey ? 'YES' : 'NO');
    console.log('VAPID Private Key loaded:', vapidPrivateKey ? 'YES' : 'NO');

    if (!vapidPublicKey || !vapidPrivateKey) {
      console.error('VAPID keys not configured - Public:', !!vapidPublicKey, 'Private:', !!vapidPrivateKey);
      return new Response(
        JSON.stringify({ error: 'VAPID keys not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const notificationTitle = 'Neue Meldung';
    const notificationBody = `${payload.buildingName}: ${payload.reportTitle}`;
    const notificationData = {
      url: `/reports?building=${payload.buildingId}`,
      reportId: payload.reportId,
      buildingId: payload.buildingId
    };

    let successCount = 0;
    let failureCount = 0;
    const failedSubscriptions: string[] = [];

    // Create notification payload
    const pushPayload = JSON.stringify({
      title: notificationTitle,
      body: notificationBody,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      data: notificationData,
      tag: `report-${payload.reportId}`
    });

    // Sende Push-Benachrichtigungen
    for (const subscription of subscriptions) {
      try {
        console.log(`Sending push notification to user ${subscription.user_id}`);

        await sendWebPushNotification(
          {
            endpoint: subscription.endpoint,
            p256dh: subscription.p256dh,
            auth: subscription.auth
          },
          pushPayload,
          vapidPrivateKey,
          vapidPublicKey
        );

        console.log(`Successfully sent push to ${subscription.user_id}`);
        successCount++;

      } catch (pushError) {
        console.error(`Error sending push to ${subscription.user_id}:`, pushError);
        failureCount++;
        
        // Check if this is a 404/410 error indicating invalid subscription
        if (pushError instanceof Error && (
          pushError.message.includes('404') || 
          pushError.message.includes('410') ||
          pushError.message.includes('invalid')
        )) {
          console.log(`Removing invalid subscription for user ${subscription.user_id}`);
          failedSubscriptions.push(subscription.endpoint);
          
          // Remove invalid subscription
          try {
            await supabaseClient
              .from('push_subscriptions')
              .delete()
              .eq('endpoint', subscription.endpoint);
          } catch (deleteError) {
            console.error('Error removing invalid subscription:', deleteError);
          }
        }
      }
    }

    console.log(`Notification sending complete: ${successCount} sent, ${failureCount} failed, ${failedSubscriptions.length} invalid subscriptions removed`);

    return new Response(
      JSON.stringify({
        success: true,
        sent: successCount,
        failed: failureCount,
        total: subscriptions.length,
        removedInvalidSubscriptions: failedSubscriptions.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Function error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});