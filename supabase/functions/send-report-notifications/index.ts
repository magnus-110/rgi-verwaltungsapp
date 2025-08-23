
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'https://esm.sh/web-push@3.6.7';

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

    // VAPID Keys - diese sollten als Secrets konfiguriert werden
    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');

    if (!vapidPublicKey || !vapidPrivateKey) {
      console.error('VAPID keys not configured');
      return new Response(
        JSON.stringify({ error: 'VAPID keys not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Configure webpush with VAPID keys
    webpush.setVapidDetails(
      'mailto:admin@rgi.de',
      vapidPublicKey,
      vapidPrivateKey
    );

    const notificationTitle = 'Neue Meldung';
    const notificationBody = `${payload.buildingName}: ${payload.reportTitle}`;
    const notificationData = {
      url: `/reports?building=${payload.buildingId}`,
      reportId: payload.reportId,
      buildingId: payload.buildingId
    };

    let successCount = 0;
    let failureCount = 0;

    // Sende Push-Benachrichtigungen
    for (const subscription of subscriptions) {
      try {
        const pushSubscription = {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth
          }
        };

        // Create notification payload
        const pushPayload = JSON.stringify({
          title: notificationTitle,
          body: notificationBody,
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          data: notificationData,
          tag: `report-${payload.reportId}`
        });

        console.log(`Sending push notification to user ${subscription.user_id}`);

        try {
          // Use web-push library to send notification
          await webpush.sendNotification(pushSubscription, pushPayload);
          console.log(`Successfully sent push to ${subscription.user_id}`);
          successCount++;
        } catch (pushError) {
          console.error(`Error sending push to ${subscription.user_id}:`, pushError);
          failureCount++;
        }
      } catch (error) {
        console.error(`Failed to send push to ${subscription.user_id}:`, error);
        failureCount++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        sent: successCount,
        failed: failureCount,
        total: subscriptions.length
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
