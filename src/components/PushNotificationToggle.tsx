
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Bell, BellOff } from "lucide-react";
import { usePushNotifications } from "@/hooks/usePushNotifications";

export const PushNotificationToggle = () => {
  const { 
    isSupported, 
    isSubscribed, 
    loading, 
    subscribeToPush, 
    unsubscribeFromPush 
  } = usePushNotifications();

  if (!isSupported) {
    return (
      <div className="flex items-center space-x-2 opacity-50">
        <BellOff className="h-4 w-4" />
        <Label className="text-sm">Push-Benachrichtigungen nicht unterstützt</Label>
      </div>
    );
  }

  return (
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
  );
};
