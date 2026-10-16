/**
 * Einstellungen für Admins und Mitarbeiter (Neugestaltung 16.10.2026).
 *
 * Links eine Bereichsliste, rechts der Inhalt. „Mein Konto" sieht jeder,
 * „Büro" nur Admins. Der gewählte Bereich steht in der Adresse (?tab=…),
 * damit Links aus der App direkt an die richtige Stelle springen.
 */
import { useMemo, type ComponentType } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Bell, Bot, BookOpenCheck, Landmark, Mail, Megaphone, ShieldCheck, UserRound, Users, Wallet,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { ProfilBereich } from "@/components/settings/ProfilBereich";
import { SicherheitBereich } from "@/components/settings/SicherheitBereich";
import { NotificationSettingsSection } from "@/components/settings/NotificationSettingsSection";
import { TeamBereich } from "@/components/settings/TeamBereich";
import { ChatbotBereich } from "@/components/settings/ChatbotBereich";
import { BankzugaengeEinstellungen } from "@/components/konten/BankzugaengeEinstellungen";
import { EmailSettingsSection } from "@/components/email/EmailSettingsSection";
import { ReportSettings } from "@/components/reports/ReportSettings";
import { ChartOfAccountsTab } from "@/components/finance/ChartOfAccountsTab";
import { Card, CardContent } from "@/components/ui/card";

type Gruppe = "Mein Konto" | "Büro";

interface Bereich {
  id: string;
  titel: string;
  text: string;
  icon: ComponentType<{ className?: string }>;
  gruppe: Gruppe;
  nurAdmin?: boolean;
  inhalt: (p: { istAdmin: boolean }) => JSX.Element;
}

const BEREICHE: Bereich[] = [
  {
    id: "profil", titel: "Profil", icon: UserRound, gruppe: "Mein Konto",
    text: "Dein Name, deine Telefonnummer und deine Unterschrift für Dokumente.",
    inhalt: () => <ProfilBereich />,
  },
  {
    id: "sicherheit", titel: "Anmeldung & Sicherheit", icon: ShieldCheck, gruppe: "Mein Konto",
    text: "Passwort ändern oder ohne Passwort per Fingerabdruck bzw. Gesichtserkennung anmelden.",
    inhalt: () => <SicherheitBereich />,
  },
  {
    id: "benachrichtigungen", titel: "Benachrichtigungen", icon: Bell, gruppe: "Mein Konto",
    text: "Worüber dich die App informiert – auf dem Handy/PC und während du in der App arbeitest.",
    inhalt: () => <NotificationSettingsSection />,
  },
  {
    id: "bank", titel: "Mein Bankzugang", icon: Wallet, gruppe: "Mein Konto",
    text: "Dein eigenes Online-Banking für Überweisungen und Einzüge. Freigegeben wird immer mit deiner TAN.",
    inhalt: () => <BankzugaengeEinstellungen bereich="mein" />,
  },
  {
    id: "team", titel: "Team", icon: Users, gruppe: "Büro", nurAdmin: true,
    text: "Wer im Büro Zugang zur App hat – Admins und Mitarbeiter anlegen, ändern oder entfernen.",
    inhalt: () => <TeamBereich />,
  },
  {
    id: "postfaecher", titel: "E-Mail-Postfächer", icon: Mail, gruppe: "Büro", nurAdmin: true,
    text: "Die Postfächer, die im Postfach der App ankommen, und wer sie sehen darf.",
    inhalt: () => <EmailSettingsSection />,
  },
  {
    id: "buero-bank", titel: "Kontoauszüge abrufen", icon: Landmark, gruppe: "Büro", nurAdmin: true,
    text: "Büro-Zugänge, über die die App jeden Tag die Umsätze aller Konten abholt. Zahlungen laufen nie darüber.",
    inhalt: () => <BankzugaengeEinstellungen bereich="buero" />,
  },
  {
    id: "kontenrahmen", titel: "Kontenrahmen", icon: BookOpenCheck, gruppe: "Büro", nurAdmin: true,
    text: "Die Buchungskonten, die jede Liegenschaft als Grundlage bekommt. Einzelne Liegenschaften können eigene Konten ergänzen.",
    inhalt: () => (
      <Card>
        <CardContent className="pt-6">
          <ChartOfAccountsTab />
        </CardContent>
      </Card>
    ),
  },
  {
    id: "meldungen", titel: "Meldungen", icon: Megaphone, gruppe: "Büro", nurAdmin: true,
    text: "Die Schritte, mit denen Melder über den Stand ihrer Meldung informiert werden, und der Export.",
    inhalt: () => <ReportSettings />,
  },
  {
    id: "chatbot", titel: "Chatbot", icon: Bot, gruppe: "Büro", nurAdmin: true,
    text: "Der Assistent im Portal der Eigentümer und Mieter: Verhalten, Wissen und bisherige Gespräche.",
    inhalt: () => <ChatbotBereich />,
  },
];

// Alte Adressen (?tab=…) weiter verstehen
const ALT: Record<string, string> = {
  profile: "profil",
  notifications: "benachrichtigungen",
  users: "team",
  email: "postfaecher",
  templates: "kontenrahmen",
  bankzugaenge: "bank",
};

export const Settings = () => {
  const { profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const istAdmin = profile?.role === "admin";

  const sichtbar = useMemo(() => BEREICHE.filter((b) => istAdmin || !b.nurAdmin), [istAdmin]);
  const gewuenscht = searchParams.get("tab") ?? "profil";
  const aktiv = sichtbar.find((b) => b.id === (ALT[gewuenscht] ?? gewuenscht)) ?? sichtbar[0];
  const waehlen = (id: string) => {
    setSearchParams({ tab: id }, { replace: true });
    window.scrollTo({ top: 0 });
  };

  if (!profile) {
    return <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">Laden…</div>;
  }

  const gruppen = (["Mein Konto", "Büro"] as Gruppe[])
    .map((g) => ({ g, items: sichtbar.filter((b) => b.gruppe === g) }))
    .filter((x) => x.items.length);

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-3 md:p-0">
      <header>
        <h1 className="text-2xl font-bold md:text-3xl">Einstellungen</h1>
        <p className="mt-1.5 text-sm text-muted-foreground md:text-base">
          {istAdmin ? "Dein Konto und die Einstellungen fürs ganze Büro." : "Alles rund um dein Konto."}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-[230px_minmax(0,1fr)] md:gap-8">
        {/* Bereichsliste: am Handy eine waagerechte Leiste, am PC links */}
        <nav aria-label="Bereiche der Einstellungen" className="min-w-0 md:sticky md:top-4 md:self-start">
          <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1 scrollbar-hide md:mx-0 md:block md:space-y-5 md:overflow-visible md:px-0">
            {gruppen.map(({ g, items }) => (
              <div key={g} className="contents md:block">
                {gruppen.length > 1 && (
                  <div className="hidden px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground md:block">
                    {g}
                  </div>
                )}
                <div className="contents md:block md:space-y-0.5">
                  {items.map((b) => {
                    const an = b.id === aktiv.id;
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => waehlen(b.id)}
                        aria-current={an ? "page" : undefined}
                        className={cn(
                          "flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-full border px-3.5 py-2 text-sm font-medium transition-colors md:w-full md:rounded-md md:border-0 md:px-3",
                          an
                            ? "border-primary bg-primary text-primary-foreground"
                            : "bg-card text-foreground hover:bg-muted md:bg-transparent",
                        )}
                      >
                        <b.icon className={cn("h-4 w-4 shrink-0", an ? "" : "text-muted-foreground")} />
                        {b.titel}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </nav>

        <main className="min-w-0 space-y-5">
          <div>
            <h2 className="text-xl font-semibold">{aktiv.titel}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{aktiv.text}</p>
          </div>
          {aktiv.inhalt({ istAdmin })}
        </main>
      </div>
    </div>
  );
};
