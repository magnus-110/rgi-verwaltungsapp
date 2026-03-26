import { BillingTab } from "@/components/finance/BillingTab";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

export const Billing = () => {
  const navigate = useNavigate();

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/finanzen')} className="gap-1.5">
          <ArrowLeft className="w-4 h-4" />
          Finanzen
        </Button>
      </div>
      <div>
        <h1 className="text-2xl font-bold">Jahresabrechnung</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Gesamtabrechnung und Einzelabrechnungen Schritt für Schritt erstellen
        </p>
      </div>
      <BillingTab />
    </div>
  );
};
