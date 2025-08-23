
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Bell, BellOff, TestTube } from "lucide-react";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const PushNotificationToggle = () => {
  const { 
    isSupported, 
    isSubscribed, 
    loading, 
    subscribeToPush, 
    unsubscribeFromPush 
  } = usePushNotifications();

  const testNotification = async () => {
    try {
      console.log('Testing push notification...');
      
      const { data, error } = await supabase.functions.invoke('send-report-notifications', {
        body: {
          reportId: 'test-123',
          buildingId: '926bfde1-7728-4add-9c6a-e83c79303fc7',
          buildingName: 'Test-Gebäude', 
          reportTitle: 'Test-Benachrichtigung',
          reportType: 'weg'
        }
      });

      if (error) {
        console.error('Test notification error:', error);
        toast.error('Test-Benachrichtigung fehlgeschlagen');
        return;
      }

      console.log('Test notification result:', data);
      toast.success('Test-Benachrichtigung gesendet');
    } catch (error) {
      console.error('Test notification failed:', error);
      toast.error('Test-Benachrichtigung fehlgeschlagen');
    }
  };

  if (!isSupported) {
    return (
      <div className="flex items-center space-x-2 opacity-50">
        <BellOff className="h-4 w-4" />
        <Label className="text-sm">Push-Benachrichtigungen nicht unterstützt</Label>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-2">
        <Bell className="h-4 w-4" />
        <Label htmlFor="push-notifications" className="text-sm">
          Push-Benachrichtigungen
        </Label>
        <Switch
          id="push-notifications"
          checked={isSubscribed}
          onCheckedChange={(checked) => {
            if (checked) {
              subscribeToPush();
            } else {
              unsubscribeFromPush();
            }
          }}
          disabled={loading}
        />
      </div>
      
      {isSubscribed && (
        <Button 
          onClick={testNotification}
          variant="outline" 
          size="sm" 
          className="flex items-center gap-2"
        >
          <TestTube className="h-4 w-4" />
          Test-Benachrichtigung senden
        </Button>
      )}
    </div>
  );
};
