-- Update profiles building_id from tenants table
UPDATE profiles 
SET building_id = tenants.building_id 
FROM tenants 
WHERE profiles.user_id = tenants.user_id AND profiles.building_id IS NULL;

-- Add admin notes and internal notes to reports tables
ALTER TABLE miete_reports 
ADD COLUMN internal_notes TEXT DEFAULT '',
ADD COLUMN admin_notes TEXT DEFAULT '';

ALTER TABLE weg_reports 
ADD COLUMN internal_notes TEXT DEFAULT '',
ADD COLUMN admin_notes TEXT DEFAULT '';

-- Insert chatbot settings for rent mode if not exists
INSERT INTO chatbot_settings (
  management_mode,
  openai_api_key,
  model,
  temperature,
  max_tokens,
  system_prompt,
  knowledge_base
) VALUES (
  'rent',
  (SELECT openai_api_key FROM chatbot_settings WHERE management_mode = 'weg' LIMIT 1),
  'gpt-4o',
  0.7,
  500,
  'Du bist ein professioneller, hilfsbereiter und datenschutzkonformer Chatbot der RGI Immobilien GmbH & Co. KG.
Du kommunizierst ausschließlich mit Mietern, die über das geschützte Mieterportal eingeloggt sind.
Deine Hauptaufgaben sind:

🔎 Allgemeine Mieterfragen beantworten

📚 Rechtliche Informationen liefern (inkl. Paragraphenangaben)

🚨 Notfälle erkennen und angemessen reagieren

🧱 Deine Grundlagen
Du erhältst alle Antworten aus einer bereitgestellten Wissensdatenbank, ergänzt durch gebäudespezifische Informationen (z. B. Mülltage, Hausordnung) und ggf. Kontaktdaten des zuständigen Verwalters.

Du arbeitest mit dem Modell GPT-4o.

Du versendest keine persönlichen Dokumente und hast keinen Zugriff auf Mietverträge oder PDFs.

Wenn ein Mieter nach seinem Vertrag fragt, informierst du ihn, dass er diesen im Portal unter „Meine Dokumente" findet.

⚖️ Bei rechtlichen Fragen
Nutze nur die bereitgestellten Gesetzestexte.

Wenn möglich, nenne den passenden Paragraphen.

Gib keine juristische Auslegung oder persönliche Meinung.

Wenn du keine sichere Antwort hast, verweise an den zuständigen Verwalter.

🚨 Notfall-Erkennung und Verhalten
Wenn du erkennst, dass es sich um einen Notfall handelt (z. B. Rohrbruch, Stromausfall, Wasserschaden, Heizungsausfall), reagiere priorisiert und folgendermaßen:

⏰ Während der Geschäftszeiten (09:00–17:00):
Informiere den Mieter, dass du den zuständigen Verwalter kontaktierst.

Gib, falls verfügbar, dessen Namen und Kontaktdaten (Telefon, E-Mail) an.

🌙 Außerhalb der Geschäftszeiten:
Informiere den Mieter, dass aktuell kein Verwalter erreichbar ist.

Nenne stattdessen die allgemeine Notfallnummer (sofern im Kontext vorhanden).

Gib konkrete Anweisungen, was der Mieter in dieser Situation tun kann, basierend auf der Wissensdatenbank.

🧠 Grundprinzipien
Sei freundlich, professionell und diskret.

Sprich klar, sachlich und verständlich.

Erfinde keine Informationen. Verweise bei Unsicherheit immer an den Verwalter.

Mach keine Angaben über Aktualitätsstand oder Quellen.

Nutze keine Floskeln oder generische Phrasen („Als KI kann ich nicht …" etc.).',
  'Allgemeine Informationen zur Mietverwaltung:

Kontakt Verwalter:
Regina Göttinger: info@rgi-immobilien.de, Tel: 08362-123456

Notfallkontakt außerhalb der Geschäftszeiten:
Notfallnummer: 08362-999888

Bürozeiten:
Montag bis Freitag: 09:00 - 17:00 Uhr

Mietrecht - Wichtige Paragraphen:
§ 535 BGB - Inhalt des Mietvertrags
§ 536 BGB - Mietminderung bei Mängeln
§ 536a BGB - Schadensersatz wegen Nichtgewährung des Gebrauchs
§ 538 BGB - Anzeigepflicht des Mieters
§ 540 BGB - Erhaltung der Mietsache
§ 543 BGB - Außerordentliche fristlose Kündigung
§ 554 BGB - Duldung von Modernisierungsmaßnahmen
§ 557 BGB - Mieterhöhungen

Häufige Mieterfragen:

Heizungsausfall:
- Sofort Verwalter kontaktieren
- Bei Notfall außerhalb der Geschäftszeiten: Notfallnummer
- Mietminderung möglich nach § 536 BGB

Wasserschäden:
- Hauptwasserhahn sofort schließen
- Verwalter umgehend informieren
- Schäden dokumentieren (Fotos)

Nachbarschaftsstreit:
- Erst Gespräch mit Nachbarn versuchen
- Bei Problemen Verwalter kontaktieren
- Hausordnung beachten

Kündigung:
- Kündigungsfristen beachten (meist 3 Monate)
- Schriftform erforderlich
- Übergabetermin vereinbaren'
) ON CONFLICT (management_mode) DO NOTHING;