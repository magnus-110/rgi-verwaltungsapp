import { CURRENT_LEGAL_VERSION } from "@/lib/legal";

export default function AGBPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10 prose prose-sm prose-neutral">
      <h1 style={{ fontFamily: "Century Gothic, sans-serif" }}>
        Allgemeine Geschäftsbedingungen (AGB)
      </h1>
      <p className="text-muted-foreground text-sm">
        Stand / Version: {CURRENT_LEGAL_VERSION}
      </p>

      <h2>1. Geltungsbereich</h2>
      <p>
        Diese AGB gelten für alle entgeltlichen Dienstleistungen, die die
        RGI-Immobilien GmbH (nachfolgend „RGI") über den Service-Hub innerhalb der
        Eigentümer-App anbietet.
      </p>

      <h2>2. Vertragsgegenstand</h2>
      <p>
        RGI erstellt auf Grundlage der vom Nutzer eingegebenen Daten und der in der
        App vorliegenden WEG-Abrechnungsdaten ein digitales Dokument
        (z.&nbsp;B. Nebenkostenabrechnung für Mieter, Anlage&nbsp;V, Mietvertrag) und
        stellt es als PDF zum Download bereit.
      </p>

      <h2>3. Preise &amp; Zahlung</h2>
      <p>
        Die jeweils aktuellen Preise werden vor dem Kauf transparent angezeigt
        (inkl. 19&nbsp;% USt.). Die Zahlung erfolgt über unseren Zahlungsdienstleister
        Stripe; die Rechnung wird automatisch durch Stripe erstellt und dem Nutzer
        per E-Mail zugestellt.
      </p>

      <h2>4. Widerrufsrecht &amp; Widerrufsverzicht</h2>
      <p>
        Verbrauchern steht grundsätzlich ein gesetzliches Widerrufsrecht gemäß
        §&nbsp;355 BGB zu. Da die Dokumente unmittelbar nach Zahlungseingang
        generiert werden, erlischt das Widerrufsrecht gemäß §&nbsp;356 Abs.&nbsp;5
        BGB, sobald RGI mit der Ausführung der Dienstleistung begonnen hat — sofern
        der Nutzer dem ausdrücklich zugestimmt und seine Kenntnis vom Erlöschen
        bestätigt hat (eigene Checkbox im Kauf-Dialog).
      </p>

      <h2>5. Haftung &amp; Haftungsausschluss</h2>
      <p>
        Die erzeugten Dokumente sind <strong>Entwürfe</strong>. Der Nutzer ist
        verpflichtet, sie vor Verwendung gegenüber Dritten (Mietern, Finanzamt)
        eigenverantwortlich auf Vollständigkeit und Richtigkeit zu prüfen. RGI
        übernimmt keine Gewähr für die rechtliche Verwendbarkeit, insbesondere
        keine steuer- oder mietrechtliche Beratung.
      </p>

      <h2>6. Datenverwendung</h2>
      <p>
        Es werden ausschließlich Daten verwendet, die der Nutzer selbst eingibt
        bzw. zu denen er als Eigentümer berechtigten Zugriff hat. Details siehe
        Datenschutzerklärung.
      </p>

      <h2>7. Aufbewahrung</h2>
      <p>
        Bestellungen und Zustimmungen werden aus steuer- und handelsrechtlichen
        Gründen 10 Jahre gespeichert (§&nbsp;147 AO).
      </p>

      <h2>8. Anbieter</h2>
      <p>
        RGI-Immobilien GmbH<br />
        info@rgi-immobilien.de<br />
        Tel.: 08363&nbsp;960656
      </p>

      <p className="text-xs text-muted-foreground mt-8">
        Diese AGB sind ein Entwurf und sollten vor dem produktiven Einsatz
        anwaltlich geprüft werden.
      </p>
    </div>
  );
}
