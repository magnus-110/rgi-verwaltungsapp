 import { useState } from "react";
 import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
 import { ScrollArea } from "@/components/ui/scroll-area";
 import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
 
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
           <TabsList className="grid w-full grid-cols-2">
             <TabsTrigger value="agb">AGB</TabsTrigger>
             <TabsTrigger value="datenschutz">Datenschutz</TabsTrigger>
           </TabsList>
           
           <TabsContent value="agb">
             <ScrollArea className="h-[calc(85vh-140px)] w-full rounded-md border p-4">
               <div className="prose prose-sm max-w-none">
                 <h2 className="text-lg font-bold mb-4">Allgemeine Geschäftsbedingungen (AGB)</h2>
                 <p className="text-sm text-muted-foreground mb-4">für die Nutzung der RGI-Immobilien App</p>
                 
                 <h3 className="font-semibold mt-4 mb-2">§ 1 Geltungsbereich und Anbieter</h3>
                 <p className="text-sm mb-2">(1) Diese Allgemeinen Geschäftsbedingungen (nachfolgend „AGB") regeln die Nutzung der RGI-Immobilien App (nachfolgend „App"), die von der RGI-Immobilien GmbH & Co. KG (nachfolgend „RGI") bereitgestellt wird.</p>
                 <p className="text-sm mb-2">(2) Die App dient der Kommunikation, dem Dokumentenmanagement sowie der Bereitstellung von Informationen für Nutzer, die in einem direkten Verwaltungs- oder Mietverhältnis zur RGI stehen.</p>
 
                 <h3 className="font-semibold mt-4 mb-2">§ 2 Nutzungsberechtigung und Zugang</h3>
                 <p className="text-sm mb-2">(1) Die Nutzung der App ist ausschließlich auf folgende Nutzergruppen (nachfolgend „Nutzer") beschränkt:</p>
                 <ul className="text-sm list-disc pl-5 mb-2">
                   <li>Mieter, deren Mietobjekt unmittelbar durch die RGI im Rahmen der Mietverwaltung betreut wird.</li>
                   <li>Wohnungseigentümer (Sondereigentümer), deren Immobilie Teil einer durch die RGI verwalteten Wohnungseigentümergemeinschaft (WEG) ist.</li>
                 </ul>
                 <p className="text-sm mb-2">(2) Ausschluss: Mieter von Sondereigentümern innerhalb einer WEG (sog. WEG-Mieter) sind ausdrücklich nicht nutzungsberechtigt, da kein direktes Vertragsverhältnis zur RGI besteht.</p>
                 <p className="text-sm mb-2">(3) Die Nutzung setzt eine Registrierung voraus. Ein Anspruch auf Freischaltung besteht nicht. Mit Beendigung des zugrunde liegenden Miet- oder Verwaltungsauftrags endet die Nutzungsberechtigung automatisch.</p>
 
                 <h3 className="font-semibold mt-4 mb-2">§ 3 Leistungsumfang der App</h3>
                 <p className="text-sm mb-2">(1) Die App bietet unter anderem folgende Funktionen:</p>
                 <ul className="text-sm list-disc pl-5 mb-2">
                   <li>Übermittlung von Schadensmeldungen und Anfragen.</li>
                   <li>Einsicht in objektbezogene Dokumente (z.B. Abrechnungen, Protokolle).</li>
                   <li>Nutzung eines digitalen „Schwarzen Bretts".</li>
                   <li>Nutzung eines KI-basierten Assistenzsystems (Chatbot).</li>
                 </ul>
                 <p className="text-sm mb-2">(2) Die RGI ist berechtigt, den Funktionsumfang der App jederzeit zu ändern, zu erweitern oder einzuschränken, sofern dies dem Nutzer unter Berücksichtigung der Interessen der RGI zumutbar ist.</p>
 
                 <h3 className="font-semibold mt-4 mb-2">§ 4 Besonderheiten des KI-Chatbots (Mistral AI)</h3>
                 <p className="text-sm mb-2">(1) In der App ist ein KI-Chatbot integriert, der auf der Technologie von Mistral AI (via API-Schnittstelle) basiert. Dieser dient ausschließlich als unverbindliches Assistenzsystem zur ersten Information.</p>
                 <p className="text-sm mb-2">(2) Die durch die KI generierten Antworten werden automatisiert erstellt. Die RGI übernimmt keine Gewähr für die Richtigkeit, Vollständigkeit oder juristische Validität der KI-Antworten. Die KI ersetzt keine fachliche Beratung oder verbindliche Auskunft durch RGI-Mitarbeiter.</p>
                 <p className="text-sm mb-2">(3) Zur Sicherstellung der Servicequalität und zur Bearbeitung von Anliegen können die im Chat geführten Dialoge durch Mitarbeiter der RGI eingesehen und weiterverarbeitet werden.</p>
 
                 <h3 className="font-semibold mt-4 mb-2">§ 5 Digitales Schwarzes Brett</h3>
                 <p className="text-sm mb-2">(1) Auf dem digitalen Schwarzen Brett bereitgestellte Informationen (z.B. Wartungstermine, Aushänge) werden nach bestem Wissen gepflegt.</p>
                 <p className="text-sm mb-2">(2) Die RGI übernimmt keine Gewähr für die ständige Aktualität dieser Informationen, insbesondere wenn diese auf Angaben Dritter (z.B. Handwerksbetriebe) beruhen. Nutzer sind verpflichtet, kritische Termine im Zweifel gegenzuprüfen.</p>
 
                 <h3 className="font-semibold mt-4 mb-2">§ 6 Haftungsbeschränkung</h3>
                 <p className="text-sm mb-2">(1) Die RGI haftet unbeschränkt bei Vorsatz oder grober Fahrlässigkeit, bei der Verletzung von Leben, Körper oder Gesundheit sowie nach dem Produkthaftungsgesetz.</p>
                 <p className="text-sm mb-2">(2) Bei leicht fahrlässiger Verletzung einer Pflicht, die wesentlich für die Erreichung des Vertragszwecks ist (Kardinalpflicht), ist die Haftung der RGI auf den Schaden begrenzt, der nach der Art des fraglichen Geschäfts vorhersehbar und typisch ist.</p>
                 <p className="text-sm mb-2">(3) Im Übrigen ist eine Haftung der RGI – insbesondere für technische Störungen der App oder fehlerhafte KI-Inhalte – ausgeschlossen.</p>
 
                 <h3 className="font-semibold mt-4 mb-2">§ 7 Pflichten der Nutzer</h3>
                 <p className="text-sm mb-2">(1) Der Nutzer ist verpflichtet, seine Zugangsdaten geheim zu halten und vor dem Zugriff Dritter zu schützen.</p>
                 <p className="text-sm mb-2">(2) Es ist untersagt, beleidigende, rechtswidrige oder schädigende Inhalte über die App zu verbreiten oder technische Manipulationen an der App vorzunehmen.</p>
 
                 <h3 className="font-semibold mt-4 mb-2">§ 8 Datenschutz und Technik</h3>
                 <p className="text-sm mb-2">(1) Die Verarbeitung personenbezogener Daten erfolgt gemäß der Datenschutzerklärung der RGI.</p>
                 <p className="text-sm mb-2">(2) Die technische Bereitstellung (Backend) erfolgt über den Dienstleister Supabase auf Servern innerhalb der Europäischen Union (Standort: Frankfurt am Main). Die Datenübertragung erfolgt verschlüsselt (TLS-Verfahren).</p>
 
                 <h3 className="font-semibold mt-4 mb-2">§ 9 Schlussbestimmungen</h3>
                 <p className="text-sm mb-2">(1) Es gilt das Recht der Bundesrepublik Deutschland.</p>
                 <p className="text-sm mb-2">(2) Sollten einzelne Bestimmungen dieser AGB unwirksam sein, bleibt die Wirksamkeit der übrigen Bestimmungen unberührt.</p>
                 <p className="text-sm mb-2">(3) Die RGI behält sich vor, diese AGB mit einer angemessenen Ankündigungsfrist zu ändern. Die Änderung gilt als angenommen, wenn der Nutzer nicht innerhalb von sechs Wochen widerspricht.</p>
               </div>
             </ScrollArea>
           </TabsContent>
 
           <TabsContent value="datenschutz">
             <ScrollArea className="h-[calc(85vh-140px)] w-full rounded-md border p-4">
               <div className="prose prose-sm max-w-none">
                 <h2 className="text-lg font-bold mb-4">Datenschutzerklärung</h2>
                 <p className="text-sm mb-4">Wir freuen uns über Ihren Besuch auf unserer Webseite und in unserer App. Wir nehmen den Schutz Ihrer Daten sehr ernst. Nachfolgend informieren wir Sie über die Verarbeitung Ihrer Daten gemäß der Datenschutz-Grundverordnung (DSGVO).</p>
 
                 <h3 className="font-semibold mt-4 mb-2">1. Name und Kontaktdaten des Verantwortlichen</h3>
                 <p className="text-sm mb-2">Verantwortlich für die Datenverarbeitung ist: RGI-Immobilien GmbH & Co. KG, Andreas Göttinger, Schützenstraße 16, 87459 Pfronten</p>
                 <p className="text-sm mb-2">E-Mail: info@rgi-immobilien.de | Internet: https://rgi-immobilien.de</p>
 
                 <h3 className="font-semibold mt-4 mb-2">2. Rechte der Nutzer und Betroffenen</h3>
                 <p className="text-sm mb-2">Sie haben gegenüber uns folgende Rechte hinsichtlich der Sie betreffenden personenbezogenen Daten: Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16 DSGVO), Löschung (Art. 17 DSGVO), Einschränkung der Verarbeitung (Art. 18 DSGVO), Datenübertragbarkeit (Art. 20 DSGVO), Widerspruch (Art. 21 DSGVO) sowie das Beschwerderecht bei einer Aufsichtsbehörde (Art. 77 DSGVO).</p>
 
                 <h3 className="font-semibold mt-4 mb-2">3. Datenerhebung in der mobilen App und Nutzergruppen</h3>
                 <p className="text-sm mb-2">Zur Nutzung unserer App für die Immobilienverwaltung und das Problemmanagement erheben wir Bestandsdaten (Name, Vorname), Kontaktdaten (E-Mail-Adresse) und Objektdaten (zugeordnete Wohnanlage/Immobilie).</p>
                 <p className="text-sm mb-2"><strong>Zugriffsberechtigung:</strong> Die Nutzung der App ist ausschließlich folgenden Personengruppen vorbehalten:</p>
                 <ul className="text-sm list-disc pl-5 mb-2">
                   <li>Mieter, die sich in der direkten Mietverwaltung durch die RGI-Immobilien GmbH & Co. KG befinden.</li>
                   <li>Eigentümer, die sich in der Eigentumsverwaltung (WEG) durch die RGI-Immobilien GmbH & Co. KG befinden.</li>
                 </ul>
                 <p className="text-sm mb-2"><strong>Hinweis:</strong> Mieter von Sondereigentumseinheiten innerhalb einer WEG-Verwaltung (sog. WEG-Mieter), mit denen kein direktes Verwaltungs- oder Mietverhältnis zur RGI besteht, haben keinen Zugriff auf die App.</p>
                 <p className="text-sm mb-2"><strong>Nutzungszweck:</strong> Verwaltung der Verhältnisse sowie effiziente Bearbeitung von Schadensmeldungen (Instandhaltung/Kommunikation). Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung).</p>
 
                 <h3 className="font-semibold mt-4 mb-2">4. Nutzung des KI-Chatbots (Mistral AI API)</h3>
                 <p className="text-sm mb-2">Wir bieten einen Chatbot an, um Ihre Anfragen effizienter zu bearbeiten. <strong>Funktionsweise:</strong> Ihre Eingaben im Chat werden an die API von Mistral AI (Mistral AI SAS, 5 rue de la Fidélité, 75010 Paris, Frankreich) übertragen, um eine Antwort zu generieren. Da der Anbieter seinen Sitz in der EU hat, entspricht die Verarbeitung dem europäischen Datenschutzniveau.</p>
                 <p className="text-sm mb-2"><strong>Qualitätssicherung & Monitoring:</strong> Die Chatverläufe können von Mitarbeitern der RGI-Immobilien GmbH & Co. KG eingesehen und mitgelesen werden, um die Qualität der KI-Antworten sicherzustellen und Ihr Anliegen final rechtssicher zu bearbeiten. Geben Sie bitte keine sensiblen privaten Daten (z. B. Passwörter, Gesundheitsdaten) ein.</p>
                 <p className="text-sm mb-2"><strong>Hinweis zur Richtigkeit:</strong> Die KI ist ein Assistenzsystem und kann Fehler machen oder ungenaue Informationen liefern. Die Antworten dienen der ersten Orientierung und sind nicht rechtsverbindlich.</p>
                 <p className="text-sm mb-2"><strong>Speicherdauer:</strong> Protokolle der Chatverläufe werden nach 6 Monaten automatisch gelöscht, sofern sie nicht zur Dokumentation eines Falls (z. B. Mängelrüge) in die Objektakte übernommen werden müssen. Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO sowie Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an effizientem Service).</p>
 
                 <h3 className="font-semibold mt-4 mb-2">5. Digitales Schwarzes Brett</h3>
                 <p className="text-sm mb-2">Die App enthält ein „Digitales Schwarzes Brett". Die dort bereitgestellten Informationen dienen der allgemeinen Information. Wir weisen darauf hin, dass die Inhalte nicht zwingend tagesaktuell sind. Für die Vollständigkeit und Aktualität wird keine Gewähr übernommen.</p>
 
                 <h3 className="font-semibold mt-4 mb-2">6. Hosting und Backend-Infrastruktur</h3>
                 <p className="text-sm mb-2"><strong>Webhosting:</strong> Strato AG, Berlin (Serverstandort Deutschland). <strong>App-Backend:</strong> Supabase (Supabase Inc.). Wir nutzen den Serverstandort Frankfurt am Main (Deutschland). Für die Übermittlung an den US-Anbieter wurden Standardvertragsklauseln (SCC) abgeschlossen. Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO (technische Sicherheit). Ein Auftragsverarbeitungsvertrag gemäß Art. 28 DSGVO liegt vor.</p>
 
                 <h3 className="font-semibold mt-4 mb-2">7. Server-Logfiles</h3>
                 <p className="text-sm mb-2">Beim Aufruf der App werden automatisch Informationen (IP-Adresse anonymisiert, Datum/Uhrzeit, Betriebssystem etc.) in Logfiles gespeichert, um die Systemsicherheit zu gewährleisten (Art. 6 Abs. 1 lit. f DSGVO).</p>
 
                 <h3 className="font-semibold mt-4 mb-2">8. Speicherdauer und Löschfristen</h3>
                 <p className="text-sm mb-2">Wir löschen Daten, sobald der Zweck entfällt, unter Berücksichtigung gesetzlicher Fristen:</p>
                 <ul className="text-sm list-disc pl-5 mb-2">
                   <li>Allgemeine Chat-Daten: 6 Monate</li>
                   <li>Maklerrelevante Unterlagen: 5 Jahre (§ 14 MaBV)</li>
                   <li>Steuerlich relevante Unterlagen: 10 Jahre (§ 147 AO)</li>
                 </ul>
 
                 <h3 className="font-semibold mt-4 mb-2">9. Google Maps und Google Fonts</h3>
                 <p className="text-sm mb-2">Wir nutzen Google Maps und Google Fonts (Google Ireland Limited). Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO. Wir empfehlen die Nutzung eines Consent-Banners zur Einholung der Einwilligung nach Art. 6 Abs. 1 lit. a DSGVO.</p>
 
                 <h3 className="font-semibold mt-4 mb-2">10. Datensicherheit</h3>
                 <p className="text-sm mb-2">Wir setzen TLS-Verschlüsselung (SSL) ein und treffen technische sowie organisatorische Maßnahmen (TOM), um Ihre Daten vor unbefugtem Zugriff zu schützen.</p>
               </div>
             </ScrollArea>
           </TabsContent>
         </Tabs>
       </SheetContent>
     </Sheet>
   );
 };