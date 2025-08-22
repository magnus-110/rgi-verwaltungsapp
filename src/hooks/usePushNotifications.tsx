
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

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

      // VAPID public key - dieser muss in der Produktionsumgebung gesetzt werden
      const vapidPublicKey = 'BEl62iUYgUivxIkv69yViEuiBIa40HEYyIT_HfCyzsVBOTM';
      
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidPublicKey
      });

      // Save subscription to database
      const { error } = await supabase
        .from('push_subscriptions')
        .upsert({
          user_id: user.id,
          endpoint: subscription.endpoint,
          p256dh: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('p256dh')!))),
          auth: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('auth')!)))
        }, { onConflict: 'endpoint' });

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
        
        // Remove from database
        await supabase
          .from('push_subscriptions')
          .delete()
          .eq('user_id', user.id)
          .eq('endpoint', subscription.endpoint);
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
