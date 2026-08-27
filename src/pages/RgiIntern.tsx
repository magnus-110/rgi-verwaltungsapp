import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useIsRgiAdmin } from "@/hooks/useRgiAdmin";
import {
  Briefcase, BarChart3, Users, FolderKanban, FileStack,
  Settings, ClipboardList, Timer, FileSignature, Receipt, Handshake, FolderArchive,
} from "lucide-react";

import { CockpitTab } from "@/components/rgi-intern/dashboard/CockpitTab";
import { ContractsTab } from "@/components/rgi-intern/contracts/ContractsTab";
import { OffersTab } from "@/components/rgi-intern/offers/OffersTab";
import { ClientsTab } from "@/components/rgi-intern/clients/ClientsTab";
import { ProjectsTab } from "@/components/rgi-intern/projects/ProjectsTab";
import { InvoicesTab } from "@/components/rgi-intern/invoices/InvoicesTab";
import { TemplatesTab } from "@/components/rgi-intern/templates/TemplatesTab";
import { ItemPresetsTab } from "@/components/rgi-intern/item-presets/ItemPresetsTab";
import { CompanySettingsTab } from "@/components/rgi-intern/settings/CompanySettingsTab";
import { TimeClockAdminTab } from "@/components/rgi-intern/timeclock/TimeClockAdminTab";
import { DocumentsTab } from "@/components/rgi-intern/documents/DocumentsTab";

type AreaId =
  | "cockpit" | "contracts" | "invoices" | "offers"
  | "projects" | "timeclock"
  | "clients" | "documents" | "templates" | "presets" | "settings";

interface AreaDef {
  id: AreaId;
  title: string;
  icon: React.ElementType;
  /** Kurzer Untertitel in der Kopfzeile des Bereichs. */
  caption: string;
}

interface NavGroup {
  label: string;
  items: AreaDef[];
}

const GROUPS: NavGroup[] = [
  {
    label: "Überblick",
    items: [
      { id: "cockpit", title: "Cockpit", icon: BarChart3, caption: "Honorarbestand, auslaufende Bestellungen und was eine Entscheidung braucht" },
    ],
  },
  {
    label: "Ertrag",
    items: [
      { id: "contracts", title: "Verträge", icon: FileSignature, caption: "Verwalterverträge mit Honorarbausteinen, Laufzeiten und Indexstand" },
      { id: "invoices", title: "Rechnungen", icon: Receipt, caption: "Von der offenen Leistung bis zur bezahlten Rechnung" },
    ],
  },
  {
    label: "Arbeit",
    items: [
      { id: "projects", title: "Projekte", icon: FolderKanban, caption: "Eigene Arbeit je Objekt oder Kunde — Stunden werden im Projekt erfasst" },
      { id: "timeclock", title: "Stempelzeiten", icon: Timer, caption: "Arbeitszeit des Teams erfassen, korrigieren und freigeben" },
    ],
  },
  {
    label: "Wachstum",
    items: [
      { id: "offers", title: "Angebote", icon: Handshake, caption: "Anfragen neuer WEG, Honorar festlegen und Vertragsentwurf erzeugen" },
    ],
  },
  {
    label: "Einrichtung",
    items: [
      { id: "clients", title: "Kunden", icon: Users, caption: "Rechnungsempfänger aus Kontakten, Objekten oder frei angelegt" },
      { id: "documents", title: "Dokumente", icon: FolderArchive, caption: "Dokumentenablage der Firma — Flyer, Verträge, Angebote und Rechnungen" },
      { id: "templates", title: "Word-Vorlagen", icon: FileStack, caption: "Layouts für Rechnungen und Angebote mit Platzhaltern" },
      { id: "presets", title: "Positionsvorlagen", icon: ClipboardList, caption: "Wiederkehrende Rechnungspositionen als Bausteine" },
      { id: "settings", title: "Firmendaten", icon: Settings, caption: "Stammdaten, Nummernkreis, Zahlungsziel und Mahngebühren" },
    ],
  },
];

const ALL_AREAS: AreaDef[] = GROUPS.flatMap((g) => g.items);

export default function RgiIntern() {
  const isAdmin = useIsRgiAdmin();
  const [area, setArea] = useState<AreaId>("cockpit");

  if (!isAdmin) {
    return (
      <div className="p-6">
        <Card className="p-8 text-center">
          <Briefcase className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <h2 className="text-xl font-semibold mb-2">Kein Zugriff</h2>
          <p className="text-muted-foreground">Dieses Modul ist nur für Administrator:innen verfügbar.</p>
        </Card>
      </div>
    );
  }

  const current = ALL_AREAS.find((a) => a.id === area) ?? ALL_AREAS[0];

  return (
    <div className="p-3 md:p-6">
      <div className="flex items-center gap-3 mb-4">
        <Briefcase className="w-6 h-6 text-primary shrink-0" />
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold">RGI Intern</h1>
          <p className="text-muted-foreground text-xs md:text-sm">
            Verträge, Ertrag und eigene Arbeit der RGI Immobilien
          </p>
        </div>
      </div>

      {/* Mobile: Bereichswahl als Auswahlfeld */}
      <div className="lg:hidden mb-4">
        <Select value={area} onValueChange={(v) => setArea(v as AreaId)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {GROUPS.map((g) => (
              <SelectGroup key={g.label}>
                <SelectLabel>{g.label}</SelectLabel>
                {g.items.map((it) => (
                  <SelectItem key={it.id} value={it.id}>{it.title}</SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="lg:grid lg:grid-cols-[210px_1fr] lg:gap-6">
        {/* Desktop-Navigation */}
        <nav className="hidden lg:block">
          <div className="sticky top-4 space-y-4">
            {GROUPS.map((g) => (
              <div key={g.label}>
                <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {g.label}
                </div>
                <div className="space-y-0.5">
                  {g.items.map((it) => {
                    const Icon = it.icon;
                    const active = area === it.id;
                    return (
                      <button
                        key={it.id}
                        type="button"
                        onClick={() => setArea(it.id)}
                        aria-current={active ? "page" : undefined}
                        className={
                          active
                            ? "w-full flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md bg-primary/10 text-primary border-l-2 border-primary"
                            : "w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground rounded-md border-l-2 border-transparent hover:bg-muted hover:text-foreground transition-colors"
                        }
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span className="truncate">{it.title}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </nav>

        {/* Inhalt */}
        <div className="min-w-0">
          <div className="mb-4 pb-3 border-b">
            <h2 className="text-base font-semibold flex items-center gap-2">
              {current.title}
              {area === "invoices" && <Badge variant="secondary" className="font-normal">neu</Badge>}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">{current.caption}</p>
          </div>

          {area === "cockpit" && <CockpitTab onNavigate={(a) => setArea(a as AreaId)} />}
          {area === "contracts" && <ContractsTab />}
          {area === "invoices" && <InvoicesTab />}
          {area === "offers" && <OffersTab />}
          {area === "projects" && <ProjectsTab />}
          {area === "timeclock" && <TimeClockAdminTab />}
          {area === "clients" && <ClientsTab />}
          {area === "documents" && <DocumentsTab />}
          {area === "templates" && <TemplatesTab />}
          {area === "presets" && <ItemPresetsTab />}
          {area === "settings" && <CompanySettingsTab />}
        </div>
      </div>
    </div>
  );
}
