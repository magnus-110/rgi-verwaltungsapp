import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AgbText, DatenschutzText } from "@/components/legal/LegalTexts";

interface LegalDocumentsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTab?: "agb" | "datenschutz";
}

export const LegalDocumentsSheet = ({ open, onOpenChange, defaultTab = "agb" }: LegalDocumentsSheetProps) => {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85vh]">
        <SheetHeader>
          <SheetTitle>Rechtliche Dokumente</SheetTitle>
        </SheetHeader>

        <Tabs defaultValue={defaultTab} className="w-full mt-4">
          <TabsList variant="pill" className="grid w-full grid-cols-2">
            <TabsTrigger variant="pill" value="agb">AGB</TabsTrigger>
            <TabsTrigger variant="pill" value="datenschutz">Datenschutz</TabsTrigger>
          </TabsList>

          <TabsContent value="agb">
            <ScrollArea className="h-[calc(85vh-140px)] w-full rounded-md border p-4">
              <AgbText />
            </ScrollArea>
          </TabsContent>

          <TabsContent value="datenschutz">
            <ScrollArea className="h-[calc(85vh-140px)] w-full rounded-md border p-4">
              <DatenschutzText />
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
};
