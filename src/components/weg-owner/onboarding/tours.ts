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
      title: "Ihre Übersicht",
      description:
        "Das ist Ihre persönliche Startseite. Hier sehen Sie auf einen Blick, was neu ist und worum Sie sich gegebenenfalls kümmern sollten.",
    },
    {
      element: '[data-tour="dashboard-cycle"]',
      title: "Der Verwaltungs-Kreislauf",
      description:
        "Dieser Bereich zeigt Ihnen den jährlichen Ablauf: Wirtschaftsplan, Versammlung, Abrechnung. So wissen Sie immer, was als nächstes ansteht.",
    },
    {
      element: '[data-tour="dashboard-tiles"]',
      title: "Schnellzugriff",
      description:
        "Die Kacheln führen Sie direkt zu Ihren Versammlungen, Beschlüssen, Meldungen und Dokumenten. Eine kleine farbige Zahl bedeutet: hier gibt es etwas Neues.",
    },
    {
      element: '[data-tour="dashboard-contact"]',
      title: "Im Notfall",
      description:
        "Unten finden Sie immer die Kontaktdaten Ihrer Hausverwaltung. Telefon, E-Mail und Adresse – mit einem Klick erreichbar.",
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
      element: '[data-tour="meetings-list"]',
      title: "Die Versammlungs-Liste",
      description:
        "Klicken Sie auf einen Eintrag, um die Einladung, die Tagesordnung und – nach der Versammlung – das Protokoll zu öffnen.",
    },
    {
      title: "Vollmacht erteilen",
      description:
        "Können Sie nicht teilnehmen? In der Versammlungs-Ansicht finden Sie den Knopf 'Vollmacht erteilen'. Sie können eine andere Person bevollmächtigen oder uns als Verwaltung mit konkreten Anweisungen beauftragen.",
    },
    {
      title: "Live-Abstimmung",
      description:
        "Während der Versammlung können Sie hier in Echtzeit zu jedem Tagesordnungspunkt abstimmen – auch von zuhause aus.",
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
        "Tippen Sie Ihre Frage einfach in das Textfeld – ganz so, als würden Sie jemandem schreiben. Beispiel: 'Wann ist die nächste Versammlung?' oder 'Wo finde ich meine Abrechnung 2024?'",
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
        "Hier ändern Sie Ihr Passwort, verwalten Benachrichtigungen und sehen, welche Daten zu Ihrem Konto gespeichert sind.",
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
  GLOBAL_TOUR,
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
  [...ALL_TOURS, CASH_AUDIT_TOUR].map((t) => [t.id, t])
);
