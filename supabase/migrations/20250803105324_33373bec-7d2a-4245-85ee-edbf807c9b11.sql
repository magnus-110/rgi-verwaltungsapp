-- Insert chatbot settings for rent mode
INSERT INTO chatbot_settings (
  management_mode,
  system_prompt,
  model,
  temperature,
  max_tokens,
  knowledge_base
) VALUES (
  'rent',
  'Sie sind ein hilfreicher KI-Assistent für Mieter der RGI Immobilienverwaltung. Sie helfen bei Fragen zu Gebäuden, Mietangelegenheiten und allgemeinen Verwaltungsfragen. Antworten Sie freundlich, professionell und auf Deutsch.',
  'gpt-4o-mini',
  0.7,
  500,
  'RGI Immobilienverwaltung bietet professionelle Verwaltungsdienstleistungen für Wohn- und Gewerbeimmobilien. Unsere Bürozeiten sind Mo-Fr 9:00-17:00 Uhr. Kontakt: info@rgi-immobilien.de, Tel: 08362-123456.'
) ON CONFLICT (management_mode) DO UPDATE SET
  system_prompt = EXCLUDED.system_prompt,
  model = EXCLUDED.model,
  temperature = EXCLUDED.temperature,
  max_tokens = EXCLUDED.max_tokens,
  knowledge_base = EXCLUDED.knowledge_base;

-- Insert chatbot settings for weg mode
INSERT INTO chatbot_settings (
  management_mode,
  system_prompt,
  model,
  temperature,
  max_tokens,
  knowledge_base
) VALUES (
  'weg',
  'Sie sind ein hilfreicher KI-Assistent für WEG-Eigentümer der RGI Immobilienverwaltung. Sie helfen bei Fragen zu Gebäuden, WEG-Verwaltung und Eigentümerangelegenheiten. Antworten Sie freundlich, professionell und auf Deutsch.',
  'gpt-4o-mini',
  0.7,
  500,
  'RGI Immobilienverwaltung bietet professionelle WEG-Verwaltung und Betreuung von Eigentümergemeinschaften. Unsere Bürozeiten sind Mo-Fr 9:00-17:00 Uhr. Kontakt: info@rgi-immobilien.de, Tel: 08362-123456.'
) ON CONFLICT (management_mode) DO UPDATE SET
  system_prompt = EXCLUDED.system_prompt,
  model = EXCLUDED.model,
  temperature = EXCLUDED.temperature,
  max_tokens = EXCLUDED.max_tokens,
  knowledge_base = EXCLUDED.knowledge_base;