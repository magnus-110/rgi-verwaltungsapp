import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { WifiOff, RefreshCcw } from "lucide-react";

const Offline = () => {
  const handleReload = () => {
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-8 text-center space-y-6">
        <div className="flex justify-center">
          <div className="p-3 bg-muted rounded-full">
            <WifiOff className="h-8 w-8 text-muted-foreground" />
          </div>
        </div>
        
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-foreground">
            Keine Internetverbindung
          </h1>
          <p className="text-muted-foreground">
            Einige Funktionen sind offline nicht verfügbar. Bitte überprüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.
          </p>
        </div>

        <div className="space-y-4">
          <div className="text-sm text-muted-foreground space-y-2">
            <p className="font-medium">Offline nicht verfügbar:</p>
            <ul className="text-left space-y-1 text-xs">
              <li>• Meldungen erstellen</li>
              <li>• Chatbot nutzen</li>
              <li>• Forum-Beiträge anzeigen</li>
              <li>• Daten synchronisieren</li>
            </ul>
          </div>
          
          <Button 
            onClick={handleReload}
            className="w-full"
            variant="default"
          >
            <RefreshCcw className="h-4 w-4 mr-2" />
            Neu laden
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default Offline;