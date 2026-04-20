import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FileText, Mail, Plus, HelpCircle, History, LayoutTemplate, Send, FileEdit } from "lucide-react";
import { TemplateList } from "@/components/communication/TemplateList";
import { TemplateUploadDialog } from "@/components/communication/TemplateUploadDialog";
import { LetterCampaignWizard } from "@/components/communication/LetterCampaignWizard";
import { EmailCampaignWizard } from "@/components/communication/EmailCampaignWizard";
import { CampaignHistoryList } from "@/components/communication/CampaignHistoryList";
import { VariableHelpSheet } from "@/components/communication/VariableHelpSheet";

interface Props { buildingId: string; }

export const BuildingCommunicationTab = ({ buildingId }: Props) => {
  const [tab, setTab] = useState("serienbriefe");
  const [tplDlgOpen, setTplDlgOpen] = useState(false);
  const [tplDlgType, setTplDlgType] = useState<"letter" | "email">("letter");
  const [letterWizOpen, setLetterWizOpen] = useState(false);
  const [emailWizOpen, setEmailWizOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const openTemplateDlg = (t: "letter" | "email") => { setTplDlgType(t); setTplDlgOpen(true); };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Kommunikation</h2>
          <p className="text-sm text-muted-foreground">Serienbriefe und Rundmails an Eigentümer und Mieter</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setHelpOpen(true)}>
          <HelpCircle className="h-4 w-4 mr-1" /> Platzhalter
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList variant="underline">
          <TabsTrigger value="serienbriefe" variant="underline"><FileText className="h-4 w-4 mr-1" />Serienbriefe</TabsTrigger>
          <TabsTrigger value="rundmails" variant="underline"><Mail className="h-4 w-4 mr-1" />Rundmails</TabsTrigger>
          <TabsTrigger value="vorlagen" variant="underline"><LayoutTemplate className="h-4 w-4 mr-1" />Vorlagen</TabsTrigger>
          <TabsTrigger value="verlauf" variant="underline"><History className="h-4 w-4 mr-1" />Verlauf</TabsTrigger>
        </TabsList>

        <TabsContent value="serienbriefe" className="space-y-4 mt-4">
          <Card>
            <CardContent className="p-6 text-center space-y-3">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                <FileEdit className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold">Serienbrief erstellen</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Word-Vorlage hochladen oder bestehende wählen, Empfänger filtern, ZIP-Bundle herunterladen
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button onClick={() => setLetterWizOpen(true)}><Plus className="h-4 w-4 mr-1" />Neuer Serienbrief</Button>
                <Button variant="outline" onClick={() => openTemplateDlg("letter")}>Word-Vorlage hochladen</Button>
              </div>
            </CardContent>
          </Card>
          <div>
            <h4 className="text-sm font-medium mb-2">Verfügbare Brief-Vorlagen</h4>
            <TemplateList buildingId={buildingId} type="letter" onUse={() => setLetterWizOpen(true)} />
          </div>
        </TabsContent>

        <TabsContent value="rundmails" className="space-y-4 mt-4">
          <Card>
            <CardContent className="p-6 text-center space-y-3">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                <Send className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold">Rundmail versenden</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Personalisierte E-Mail an alle ausgewählten Eigentümer oder Mieter — über Ihre SMTP-Konten
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button onClick={() => setEmailWizOpen(true)}><Plus className="h-4 w-4 mr-1" />Neue Rundmail</Button>
                <Button variant="outline" onClick={() => openTemplateDlg("email")}>Mail-Vorlage erstellen</Button>
              </div>
            </CardContent>
          </Card>
          <div>
            <h4 className="text-sm font-medium mb-2">Verfügbare Mail-Vorlagen</h4>
            <TemplateList buildingId={buildingId} type="email" onUse={() => setEmailWizOpen(true)} />
          </div>
        </TabsContent>

        <TabsContent value="vorlagen" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium">Alle Vorlagen</h4>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => openTemplateDlg("letter")}>+ Brief</Button>
              <Button variant="outline" size="sm" onClick={() => openTemplateDlg("email")}>+ Mail</Button>
            </div>
          </div>
          <TemplateList buildingId={buildingId} />
        </TabsContent>

        <TabsContent value="verlauf" className="mt-4">
          <CampaignHistoryList buildingId={buildingId} />
        </TabsContent>
      </Tabs>

      <TemplateUploadDialog open={tplDlgOpen} onOpenChange={setTplDlgOpen} buildingId={buildingId} defaultType={tplDlgType} />
      <LetterCampaignWizard open={letterWizOpen} onOpenChange={setLetterWizOpen} buildingId={buildingId} />
      <EmailCampaignWizard open={emailWizOpen} onOpenChange={setEmailWizOpen} buildingId={buildingId} />
      <VariableHelpSheet open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  );
};
