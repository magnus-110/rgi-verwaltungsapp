// Zentrale Quelle für AGB- und Datenschutz-Texte.
// Wird in AGB.tsx, Datenschutz.tsx, LegalDocumentsSheet, TermsAcceptanceDialog
// und FirstLoginWelcomeDialog verwendet – nur HIER ändern, wenn sich die Texte ändern.
// Bei jeder inhaltlichen Änderung zusätzlich CURRENT_LEGAL_VERSION in src/lib/legal.ts hochzählen.

export const AgbText = () => (
  <div className="prose prose-sm max-w-none">
    <h2 className="text-lg font-bold mb-1">Allgemeine Geschäftsbedingungen (AGB)</h2>
    <p className="text-xs text-muted-foreground mb-4">
      für die Nutzung der RGI-Immobilien App · Stand: Juni 2026 · Version 2.0
    </p>

    <h3 className="font-semibold mt-4 mb-2">§ 1 Geltungsbereich und Anbieter</h3>
    <p className="text-sm mb-2">(1) Diese Allgemeinen Geschäftsbedingungen (nachfolgend „AGB") regeln die Nutzung der RGI-Immobilien App (nachfolgend „App"), die von der RGI-Immobilien GmbH &amp; Co. KG (nachfolgend „RGI") bereitgestellt wird.</p>
    <p className="text-sm mb-2">(2) Die App dient der Kommunikation, dem Dokumentenmanagement, der Bereitstellung von Informationen sowie der Bereitstellung optionaler, teils kostenpflichtiger Zusatzleistungen für Nutzer, die in einem direkten Verwaltungs- oder Mietverhältnis zur RGI stehen.</p>

    <h3 className="font-semibold mt-4 mb-2">§ 2 Nutzungsberechtigung und Zugang</h3>
    <p className="text-sm mb-2">(1) Die Nutzung der App ist ausschließlich auf folgende Nutzergruppen (nachfolgend „Nutzer") beschränkt: Mieter, deren Mietobjekt unmittelbar durch die RGI im Rahmen der Mietverwaltung betreut wird; Wohnungseigentümer (Sondereigentümer), deren Immobilie Teil einer durch die RGI verwalteten Wohnungseigentümergemeinschaft (WEG) ist.</p>
    <p className="text-sm mb-2">(2) Ausschluss: Mieter von Sondereigentümern innerhalb einer WEG (sog. WEG-Mieter) sind ausdrücklich nicht nutzungsberechtigt, da kein direktes Vertragsverhältnis zur RGI besteht.</p>
    <p className="text-sm mb-2">(3) Die Nutzung setzt eine Registrierung voraus. Ein Anspruch auf Freischaltung besteht nicht. Mit Beendigung des zugrunde liegenden Miet- oder Verwaltungsauftrags endet die Nutzungsberechtigung automatisch.</p>

    <h3 className="font-semibold mt-4 mb-2">§ 3 Leistungsumfang der App</h3>
    <p className="text-sm mb-2">(1) Die App bietet unter anderem: Übermittlung von Schadensmeldungen und Anfragen; Einsicht in objektbezogene Dokumente (z. B. Abrechnungen, Protokolle); Nutzung eines digitalen „Schwarzen Bretts"; Nutzung eines KI-basierten Assistenzsystems (Chatbot); kostenpflichtige Zusatzleistungen für Eigentümer („Vermieter-Services"), insbesondere die automatisierte Erstellung von Dokumenten (z. B. Nebenkostenabrechnungen, steuerliche Aufstellungen, Mietverträge) – siehe § 5 und § 6.</p>
    <p className="text-sm mb-2">(2) Die RGI ist berechtigt, den Funktionsumfang der App jederzeit zu ändern, zu erweitern oder einzuschränken, sofern dies dem Nutzer zumutbar ist.</p>

    <h3 className="font-semibold mt-4 mb-2">§ 4 KI-gestützte Funktionen</h3>
    <p className="text-sm mb-2">(1) In der App ist ein KI-Chatbot integriert, der auf der Technologie von Mistral AI basiert. Dieser dient ausschließlich als unverbindliches Assistenzsystem zur ersten Information.</p>
    <p className="text-sm mb-2">(2) Zur Unterstützung der Verwaltertätigkeit sowie für die automatisierte Erstellung und Auswertung von Dokumenten setzt die RGI die KI-Technologie von Anthropic („Claude") ein. Diese kann hierfür auch auf die Verwaltungs-Datenbank zugreifen. Die Verarbeitung erfolgt auf Grundlage eines mit Anthropic abgeschlossenen Auftragsverarbeitungsvertrags (Art. 28 DSGVO). Die übermittelten Inhalte werden nicht zum Training der KI-Modelle verwendet. Näheres regelt die Datenschutzerklärung.</p>
    <p className="text-sm mb-2">(3) Zur Sicherstellung der Servicequalität können die in der App geführten Dialoge und erzeugten Inhalte durch Mitarbeiter der RGI eingesehen und weiterverarbeitet werden.</p>

    <h3 className="font-semibold mt-4 mb-2">§ 5 Kostenpflichtige Vermieter-Services (Dokumentenerstellung)</h3>
    <p className="text-sm mb-2">(1) Eigentümern stehen optionale, kostenpflichtige Zusatzleistungen zur Verfügung, insbesondere die automatisierte Erstellung von Dokumenten wie Nebenkostenabrechnungen, steuerlichen Aufstellungen (z. B. zur Verwendung in der Anlage V) und Mietverträgen („Vermieter-Services").</p>
    <p className="text-sm mb-2">(2) Die Dokumente werden automatisiert auf Grundlage der vom Nutzer eingegebenen sowie der in der App bereits vorhandenen Daten erstellt. Der Nutzer ist für die Richtigkeit und Vollständigkeit der von ihm eingegebenen Angaben selbst verantwortlich.</p>
    <p className="text-sm mb-2">(3) Die Vermieter-Services stellen keine Rechts-, Steuer- oder Mietberatung dar. Die erzeugten Dokumente sind automatisiert erstellte Entwürfe bzw. Vorlagen. Eine Prüfung im Einzelfall durch eine fachkundige Person wird empfohlen. Verwendete Vorlagen werden mit Sorgfalt gepflegt; eine Gewähr für die rechtliche Wirksamkeit im konkreten Einzelfall wird nicht übernommen.</p>
    <p className="text-sm mb-2">(4) Ein Vertrag über eine kostenpflichtige Leistung kommt erst mit der ausdrücklichen Bestätigung des kostenpflichtigen Auftrags durch den Nutzer („zahlungspflichtig bestellen") zustande.</p>

    <h3 className="font-semibold mt-4 mb-2">§ 6 Preise, Zahlungsabwicklung und Widerruf</h3>
    <p className="text-sm mb-2">(1) Die Preise werden dem Nutzer vor Abschluss des kostenpflichtigen Auftrags klar angezeigt. Alle Preise verstehen sich inklusive der gesetzlichen Umsatzsteuer.</p>
    <p className="text-sm mb-2">(2) Die Zahlungsabwicklung erfolgt über den Zahlungsdienstleister Stripe (Stripe Payments Europe, Limited). Die erforderlichen Zahlungsdaten werden direkt an Stripe übermittelt und dort verarbeitet; ergänzend gelten die Bedingungen von Stripe.</p>
    <p className="text-sm mb-2">(3) Das fertige Dokument wird nach erfolgreichem Zahlungseingang zum Download bereitgestellt.</p>
    <p className="text-sm mb-2">(4) Widerrufsrecht bei digitalen Inhalten: Handelt der Nutzer als Verbraucher, steht ihm grundsätzlich ein gesetzliches Widerrufsrecht zu. Der Nutzer stimmt jedoch ausdrücklich zu, dass mit der Ausführung der Leistung bereits vor Ablauf der Widerrufsfrist begonnen wird, und bestätigt, dass er mit der vollständigen Vertragserfüllung sein Widerrufsrecht verliert (§ 356 Abs. 5 BGB). Bei gewerblicher oder selbständiger beruflicher Nutzung besteht kein Widerrufsrecht.</p>

    <h3 className="font-semibold mt-4 mb-2">§ 7 Digitales Schwarzes Brett</h3>
    <p className="text-sm mb-2">(1) Bereitgestellte Informationen werden nach bestem Wissen gepflegt.</p>
    <p className="text-sm mb-2">(2) Die RGI übernimmt keine Gewähr für die ständige Aktualität, insbesondere bei Angaben Dritter. Nutzer prüfen kritische Termine im Zweifel gegen.</p>

    <h3 className="font-semibold mt-4 mb-2">§ 8 Haftungsbeschränkung</h3>
    <p className="text-sm mb-2">(1) Die RGI haftet unbeschränkt bei Vorsatz oder grober Fahrlässigkeit, bei der Verletzung von Leben, Körper oder Gesundheit sowie nach dem Produkthaftungsgesetz.</p>
    <p className="text-sm mb-2">(2) Bei leicht fahrlässiger Verletzung einer Kardinalpflicht ist die Haftung auf den vorhersehbaren, vertragstypischen Schaden begrenzt.</p>
    <p className="text-sm mb-2">(3) Im Übrigen ist eine Haftung der RGI – insbesondere für technische Störungen der App sowie für fehlerhafte, automatisiert (KI-gestützt) erzeugte Inhalte und Dokumente – ausgeschlossen. Die Verantwortung für die inhaltliche Richtigkeit der vom Nutzer eingegebenen Daten verbleibt beim Nutzer (§ 5 Abs. 2).</p>

    <h3 className="font-semibold mt-4 mb-2">§ 9 Pflichten der Nutzer</h3>
    <p className="text-sm mb-2">(1) Der Nutzer hält seine Zugangsdaten geheim und schützt sie vor Zugriff Dritter.</p>
    <p className="text-sm mb-2">(2) Es ist untersagt, beleidigende, rechtswidrige oder schädigende Inhalte zu verbreiten oder technische Manipulationen vorzunehmen.</p>

    <h3 className="font-semibold mt-4 mb-2">§ 10 Datenschutz und Technik</h3>
    <p className="text-sm mb-2">(1) Die Verarbeitung personenbezogener Daten erfolgt gemäß der Datenschutzerklärung der RGI.</p>
    <p className="text-sm mb-2">(2) Die technische Bereitstellung (Backend) erfolgt über Supabase auf Servern innerhalb der EU (Frankfurt am Main); verschlüsselte Übertragung (TLS).</p>
    <p className="text-sm mb-2">(3) Für KI-gestützte Funktionen (Anthropic/Claude), für die Dokumentenkonvertierung (CloudConvert) und für die Zahlungsabwicklung (Stripe) werden ausgewählte Daten an die jeweiligen Dienstleister übermittelt. Mit diesen bestehen Auftragsverarbeitungsverträge gemäß Art. 28 DSGVO.</p>

    <h3 className="font-semibold mt-4 mb-2">§ 11 Schlussbestimmungen</h3>
    <p className="text-sm mb-2">(1) Es gilt das Recht der Bundesrepublik Deutschland.</p>
    <p className="text-sm mb-2">(2) Sollten einzelne Bestimmungen unwirksam sein, bleibt die Wirksamkeit der übrigen unberührt.</p>
    <p className="text-sm mb-2">(3) Die RGI kann diese AGB mit angemessener Ankündigungsfrist ändern; die Änderung gilt als angenommen, wenn der Nutzer nicht innerhalb von sechs Wochen widerspricht.</p>
  </div>
);

export const DatenschutzText = () => (
  <div className="prose prose-sm max-w-none">
    <h2 className="text-lg font-bold mb-1">Datenschutzerklärung</h2>
    <p className="text-xs text-muted-foreground mb-4">Stand: Juni 2026 · Version 2.0</p>

    <h3 className="font-semibold mt-4 mb-2">1. Verantwortlicher</h3>
    <p className="text-sm mb-2">RGI-Immobilien GmbH &amp; Co. KG, Andreas Göttinger, Schützenstraße 16, 87459 Pfronten. E-Mail: info@rgi-immobilien.de · Internet: https://rgi-immobilien.de</p>

    <h3 className="font-semibold mt-4 mb-2">2. Rechte der Betroffenen</h3>
    <p className="text-sm mb-2">Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung (Art. 18), Datenübertragbarkeit (Art. 20), Widerspruch (Art. 21) sowie Beschwerderecht bei einer Aufsichtsbehörde (Art. 77 DSGVO).</p>

    <h3 className="font-semibold mt-4 mb-2">3. Datenerhebung in der App und Nutzergruppen</h3>
    <p className="text-sm mb-2">Wir erheben Bestandsdaten (Name), Kontaktdaten (E-Mail) und Objektdaten (zugeordnete Immobilie). Zugriffsberechtigt sind ausschließlich Mieter in direkter Mietverwaltung sowie Eigentümer in der WEG-Verwaltung der RGI. WEG-Mieter ohne direktes Verhältnis zur RGI haben keinen Zugriff. Zweck: Verwaltung der Verhältnisse und Bearbeitung von Schadensmeldungen. Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO.</p>

    <h3 className="font-semibold mt-4 mb-2">4. KI-Chatbot (Mistral AI API)</h3>
    <p className="text-sm mb-2">Eingaben im Chat werden an die API von Mistral AI (Mistral AI SAS, Paris, Frankreich) übertragen. Chatverläufe können von RGI-Mitarbeitern zur Qualitätssicherung eingesehen werden. Bitte keine sensiblen Daten eingeben. Antworten sind unverbindlich. Speicherdauer: 6 Monate, sofern nicht zur Falldokumentation in die Objektakte übernommen. Rechtsgrundlage: Art. 6 Abs. 1 lit. b und f DSGVO.</p>

    <h3 className="font-semibold mt-4 mb-2">5. Einsatz der KI von Anthropic („Claude") in der Verwaltung</h3>
    <p className="text-sm mb-2">Wir setzen die KI-Technologie von Anthropic („Claude", Anthropic PBC, San Francisco, USA) als Werkzeug für die allgemeine Verwaltertätigkeit ein – u. a. zur Bearbeitung von Vorgängen, zur Auswertung und Erstellung von Dokumenten (z. B. Abrechnungen, Schreiben, Mietverträge) und zum Auslesen hochgeladener Unterlagen. Datenbankzugriff: Claude kann hierfür auf Daten unserer Verwaltungs-Datenbank zugreifen; dabei können personenbezogene Daten von Eigentümern, Mietern und Kontakten (Stamm-, Objekt-, Vertrags- und Kostendaten) verarbeitet werden, soweit erforderlich. Auftragsverarbeitung &amp; Transfer: Mit Anthropic besteht ein Auftragsverarbeitungsvertrag (Art. 28 DSGVO); für die Verarbeitung in den USA sind EU-Standardvertragsklauseln vereinbart. Die Inhalte werden nicht zum Training der Modelle verwendet. Automatisiert erzeugte Ergebnisse sind unverbindlich und ersetzen keine Beratung. Rechtsgrundlage: Art. 6 Abs. 1 lit. b und f DSGVO.</p>

    <h3 className="font-semibold mt-4 mb-2">6. Kostenpflichtige Vermieter-Services und Zahlungsabwicklung (Stripe)</h3>
    <p className="text-sm mb-2">Für die kostenpflichtige Dokumentenerstellung verarbeiten wir die von Ihnen eingegebenen sowie die vorhandenen objekt-, kosten- und mieterbezogenen Daten (Art. 6 Abs. 1 lit. b DSGVO). Für die Bezahlung nutzen wir Stripe (Stripe Payments Europe, Limited, Dublin, Irland; ggf. Stripe, Inc., USA). Erforderliche Zahlungsdaten (Name, E-Mail, Betrag, Zahlungsmittel-/Kartendaten) werden direkt an Stripe übermittelt; vollständige Kartendaten erhält die RGI nicht. Mit Stripe bestehen ein Auftragsverarbeitungsvertrag (Art. 28 DSGVO) und EU-Standardvertragsklauseln. Rechtsgrundlage: Art. 6 Abs. 1 lit. b und c DSGVO.</p>

    <h3 className="font-semibold mt-4 mb-2">7. Digitales Schwarzes Brett</h3>
    <p className="text-sm mb-2">Allgemeine Informationen ohne Gewähr für Vollständigkeit und Aktualität.</p>

    <h3 className="font-semibold mt-4 mb-2">8. Hosting, Backend und Dokumentenkonvertierung</h3>
    <p className="text-sm mb-2">Webhosting: Strato AG, Berlin (Deutschland). App-Backend: Supabase, Serverstandort Frankfurt am Main; für die Übermittlung an den US-Anbieter SCC; AVV nach Art. 28 DSGVO liegt vor. Dokumentenkonvertierung (z. B. Word ↔ PDF): CloudConvert (Lunaweb GmbH, München, Deutschland), Verarbeitung auf Servern in der EU/Deutschland, AVV nach Art. 28 DSGVO; Dateien werden nach der Konvertierung automatisch gelöscht. Rechtsgrundlage: Art. 6 Abs. 1 lit. b und f DSGVO.</p>

    <h3 className="font-semibold mt-4 mb-2">9. Server-Logfiles</h3>
    <p className="text-sm mb-2">Automatische Speicherung technischer Informationen (IP anonymisiert, Datum/Uhrzeit, Betriebssystem) zur Systemsicherheit (Art. 6 Abs. 1 lit. f DSGVO).</p>

    <h3 className="font-semibold mt-4 mb-2">10. Speicherdauer und Löschfristen</h3>
    <p className="text-sm mb-2">Allgemeine Chat-Daten: 6 Monate. Maklerrelevante Unterlagen: 5 Jahre (§ 14 MaBV). Steuerlich relevante Unterlagen sowie Rechnungs- und Zahlungsdaten zu kostenpflichtigen Leistungen: 10 Jahre (§ 147 AO).</p>

    <h3 className="font-semibold mt-4 mb-2">11. Google Maps und Google Fonts</h3>
    <p className="text-sm mb-2">Google Ireland Limited; Rechtsgrundlage Art. 6 Abs. 1 lit. f DSGVO. Einsatz eines Consent-Banners (Art. 6 Abs. 1 lit. a DSGVO) empfohlen.</p>

    <h3 className="font-semibold mt-4 mb-2">12. Datensicherheit</h3>
    <p className="text-sm mb-2">TLS-Verschlüsselung (SSL) sowie technische und organisatorische Maßnahmen (TOM) gegen unbefugten Zugriff.</p>
  </div>
);
