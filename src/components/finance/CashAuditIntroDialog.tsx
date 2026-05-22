import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Sparkles, LayoutGrid, MousePointerClick, Repeat, FileText, AlertTriangle, CheckCircle2 } from "lucide-react";

interface Props {
  open: boolean;
  onClose: (dontShowAgain: boolean) => void;
  buildingName?: string;
  fiscalYear?: number | string;
}

export function CashAuditIntroDialog({ open, onClose, buildingName, fiscalYear }: Props) {
  const [dontShow, setDontShow] = useState(true);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose(dontShow)}>
      <DialogContent className="max-w-2xl max-h-[90vh] p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-3">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Sparkles className="h-5 w-5 text-primary" />
            Willkommen zur digitalen Kassenprüfung
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {buildingName ? <>Sie prüfen die Kasse der <span className="font-medium text-foreground">{buildingName}</span></> : "Sie prüfen die Kasse"}{" "}
            {fiscalYear && <>für das Wirtschaftsjahr <span className="font-medium text-foreground">{fiscalYear}</span>.</>}
          </p>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] px-6">
          <div className="space-y-5 pb-4">
            {/* Section 1: Ablauf */}
            <section className="rounded-lg border bg-muted/30 p-4">
              <p className="text-sm leading-relaxed">
                Arbeiten Sie sich Schritt für Schritt durch die <strong>vier Tabs</strong>.
                Ihre Eingaben (Häkchen, Notizen, Markierungen) werden <strong>automatisch gespeichert</strong> –
                Sie können den Link jederzeit erneut öffnen und dort weitermachen, wo Sie aufgehört haben.
              </p>
            </section>

            {/* Section 2: Tabs */}
            <section>
              <h3 className="flex items-center gap-2 font-semibold text-sm mb-2">
                <LayoutGrid className="h-4 w-4 text-primary" /> Die Tabs im Überblick
              </h3>
              <ul className="space-y-2 text-sm">
                <li><strong>Kontenblätter</strong> – Salden und Einzelbuchungen je Konto. Ideal, um systematisch Konto für Konto zu prüfen und abzuhaken.</li>
                <li><strong>Buchungsjournal</strong> – Chronologische Liste aller Buchungen mit Such- und Monatsfilter. Gut für stichprobenartige Prüfungen.</li>
                <li><strong>Dokumente</strong> – Bankauszüge, Rechnungen und Verträge zum Quervergleich.</li>
                <li><strong>Hinweise</strong> – Anmerkungen des Verwalters zu Besonderheiten dieses Jahres.</li>
              </ul>
            </section>

            <Separator />

            {/* Section 3: Buchung prüfen */}
            <section>
              <h3 className="flex items-center gap-2 font-semibold text-sm mb-2">
                <MousePointerClick className="h-4 w-4 text-primary" /> So prüfen Sie eine Buchung
              </h3>
              <p className="text-sm leading-relaxed">
                Klicken Sie im Journal oder Kontenblatt auf eine beliebige Buchung. Es öffnet sich eine Detailansicht,
                in der Sie direkt den dazugehörigen Beleg sehen:
              </p>
              <ul className="space-y-1.5 text-sm mt-2 ml-1">
                <li className="flex gap-2"><FileText className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" /> die <strong>verknüpfte Rechnung</strong> als PDF-Vorschau, oder</li>
                <li className="flex gap-2"><Repeat className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" /> die <strong>verknüpfte Buchungsvorlage</strong> (siehe nächster Abschnitt).</li>
              </ul>
              <p className="text-sm leading-relaxed mt-3">
                Markieren Sie die Buchung anschließend mit
                <span className="inline-flex items-center gap-1 mx-1 px-1.5 py-0.5 rounded bg-green-100 text-green-800 text-xs"><CheckCircle2 className="h-3 w-3" /> Geprüft</span>
                oder
                <span className="inline-flex items-center gap-1 mx-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-xs"><AlertTriangle className="h-3 w-3" /> Auffällig</span>.
                Bei Auffälligkeiten können Sie eine kurze Notiz hinterlassen.
              </p>
            </section>

            <Separator />

            {/* Section 4: Vorlagen & interne Buchungen */}
            <section>
              <h3 className="flex items-center gap-2 font-semibold text-sm mb-2">
                <Repeat className="h-4 w-4 text-primary" /> Vorlagen & Buchungen ohne Beleg
              </h3>
              <div className="space-y-3 text-sm leading-relaxed">
                <p>
                  Eine <strong>Buchungsvorlage</strong> steht für eine <strong>wiederkehrende Zahlung</strong> –
                  z. B. Hausmeister-Pauschale, Versicherungsbeitrag oder Müllgebühr.
                  Für solche Zahlungen gibt es nicht jeden Monat eine neue Rechnung;
                  stattdessen dient die Vorlage als „Vertrags-Beleg" und definiert Betrag, Empfänger und Intervall.
                </p>
                <p>
                  <strong>Interne Buchungen</strong> brauchen ebenfalls keinen externen Beleg. Dazu gehören
                  z. B. Umbuchungen zwischen Konten (Bank ↔ Rücklagen), Heizkostenumlagen,
                  Rechnungsabgrenzungen oder Eröffnungs- und Schlussbuchungen.
                </p>
                <p className="text-muted-foreground">
                  <strong>Faustregel:</strong> Wirklich auffällig sind nur Buchungen, zu denen weder eine
                  Rechnung noch eine Vorlage noch eine plausible interne Begründung existiert.
                </p>
              </div>
            </section>
          </div>
        </ScrollArea>

        <DialogFooter className="px-6 py-4 border-t bg-muted/20 flex-row items-center justify-between sm:justify-between gap-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <Checkbox checked={dontShow} onCheckedChange={(c) => setDontShow(!!c)} />
            Nicht mehr automatisch anzeigen
          </label>
          <Button onClick={() => onClose(dontShow)}>Verstanden, los geht's</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
