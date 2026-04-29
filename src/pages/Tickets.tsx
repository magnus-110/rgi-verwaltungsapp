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

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 md:px-6 pt-4 md:pt-6">
        <div className="mb-4">
          <h1 className="text-2xl md:text-3xl font-bold">Tickets</h1>
          <p className="text-muted-foreground text-sm">
            Eingehende Meldungen und laufende Vorgänge an einem Ort
          </p>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList variant="underline" className="mb-4">
            <TabsTrigger variant="underline" value="meldungen">
              <ClipboardList className="h-4 w-4 mr-1.5" />
              Meldungen
            </TabsTrigger>
            <TabsTrigger variant="underline" value="vorgaenge">
              <FolderKanban className="h-4 w-4 mr-1.5" />
              Vorgänge
            </TabsTrigger>
          </TabsList>

          <TabsContent value="meldungen" className="mt-0">
            {/* Reuse existing Reports page (renders its own header + content). */}
            <div className="-mx-4 md:-mx-6">
              <Reports />
            </div>
          </TabsContent>

          <TabsContent value="vorgaenge" className="mt-0 pb-8">
            <CasesGlobalView />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Tickets;
export { Tickets };
