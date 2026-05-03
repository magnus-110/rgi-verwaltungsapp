import { useEffect } from "react";
import { useSearchParams, useLocation } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Reports } from "./Reports";
import { CasesGlobalView } from "@/components/cases/CasesGlobalView";
import { ClipboardList, FolderKanban } from "lucide-react";

const Tickets = () => {
  const [params, setParams] = useSearchParams();
  const location = useLocation();

  // Path alias /tickets/vorgaenge -> tab=vorgaenge
  const pathTab = location.pathname.endsWith("/vorgaenge") ? "vorgaenge" : null;
  const tab = pathTab || params.get("tab") || "meldungen";

  useEffect(() => {
    if (pathTab && params.get("tab") !== pathTab) {
      const next = new URLSearchParams(params);
      next.set("tab", pathTab);
      setParams(next, { replace: true });
    }
  }, [pathTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const setTab = (v: string) => {
    const next = new URLSearchParams(params);
    next.set("tab", v);
    setParams(next, { replace: true });
  };

  const isVorgaenge = tab === "vorgaenge";

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 md:px-6 pt-4 md:pt-6">
        <div className="mb-4 flex items-center gap-2">
          {isVorgaenge ? (
            <FolderKanban className="h-6 w-6 text-primary" />
          ) : (
            <ClipboardList className="h-6 w-6 text-primary" />
          )}
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">
              {isVorgaenge ? "Vorgänge" : "Meldungen"}
            </h1>
            <p className="text-muted-foreground text-sm">
              {isVorgaenge
                ? "Laufende Vorgänge an einem Ort"
                : "Eingehende Meldungen verwalten"}
            </p>
          </div>
        </div>

        {isVorgaenge ? (
          <div className="pb-8">
            <CasesGlobalView />
          </div>
        ) : (
          <div className="-mx-4 md:-mx-6">
            <Reports />
          </div>
        )}
      </div>
    </div>
  );
};

export default Tickets;
export { Tickets };
