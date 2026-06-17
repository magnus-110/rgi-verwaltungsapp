/**
 * Tour-Definitionen für den Eigentümer-Bereich.
 * Selektoren beziehen sich auf `data-tour="..."`-Attribute, die in den
 * jeweiligen Seiten/Components gesetzt sind. Tritt ein Selektor nicht auf
 * (z. B. wenn ein Bereich nicht sichtbar ist), wird der Schritt automatisch
 * übersprungen.
 */
export interface TourStep {
  /** CSS-Selektor des hervorzuhebenden Elements. Weglassen = zentriertes Modal. */
  element?: string;
  title: string;
  description: string;
  /** Optionaler Pfad zu einem Erklärclip (Lottie/MP4) – zukünftig. */
  mediaUrl?: string;
}

export interface TourDefinition {
  id: string;
  title: string;
  steps: TourStep[];
}

export const GLOBAL_TOUR: TourDefinition = {
  id: "global",
  title: "Willkommen",
  steps: [
    {
      title: "Herzlich willkommen!",
      description:
        "Schön, dass Sie da sind. In den nächsten 60 Sekunden zeige ich Ihnen, wie Sie sich in Ihrem Eigentümer-Portal zurechtfinden. Sie können diese Einführung jederzeit über den Hilfe-Button unten links neu starten.",
    },
    {
      element: '[data-tour="logo"]',
      title: "Zur Startseite",
      description:
        "Ein Klick auf das Logo bringt Sie immer zurück zur Übersicht – egal, wo Sie sich gerade befinden.",
    },
    {
      element: '[data-tour="menu-button"]',
      title: "Das Menü",
      description:
        "Über diesen Knopf öffnen Sie das Menü. Dort finden Sie alle Bereiche: Meldungen, Dokumente, Beschlüsse, Schwarzes Brett, Versammlungen und den Chat.",
    },
    {
      element: '[data-tour="help-button"]',
      title: "Hilfe – jederzeit",
      description:
        "Wenn Sie unsicher sind, klicken Sie auf diesen Hilfe-Knopf. Hier können Sie die Einführung für jede Seite erneut starten.",
    },
  ],
};

export const DASHBOARD_TOUR: TourDefinition = {
  id: "dashboard",
  title: "Dashboard",
  steps: [
    {
      title: "Herzlich willkommen!",
      description:
        "Schön, dass Sie da sind. In den nächsten Schritten zeigen wir Ihnen, wie Sie sich in Ihrem Eigentümer-Portal zurechtfinden. Sie können diese Einführung jederzeit über den Hilfe-Knopf neu starten.",
    },
    {
      title: "App auf den Startbildschirm",
      description:
        `<div style="display:flex;flex-direction:column;gap:0.65rem;">
          <div>Damit sich unser Portal wie eine echte App anfühlt, können Sie es zu Ihrem Startbildschirm hinzufügen – ein Tipp aufs Symbol genügt dann zum Öffnen.</div>
          <div style="display:flex;align-items:center;gap:0.6rem;padding:0.55rem 0.7rem;border:1px solid hsl(var(--border));border-radius:10px;background:hsl(var(--muted)/0.35);">
            <span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:6px;background:hsl(var(--primary)/0.12);flex-shrink:0;animation:rgi-dots-pulse 1.8s ease-in-out infinite;">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--primary))" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
            </span>
            <div style="font-size:0.82rem;line-height:1.4;"><b>Android:</b> Oben rechts auf die <b>drei Punkte</b> tippen → <b>„Zum Startbildschirm hinzufügen"</b>.</div>
          </div>
          <div style="display:flex;align-items:center;gap:0.6rem;padding:0.55rem 0.7rem;border:1px solid hsl(var(--border));border-radius:10px;background:hsl(var(--muted)/0.35);">
            <span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:6px;background:hsl(var(--primary)/0.12);flex-shrink:0;animation:rgi-share-bounce 1.6s ease-in-out infinite;">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--primary))" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/></svg>
            </span>
            <div style="font-size:0.82rem;line-height:1.4;"><b>iPhone:</b> Unten auf das <b>Teilen-Symbol</b> tippen → <b>„Zum Home-Bildschirm"</b>.</div>
          </div>
          <style>
            @keyframes rgi-share-bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
            @keyframes rgi-dots-pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.12);opacity:0.75}}
          </style>
        </div>`,
    },
    {
      element: '[data-tour="logo"]',
      title: "Zur Startseite",
      description:
        "Ein Klick auf das Logo bringt Sie immer zurück zur Übersicht – egal, wo Sie sich gerade befinden.",
    },
    {
      element: '[data-tour="menu-button"]',
      title: "Das Menü",
      description:
        "Über diesen Knopf öffnen Sie das Menü. Dort finden Sie alle Bereiche: Meldungen, Dokumente, Beschlüsse, Schwarzes Brett, Versammlungen und den Chat.",
    },
    {
      element: '[data-tour="dashboard-tiles"]',
      title: "Offene Vorgänge",
      description:
        "Diese Kacheln zeigen Ihnen, welche Vorgänge bei Ihrer Hausverwaltung gerade offen sind – etwa noch nicht bearbeitete Meldungen oder Beschlüsse.",
    },
    {
      element: '[data-tour="dashboard-cycle"]',
      title: "Der Verwaltungs-Kreislauf",
      description:
        "Der jährliche Verwaltungskreislauf zeigt Ihnen, wo Ihre Hausverwaltung gerade steht: Beschlüsse umsetzen, Heizkostenabrechnung einreichen, Abrechnung erstellen, Kassenprüfung bereitstellen und Eigentümerversammlung durchführen.",
    },
    {
      element: '[data-tour="dashboard-quick"]',
      title: "Schnellzugriff",
      description:
        "Von hier springen Sie direkt zu Dokumenten, KI-Chat, Schwarzem Brett und Versammlungen. Eine kleine farbige Zahl signalisiert: hier gibt es etwas Neues.",
    },
    {
      element: '[data-tour="dashboard-contact"]',
      title: "Kontakt zur Hausverwaltung",
      description:
        "Hier finden Sie jederzeit die Kontaktdaten Ihrer Hausverwaltung – Telefon, E-Mail und Adresse, mit einem Klick erreichbar.",
    },
    {
      element: '[data-tour="dashboard-emergency"]',
      title: "Notfallkontakte",
      description:
        "Hier hat Ihre Hausverwaltung zuständige Handwerker für Ihre Wohnanlage hinterlegt, die Sie im Notfall kontaktieren können, wenn die Hausverwaltung selbst nicht erreichbar ist.",
    },
    {
      element: '[data-tour="help-button"]',
      title: "Hilfe – jederzeit",
      description:
        "Sind Sie einmal unsicher, klicken Sie auf diesen Hilfe-Knopf. Hier können Sie die Erklärung für die aktuelle Seite erneut starten.",
    },
  ],
};

export const REPORTS_TOUR: TourDefinition = {
  id: "reports",
  title: "Meine Meldungen",
  steps: [
    {
      title: "Etwas mitteilen",
      description:
        "Hier können Sie der Verwaltung Schäden, Anliegen oder Fragen melden. Wir bearbeiten jede Meldung und Sie sehen jederzeit den aktuellen Stand.",
    },
    {
      element: '[data-tour="reports-new"]',
      title: "Neue Meldung",
      description:
        "Über diesen Knopf erstellen Sie eine neue Meldung. Beschreiben Sie kurz, worum es geht – Fotos können Sie direkt anhängen.",
    },
    {
      element: '[data-tour="reports-list"]',
      title: "Ihre Meldungen",
      description:
        "Hier sehen Sie alle Ihre bisherigen Meldungen. Farbige Punkte zeigen den Status: orange = offen, blau = in Bearbeitung, grün = erledigt.",
    },
  ],
};

export const FILES_TOUR: TourDefinition = {
  id: "files",
  title: "Dokumente",
  steps: [
    {
      title: "Ihr Dokumenten-Ordner",
      description:
        "Alle Unterlagen, die Sie als Eigentümer betreffen, liegen hier: Abrechnungen, Wirtschaftspläne, Protokolle, Verträge.",
    },
    {
      element: '[data-tour="files-tree"]',
      title: "So navigieren Sie",
      description:
        "Klicken Sie auf einen Ordner, um ihn zu öffnen. Ein Klick auf ein Dokument zeigt die Vorschau. Über den Download-Knopf speichern Sie es auf Ihrem Gerät.",
    },
  ],
};

export const RESOLUTIONS_TOUR: TourDefinition = {
  id: "resolutions",
  title: "Beschlüsse",
  steps: [
    {
      title: "Die Beschluss-Sammlung",
      description:
        "Hier finden Sie alle gefassten Beschlüsse Ihrer Gemeinschaft – jederzeit nachlesbar.",
    },
    {
      element: '[data-tour="resolutions-list"]',
      title: "Grün und Rot",
      description:
        "Ein grüner Punkt bedeutet: angenommen. Ein roter Punkt bedeutet: abgelehnt. Klicken Sie einen Beschluss an, um den genauen Wortlaut zu lesen.",
    },
  ],
};

export const FORUM_TOUR: TourDefinition = {
  id: "forum",
  title: "Schwarzes Brett",
  steps: [
    {
      title: "Das Schwarze Brett",
      description:
        "Hier veröffentlicht Ihre Hausverwaltung wichtige Informationen, Aushänge und Mitteilungen rund um Ihre Liegenschaft.",
    },
    {
      element: '[data-tour="forum-list"]',
      title: "Aktuelle Aushänge",
      description:
        "Neue Beiträge stehen ganz oben. Tippen Sie einen Eintrag an, um den vollständigen Text und mögliche Anhänge zu sehen.",
    },
  ],
};

export const MEETINGS_TOUR: TourDefinition = {
  id: "meetings",
  title: "Versammlungen",
  steps: [
    {
      title: "Ihre Eigentümerversammlungen",
      description:
        "Hier sehen Sie alle vergangenen und kommenden Eigentümerversammlungen Ihrer WEG.",
    },
    {
      element: '[data-tour="meetings-submit-top"]',
      title: "Anträge einreichen",
      description:
        "Vor einer Versammlung können Sie hier eigene Tagesordnungspunkte oder Anträge einreichen. Ihre Hausverwaltung prüft diese und nimmt sie gegebenenfalls in die Tagesordnung auf.",
    },
    {
      element: '[data-tour="meetings-list"]',
      title: "Die Versammlungs-Liste",
      description:
        "Klicken Sie auf einen Eintrag, um die Einladung und die Tagesordnung zu öffnen.",
    },
    {
      title: "Vollmacht erteilen",
      description:
        "Können Sie nicht teilnehmen? In der Versammlungs-Ansicht finden Sie den Knopf 'Vollmacht erteilen'. Sie können eine andere Person bevollmächtigen oder uns als Verwaltung mit konkreten Anweisungen beauftragen.",
    },
  ],
};

export const CHATBOT_TOUR: TourDefinition = {
  id: "chatbot",
  title: "Chat",
  steps: [
    {
      title: "Ihr persönlicher Assistent",
      description:
        "Stellen Sie hier jederzeit Fragen rund um Ihre Liegenschaft, die Verwaltung oder Ihre Abrechnung. Sie bekommen sofort eine Antwort – rund um die Uhr.",
    },
    {
      element: '[data-tour="chatbot-input"]',
      title: "So fragen Sie",
      description:
        "Tippen Sie Ihre Frage einfach in das Textfeld – ganz so, als würden Sie jemandem schreiben.",
    },
  ],
};

export const SETTINGS_TOUR: TourDefinition = {
  id: "settings",
  title: "Einstellungen",
  steps: [
    {
      title: "Ihre Einstellungen",
      description:
        "Hier verwalten Sie Ihre Stammdaten, Ihre Wohnungen und alles rund um Ihre Anmeldung.",
    },
    {
      element: '[data-tour="settings-units"]',
      title: "Meine Wohnungen",
      description:
        "Klicken Sie auf eine Wohnung, um je Gebäude individuelle Informationen (z. B. Anrede, Adresse, Kontaktdaten) zu hinterlegen und Ihre Bankverbindung für diese Einheit zu ändern.",
    },
    {
      element: '[data-tour="settings-login-email"]',
      title: "Login-E-Mail",
      description:
        'Mit dieser E-Mail-Adresse melden Sie sich an und nutzen die Funktion „Passwort vergessen". Eine Änderung wird per Bestätigungslink an die neue Adresse abgesichert.',
    },
    {
      element: '[data-tour="settings-password"]',
      title: "Passwort",
      description:
        "Ändern Sie hier jederzeit Ihr Anmeldepasswort. Wir empfehlen mindestens 8 Zeichen mit Zahlen und Sonderzeichen.",
    },
    {
      element: '[data-tour="settings-passkeys"]',
      title: "Passkeys",
      description:
        "Passkeys ermöglichen die passwortlose Anmeldung per Fingerabdruck, Face ID oder Sicherheitsschlüssel – schneller und sicherer als ein Passwort.",
    },
  ],
};

export const CASH_AUDIT_TOUR: TourDefinition = {
  id: "cash-audit",
  title: "Kassenprüfung",
  steps: [
    {
      title: "Ihre Kassenprüfung",
      description:
        "Sie wurden als Kassenprüfer/in beauftragt. In diesem Bereich finden Sie alle Unterlagen, die Sie zur Prüfung benötigen, und am Ende können Sie das Ergebnis digital unterschreiben.",
    },
  ],
};

/**
 * Reihenfolge analog zur Sidebar-Navigation im WegOwnerLayout.
 * Kassenprüfung ist absichtlich NICHT im Hauptmenü gelistet, bleibt aber
 * über TOURS_BY_ID erreichbar (für Auto-Start auf der Kassenprüfungsseite).
 */
export const ALL_TOURS: TourDefinition[] = [
  DASHBOARD_TOUR,
  REPORTS_TOUR,
  FILES_TOUR,
  RESOLUTIONS_TOUR,
  FORUM_TOUR,
  MEETINGS_TOUR,
  CHATBOT_TOUR,
  SETTINGS_TOUR,
];

export const TOURS_BY_ID: Record<string, TourDefinition> = Object.fromEntries(
  [...ALL_TOURS, CASH_AUDIT_TOUR, { ...DASHBOARD_TOUR, id: "global" }].map((t) => [t.id, t])
);
