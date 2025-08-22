
import { supabase } from "@/integrations/supabase/client";

interface NotifyManagersParams {
  reportId: string;
  buildingId: string;
  buildingName: string;
  reportTitle: string;
  reportType: 'miete' | 'weg';
}

export const notifyBuildingManagers = async (params: NotifyManagersParams) => {
  try {
    console.log('Sending notification for new report:', params);

    const { data, error } = await supabase.functions.invoke('send-report-notifications', {
      body: params
    });

    if (error) {
      console.error('Error sending notifications:', error);
      return false;
    }

    console.log('Notifications sent successfully:', data);
    return true;
  } catch (error) {
    console.error('Error invoking notification function:', error);
    return false;
  }
};
