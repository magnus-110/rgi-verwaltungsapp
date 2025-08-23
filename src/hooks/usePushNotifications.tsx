

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

// Helper function to convert VAPID key from Base64 to Uint8Array
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export const usePushNotifications = () => {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    // Check if push notifications are supported
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      setIsSupported(true);
      checkSubscriptionStatus();
    }
  }, [user]);

  const checkSubscriptionStatus = async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setIsSubscribed(!!subscription);
    } catch (error) {
      console.error('Error checking subscription status:', error);
    }
  };

  const subscribeToPush = async () => {
    if (!isSupported || !user) return;

    setLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      
      // Request notification permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        toast.error('Benachrichtigungen wurden nicht erlaubt');
        return;
      }

      // VAPID public key - your real production key
      const vapidPublicKey = 'BIdmuglnKaUsceWEXrVvITIhjJ5OszUaT3865UbFIs2zYZLVALbDQ6jlmovnOlvtv4ELDd8073ZPIVmobUo-ZRo';
      
      // Convert VAPID public key to Uint8Array
      const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
      
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey
      });

      // Save subscription using RPC function
      const { error } = await supabase.rpc('save_push_subscription', {
        user_id_param: user.id,
        endpoint_param: subscription.endpoint,
        p256dh_param: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('p256dh')!))),
        auth_param: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('auth')!)))
      });

      if (error) throw error;

      setIsSubscribed(true);
      toast.success('Push-Benachrichtigungen aktiviert');
    } catch (error) {
      console.error('Error subscribing to push:', error);
      toast.error('Fehler beim Aktivieren der Push-Benachrichtigungen');
    } finally {
      setLoading(false);
    }
  };

  const unsubscribeFromPush = async () => {
    if (!isSupported || !user) return;

    setLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await subscription.unsubscribe();
        
        // Remove from database using RPC function
        const { error } = await supabase.rpc('remove_push_subscription', {
          user_id_param: user.id,
          endpoint_param: subscription.endpoint
        });

        if (error) throw error;
      }

      setIsSubscribed(false);
      toast.success('Push-Benachrichtigungen deaktiviert');
    } catch (error) {
      console.error('Error unsubscribing from push:', error);
      toast.error('Fehler beim Deaktivieren der Push-Benachrichtigungen');
    } finally {
      setLoading(false);
    }
  };

  return {
    isSupported,
    isSubscribed,
    loading,
    subscribeToPush,
    unsubscribeFromPush
  };
};

