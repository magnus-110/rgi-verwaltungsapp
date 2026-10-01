import { Settings2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProtocolTemplatesTab } from "../ProtocolTemplatesTab";
import { ReportTemplatesTab } from "../ReportTemplatesTab";

/** Vorlagen sind Einstellungen – sie liegen hinter dem Zahnrad, nicht auf einer Ebene mit den Versammlungen. */
export const TemplatesSheet = () => (
  <Sheet>
    <SheetTrigger asChild>
      <button
        type="button"
        aria-label="Vorlagen und Einstellungen"
        title="Vorlagen und Einstellungen"
        className="flex h-10 w-10 items-center justify-center rounded-[10px] border bg-background transition-colors hover:bg-muted"
      >
        <Settings2 className="h-[18px] w-[18px] text-muted-foreground" />
      </button>
    </SheetTrigger>
    <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
      <SheetHeader>
        <SheetTitle>Vorlagen</SheetTitle>
        <SheetDescription>Word-Vorlagen für Protokoll und Verwalterbericht. Gelten für alle Versammlungen.</SheetDescription>
      </SheetHeader>
      <Tabs defaultValue="protokoll" className="mt-5">
        <TabsList>
          <TabsTrigger value="protokoll">Protokoll-Vorlagen</TabsTrigger>
          <TabsTrigger value="bericht">Bericht-Vorlagen</TabsTrigger>
        </TabsList>
        <TabsContent value="protokoll" className="mt-4"><ProtocolTemplatesTab /></TabsContent>
        <TabsContent value="bericht" className="mt-4"><ReportTemplatesTab /></TabsContent>
      </Tabs>
    </SheetContent>
  </Sheet>
);
