import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { WebPushMessage } from "jsr:@negrel/webpush";

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

// Helper function to convert base64url to Uint8Array
function base64UrlToUint8Array(base64UrlString: string): Uint8Array {
  const padding = '='.repeat((4 - base64UrlString.length % 4) % 4);
  const base64 = (base64UrlString + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Helper function to send web push notification
async function sendWebPushNotification(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: string,
  vapidPrivateKey: string,
  vapidPublicKey: string
) {
  try {
    // Convert VAPID keys from base64url to Uint8Array
    const privateKey = base64UrlToUint8Array(vapidPrivateKey);
    const publicKey = base64UrlToUint8Array(vapidPublicKey);
    
    // Convert subscription keys from base64 to Uint8Array  
    const p256dh = Uint8Array.from(atob(subscription.p256dh), c => c.charCodeAt(0));
    const auth = Uint8Array.from(atob(subscription.auth), c => c.charCodeAt(0));

    const webPushMessage = new WebPushMessage({
      endpoint: subscription.endpoint,
      keys: {
        p256dh: p256dh,
        auth: auth
      }
    }, {
      vapidKeys: {
        publicKey: publicKey,
        privateKey: privateKey
      },
      subject: "mailto:admin@rgi.de"
    });

    const response = await webPushMessage.send(payload);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Push notification failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return response;
    
  } catch (error) {
    console.error('Detailed push error:', error);
    throw error;
  }
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