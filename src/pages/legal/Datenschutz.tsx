import { CURRENT_LEGAL_VERSION } from "@/lib/legal";

export default function DatenschutzPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10 prose prose-sm prose-neutral">
      <h1 style={{ fontFamily: "Century Gothic, sans-serif" }}>
        Datenschutzerklärung
      </h1>
      <p className="text-muted-foreground text-sm">
        Stand / Version: {CURRENT_LEGAL_VERSION}
      </p>

      <h2>1. Verantwortlicher</h2>
      <p>
        RGI-Immobilien GmbH, info@rgi-immobilien.de, Tel.&nbsp;08363&nbsp;960656.
      </p>

      <h2>2. Verarbeitete Daten</h2>
      <ul>
        <li>Stammdaten (Name, E-Mail, Wohnung, Zugehörigkeit)</li>
        <li>Vom Eigentümer eingegebene Mieter- und Kostendaten</li>
        <li>WEG-Abrechnungspositionen (umlagefähige Anteile der eigenen Wohnung)</li>
        <li>Bestellhistorie und Zahlungsstatus (über Stripe)</li>
        <li>Technische Metadaten (IP, User-Agent) zur Beweissicherung der Zustimmung</li>
      </ul>

      <h2>3. Zwecke der Verarbeitung</h2>
      <p>
        Erstellung und Lieferung der bestellten Dokumente (Art.&nbsp;6
        Abs.&nbsp;1&nbsp;lit.&nbsp;b DSGVO), Erfüllung steuerlicher
        Aufbewahrungspflichten (Art.&nbsp;6 Abs.&nbsp;1&nbsp;lit.&nbsp;c DSGVO),
        sowie das berechtigte Interesse an Betriebssicherheit und Missbrauchsschutz
        (Art.&nbsp;6 Abs.&nbsp;1&nbsp;lit.&nbsp;f DSGVO).
      </p>

      <h2>4. Empfänger / Auftragsverarbeiter</h2>
      <ul>
        <li>
          <strong>Supabase</strong> (Datenbank, Speicher, Auth) – Auftragsverarbeitung gemäß AVV.
        </li>
        <li>
          <strong>Stripe</strong> (Zahlung &amp; Rechnungserstellung) – eigenständig
          Verantwortlicher für die Zahlungsabwicklung.
        </li>
        <li>
          <strong>CloudConvert</strong> (Lunaweb GmbH, DOCX→PDF) – Auftragsverarbeitung
          gemäß AVV.
        </li>
      </ul>

      <h2>5. Speicherdauer</h2>
      <p>
        Bestellungen und Zustimmungen: 10&nbsp;Jahre (§&nbsp;147 AO). Eingaben in
        den Tools werden bis zur Löschung durch den Nutzer aufbewahrt.
      </p>

      <h2>6. Ihre Rechte</h2>
      <p>
        Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung,
        Datenübertragbarkeit und Widerspruch sowie das Recht auf Beschwerde bei
        der zuständigen Aufsichtsbehörde.
      </p>

      <h2>7. Datensicherheit</h2>
      <p>
        TLS-Verschlüsselung, Zugriffskontrollen und sonstige technische und
        organisatorische Maßnahmen (TOM) schützen die Daten vor unbefugtem
        Zugriff.
      </p>

      <p className="text-xs text-muted-foreground mt-8">
        Diese Datenschutzerklärung ist ein Entwurf und sollte vor dem produktiven
        Einsatz datenschutzrechtlich geprüft werden.
      </p>
    </div>
  );
}
