import React from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

interface PromptGuideSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PromptGuideSheet({ open, onOpenChange }: PromptGuideSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="text-xl font-bold">Prompt-Guide</SheetTitle>
          <p className="text-sm text-muted-foreground">
            Ziel: Schnelle, verlässliche Antworten aus internen Daten für WEG- & Mietverwaltung
          </p>
        </SheetHeader>
        
        <ScrollArea className="h-[calc(100vh-120px)] mt-6 pr-4">
          <div className="space-y-6 pb-8">
            {/* Section: Prompt = Nachricht an die KI */}
            <p className="text-sm text-muted-foreground italic">
              Prompt = Nachricht an die KI
            </p>

            {/* Section 1 */}
            <section>
              <h3 className="font-semibold text-base mb-3">1. Wichtige Grundeinstellungen</h3>
              <p className="text-sm text-muted-foreground mb-2">Je nach Fragestellung gezielt auswählen:</p>
              <ul className="text-sm space-y-1.5 ml-4">
                <li><strong>WEG-spezifisch</strong> → wenn es um eine konkrete WEG / ein Objekt geht</li>
                <li><strong>Alle WEGs</strong> → für Vergleiche oder Muster über mehrere Anlagen</li>
                <li><strong>Allgemeine Infos</strong> → für rechtliche Grundlagen und interne Strukturen, ohne Objektbezug</li>
                <li><strong>Tiefenrecherche aktivieren</strong> für genauere Ergebnisse und mehr Kontext</li>
                <li><strong>Internetsuche</strong> nur wenn explizit gewünscht oder wenn keine Infos vorhanden sind</li>
                <li><strong>Prompt Vorlagen nutzen</strong> für wiederkehrende Fragestellungen</li>
              </ul>
              <p className="text-sm text-destructive mt-3 font-medium">
                Falsche Auswahl = falsche oder unvollständige Antwort
              </p>
            </section>

            <Separator />

            {/* Section 2 */}
            <section>
              <h3 className="font-semibold text-base mb-3">2. Grundregeln für gute Prompts</h3>
              <ul className="text-sm space-y-1.5 ml-4 list-disc">
                <li>Immer konkret: WEG, Thema, Zeitraum nennen</li>
                <li>Eine Fragestellung pro Prompt</li>
                <li>Ergebnisformat vorgeben (Stichpunkte, Kurztext, Tabelle)</li>
                <li>Unsicherheit erlauben („wenn keine Infos vorliegen, bitte sagen")</li>
              </ul>
            </section>

            <Separator />

            {/* Section 3 */}
            <section>
              <h3 className="font-semibold text-base mb-3">3. Do's & Don'ts</h3>
              
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-green-600 dark:text-green-400 mb-2">Do's</p>
                  <ul className="text-sm space-y-1.5 ml-4 list-disc">
                    <li>„Nur auf Basis der vorliegenden Daten antworten"</li>
                    <li>Nach konkreten Quellen fragen (Buchhaltung 2025, Abrechnung 2024, Teilungserklärung, Wartungsvertrag XYZ, Eigentümerversammlungsprotokoll)</li>
                    <li>Verträge und Beschlüsse priorisieren lassen</li>
                    <li>Widersprüche offen benennen lassen</li>
                  </ul>
                </div>
                
                <div>
                  <p className="text-sm font-medium text-destructive mb-2">Don'ts</p>
                  <ul className="text-sm space-y-1.5 ml-4 list-disc">
                    <li>Keine Schätzungen oder Annahmen verlangen</li>
                    <li>Keine Vermischung mehrerer WEGs ohne klare Ansage</li>
                    <li>Keine hypothetischen Rechtsbewertungen</li>
                    <li>Kein „üblich", „wahrscheinlich", „in der Regel"</li>
                  </ul>
                </div>
              </div>
            </section>

            <Separator />

            {/* Section 4 */}
            <section>
              <h3 className="font-semibold text-base mb-3">4. Prompt-Mini-Templates</h3>
              
              <div className="space-y-4">
                {/* Standard Template */}
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-sm font-medium mb-2">Standard (eine WEG)</p>
                  <div className="text-xs bg-background p-3 rounded border whitespace-pre-wrap">
{`Welche Regelung zur Kostenverteilung ist laut Teilungserklärung und aktuellen Beschlüssen (bis 01.01.2026) aus Eigentümerversammlungen für Instandhaltung vorgesehen?

Vorgaben:
- Wenn keine klare Regelung existiert, bitte sagen
- Antwort in Stichpunkten`}
                  </div>
                </div>

                {/* Mehrere WEGs Template */}
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-sm font-medium mb-2">Mehrere WEGs / Vergleich</p>
                  <div className="text-xs bg-background p-3 rounded border whitespace-pre-wrap">
{`Bitte prüfe bei allen vorliegenden WEGs, welche Heizungsart genutzt wird. Prüfe hierfür jeweils die letzte Abrechnung (Datum heute: 14.01.2026) und suche nach Brennstoffbestellungen in der Buchhaltung für eine doppelte Überprüfung?

Vorgaben:
- Erstelle eine übersichtliche Tabelle mit WEG und Heizungsart
- Wenn keine Informationen gefunden werden, markiere diese Zeile`}
                  </div>
                </div>

                {/* Allgemeine Infos Template */}
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-sm font-medium mb-2">Allgemeine Infos</p>
                  <div className="text-xs bg-background p-3 rounded border whitespace-pre-wrap">
{`Ist die Heizungswartung nach der Betriebskostenverordnung umlagefähig in der Mietverwaltung?

Vorgaben:
- Gesetzesbezug nennen
- Begründung
- Sachliche Zusammenfassung`}
                  </div>
                </div>
              </div>
            </section>

            <Separator />

            {/* Section 5 */}
            <section>
              <h3 className="font-semibold text-base mb-3">5. Typische Praxisbeispiele</h3>
              
              <div className="space-y-4">
                {/* Beschlussprüfung */}
                <div>
                  <p className="text-sm font-medium mb-2">Beschlussprüfung</p>
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <span className="text-destructive text-sm">Schlecht:</span>
                      <span className="text-sm text-muted-foreground">„Darf man das beschließen?"</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-green-600 dark:text-green-400 text-sm">Gut:</span>
                      <span className="text-sm">„Ist für die Maßnahme laut Teilungserklärung der WEG Lindenweg 4 eine einfache Mehrheit ausreichend?"</span>
                    </div>
                  </div>
                </div>

                {/* Buchhaltung */}
                <div>
                  <p className="text-sm font-medium mb-2">Buchhaltung</p>
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <span className="text-destructive text-sm">Schlecht:</span>
                      <span className="text-sm text-muted-foreground">„Was kostet die Heizung ungefähr?"</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-green-600 dark:text-green-400 text-sm">Gut:</span>
                      <span className="text-sm">„Welche Heizungswartungskosten wurden 2023 für Einheit 5 der WEG Lindenweg 4 verbucht? Prüfe hierfür die Abrechnung sowie die Buchhaltung vom Jahr 2023."</span>
                    </div>
                  </div>
                </div>

                {/* Rechtliche Einordnung */}
                <div>
                  <p className="text-sm font-medium mb-2">Rechtliche Einordnung</p>
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <span className="text-destructive text-sm">Schlecht:</span>
                      <span className="text-sm text-muted-foreground">„Ist das rechtens?"</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-green-600 dark:text-green-400 text-sm">Gut:</span>
                      <span className="text-sm">„Welche gesetzlichen Pflichten des Verwalters sind im Zusammenhang mit der vorliegenden Akte dokumentiert?"</span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <Separator />

            {/* Section 6 */}
            <section>
              <h3 className="font-semibold text-base mb-3">6. Halluzinations-Check</h3>
              <p className="text-sm text-muted-foreground mb-2">Antwort kritisch prüfen:</p>
              <ul className="text-sm space-y-1.5 ml-4 list-disc">
                <li>Genannte Quelle prüfen bei fraglicher Antwort?</li>
                <li>Passt der Zeitraum?</li>
                <li>Klingt es zu allgemein für einen konkreten Fall?</li>
              </ul>
              <p className="text-sm mt-3">
                Wenn ja → Follow Up prompt mit spezifischer Nachfrage.
              </p>
            </section>

            <Separator />

            {/* Section 7 */}
            <section>
              <h3 className="font-semibold text-base mb-3">7. Merksätze</h3>
              <ul className="text-sm space-y-2 ml-4 list-disc">
                <li>Das Modell kennt nur, was im Kontext steht.</li>
                <li>Je mehr inhaltlich relevante Begriffe vorkommen, desto besser</li>
                <li>Nennung der Informationsquellen wenn möglich verbessert Ergebnis enorm</li>
              </ul>
            </section>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
