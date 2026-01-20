-- =====================================================
-- PDF REORGANIZATION SYSTEM - DSGVO-KONFORM (100% MISTRAL)
-- =====================================================

-- 1. Reorganization Agents (Flexible Agent-Konfiguration)
CREATE TABLE public.reorganization_agents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  system_prompt TEXT NOT NULL,
  search_keywords TEXT[] DEFAULT '{}',
  example_content TEXT,
  output_filename_pattern TEXT DEFAULT '{category}_{building}_{year}',
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  icon TEXT DEFAULT 'FileText',
  color TEXT DEFAULT '#6366f1',
  created_by UUID REFERENCES public.profiles(user_id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2. Agent Presets (Vorgefertigte Agent-Sets)
CREATE TABLE public.agent_presets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  agent_ids UUID[] DEFAULT '{}',
  is_template BOOLEAN DEFAULT false,
  is_default BOOLEAN DEFAULT false,
  management_mode public.management_mode DEFAULT 'weg',
  created_by UUID REFERENCES public.profiles(user_id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 3. Document Page Index (Seiten-Index für schnelle Suche)
CREATE TABLE public.document_page_index (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES public.building_documents(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  page_summary TEXT,
  detected_type TEXT,
  keywords TEXT[] DEFAULT '{}',
  confidence_score DECIMAL(3,2) DEFAULT 0.00,
  raw_text TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  UNIQUE(document_id, page_number)
);

-- 4. Reorganization Jobs (Job-Tracking)
CREATE TABLE public.reorganization_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_document_id UUID NOT NULL REFERENCES public.building_documents(id) ON DELETE CASCADE,
  building_id UUID REFERENCES public.buildings(id) ON DELETE SET NULL,
  preset_id UUID REFERENCES public.agent_presets(id) ON DELETE SET NULL,
  selected_agent_ids UUID[] DEFAULT '{}',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'indexing', 'searching', 'validating', 'splitting', 'complete', 'error', 'cancelled')),
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  current_phase TEXT,
  current_agent_name TEXT,
  page_mappings JSONB DEFAULT '{}',
  validation_report JSONB,
  unassigned_pages INTEGER[] DEFAULT '{}',
  error_message TEXT,
  total_pages INTEGER,
  processed_pages INTEGER DEFAULT 0,
  created_by UUID REFERENCES public.profiles(user_id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- 5. Agent Search Results (Zwischen-Ergebnisse der Agent-Suchen)
CREATE TABLE public.agent_search_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.reorganization_jobs(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES public.reorganization_agents(id) ON DELETE CASCADE,
  found_pages INTEGER[] DEFAULT '{}',
  confidence_scores JSONB DEFAULT '{}',
  chunk_results JSONB DEFAULT '{}',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'complete', 'error')),
  error_message TEXT,
  processing_time_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  UNIQUE(job_id, agent_id)
);

-- 6. Reorganized Documents (Erstellte Teil-PDFs)
CREATE TABLE public.reorganized_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.reorganization_jobs(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES public.reorganization_agents(id) ON DELETE SET NULL,
  source_document_id UUID NOT NULL REFERENCES public.building_documents(id) ON DELETE CASCADE,
  building_id UUID REFERENCES public.buildings(id) ON DELETE SET NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT,
  page_count INTEGER,
  source_pages INTEGER[] DEFAULT '{}',
  source_page_ranges TEXT,
  category_label TEXT,
  storage_url TEXT,
  is_indexed BOOLEAN DEFAULT false,
  download_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- =====================================================
-- INDEXES
-- =====================================================

CREATE INDEX idx_reorganization_agents_active ON public.reorganization_agents(is_active) WHERE is_active = true;
CREATE INDEX idx_reorganization_agents_sort ON public.reorganization_agents(sort_order);

CREATE INDEX idx_agent_presets_default ON public.agent_presets(is_default) WHERE is_default = true;
CREATE INDEX idx_agent_presets_management ON public.agent_presets(management_mode);

CREATE INDEX idx_document_page_index_document ON public.document_page_index(document_id);
CREATE INDEX idx_document_page_index_type ON public.document_page_index(detected_type);
CREATE INDEX idx_document_page_index_keywords ON public.document_page_index USING GIN(keywords);

CREATE INDEX idx_reorganization_jobs_status ON public.reorganization_jobs(status);
CREATE INDEX idx_reorganization_jobs_source ON public.reorganization_jobs(source_document_id);
CREATE INDEX idx_reorganization_jobs_building ON public.reorganization_jobs(building_id);

CREATE INDEX idx_agent_search_results_job ON public.agent_search_results(job_id);
CREATE INDEX idx_agent_search_results_status ON public.agent_search_results(status);

CREATE INDEX idx_reorganized_documents_job ON public.reorganized_documents(job_id);
CREATE INDEX idx_reorganized_documents_building ON public.reorganized_documents(building_id);

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE public.reorganization_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_page_index ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reorganization_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_search_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reorganized_documents ENABLE ROW LEVEL SECURITY;

-- Reorganization Agents: Admins/Employees can read all, only admins can modify
CREATE POLICY "Admins and employees can view agents"
  ON public.reorganization_agents FOR SELECT
  USING (public.user_has_admin_access(auth.uid()));

CREATE POLICY "Admins can manage agents"
  ON public.reorganization_agents FOR ALL
  USING (public.get_user_role(auth.uid()) = 'admin')
  WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

-- Agent Presets: Same as agents
CREATE POLICY "Admins and employees can view presets"
  ON public.agent_presets FOR SELECT
  USING (public.user_has_admin_access(auth.uid()));

CREATE POLICY "Admins can manage presets"
  ON public.agent_presets FOR ALL
  USING (public.get_user_role(auth.uid()) = 'admin')
  WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

-- Document Page Index: Admins/Employees can access
CREATE POLICY "Admins and employees can access page index"
  ON public.document_page_index FOR ALL
  USING (public.user_has_admin_access(auth.uid()));

-- Reorganization Jobs: Users can see their own jobs, admins see all
CREATE POLICY "Users can view their own jobs"
  ON public.reorganization_jobs FOR SELECT
  USING (
    created_by = auth.uid() OR 
    public.user_has_admin_access(auth.uid())
  );

CREATE POLICY "Users can create jobs"
  ON public.reorganization_jobs FOR INSERT
  WITH CHECK (public.user_has_admin_access(auth.uid()));

CREATE POLICY "Admins can manage all jobs"
  ON public.reorganization_jobs FOR UPDATE
  USING (public.user_has_admin_access(auth.uid()));

CREATE POLICY "Admins can delete jobs"
  ON public.reorganization_jobs FOR DELETE
  USING (public.get_user_role(auth.uid()) = 'admin');

-- Agent Search Results: Same as jobs
CREATE POLICY "Admins and employees can access search results"
  ON public.agent_search_results FOR ALL
  USING (public.user_has_admin_access(auth.uid()));

-- Reorganized Documents: Same as jobs
CREATE POLICY "Users can view reorganized documents"
  ON public.reorganized_documents FOR SELECT
  USING (public.user_has_admin_access(auth.uid()));

CREATE POLICY "System can manage reorganized documents"
  ON public.reorganized_documents FOR ALL
  USING (public.user_has_admin_access(auth.uid()));

-- =====================================================
-- TRIGGERS
-- =====================================================

CREATE TRIGGER update_reorganization_agents_updated_at
  BEFORE UPDATE ON public.reorganization_agents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_agent_presets_updated_at
  BEFORE UPDATE ON public.agent_presets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_reorganization_jobs_updated_at
  BEFORE UPDATE ON public.reorganization_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- INSERT DEFAULT WEG AGENTS
-- =====================================================

INSERT INTO public.reorganization_agents (name, description, system_prompt, search_keywords, example_content, output_filename_pattern, sort_order, icon, color) VALUES
(
  'Teilungserklärung & Gemeinschaftsordnung',
  'Erkennt Teilungserklärungen, Gemeinschaftsordnungen und deren Nachträge',
  'Du bist ein Experte für WEG-Recht und erkennst Teilungserklärungen und Gemeinschaftsordnungen. Suche nach: notariellen Urkunden zur Aufteilung, Miteigentumsanteilen, Sondernutzungsrechten, Regelungen zum Gemeinschaftseigentum.',
  ARRAY['Teilungserklärung', 'Gemeinschaftsordnung', 'Miteigentumsanteil', 'Sondernutzungsrecht', 'Aufteilungsplan', 'Notar', 'Grundbuch', 'WEG'],
  'Die Teilungserklärung vom 15.03.1995, Urkundenrolle Nr. 234/1995 des Notars Dr. Müller...',
  'Teilungserklaerung_{building}',
  1, 'FileText', '#6366f1'
),
(
  'Protokolle Eigentümerversammlungen',
  'Erkennt Versammlungsprotokolle und Beschlüsse',
  'Du bist ein Experte für WEG-Versammlungen. Suche nach: Einladungen, Protokollen, Beschlüssen, Abstimmungsergebnissen, TOP-Listen, Versammlungsleitern.',
  ARRAY['Eigentümerversammlung', 'Protokoll', 'Beschluss', 'TOP', 'Abstimmung', 'Versammlungsleiter', 'Stimmrecht', 'Jahresversammlung'],
  'Protokoll der ordentlichen Eigentümerversammlung vom 12.05.2023, TOP 3: Genehmigung der Jahresabrechnung...',
  'Protokolle_{building}_{year}',
  2, 'Users', '#8b5cf6'
),
(
  'Wirtschaftspläne',
  'Erkennt Wirtschaftspläne und Hausgeldzahlungen',
  'Du bist ein Experte für WEG-Finanzen. Suche nach: Wirtschaftsplänen, Hausgeldern, Vorauszahlungen, Kostenverteilungen, Einzelwirtschaftsplänen.',
  ARRAY['Wirtschaftsplan', 'Hausgeld', 'Vorauszahlung', 'Kostenverteilung', 'Einzelwirtschaftsplan', 'Umlageschlüssel', 'Rücklage'],
  'Wirtschaftsplan 2024: Gesamtkosten 45.000 EUR, monatliches Hausgeld Einheit 1: 285,00 EUR...',
  'Wirtschaftsplan_{building}_{year}',
  3, 'Calculator', '#0ea5e9'
),
(
  'Jahresabrechnungen',
  'Erkennt Jahresabrechnungen und Einzelabrechnungen',
  'Du bist ein Experte für WEG-Abrechnungen. Suche nach: Jahresabrechnungen, Einzelabrechnungen, Abrechnungsspitzen, Guthaben, Nachzahlungen, Kontenübersichten.',
  ARRAY['Jahresabrechnung', 'Einzelabrechnung', 'Abrechnungsspitze', 'Guthaben', 'Nachzahlung', 'Heizkosten', 'Wasserkosten', 'Betriebskosten'],
  'Jahresabrechnung 2023: Gesamtausgaben 52.340,00 EUR, Ihre Abrechnungsspitze: -234,50 EUR (Guthaben)...',
  'Jahresabrechnung_{building}_{year}',
  4, 'Receipt', '#10b981'
),
(
  'Wartungs- & Serviceverträge',
  'Erkennt Wartungsverträge und Dienstleistervereinbarungen',
  'Du bist ein Experte für Gebäudewartung. Suche nach: Wartungsverträgen, Serviceverträgen, Aufzugswartung, Heizungswartung, Gartenpflege, Reinigung, Hausmeister.',
  ARRAY['Wartungsvertrag', 'Servicevertrag', 'Aufzug', 'Heizung', 'Gartenpflege', 'Reinigung', 'Hausmeister', 'Dienstleister', 'Instandhaltung'],
  'Wartungsvertrag Aufzugsanlage: Fa. Schindler, monatliche Wartung, Vertragslaufzeit 01.01.2023 - 31.12.2025...',
  'Wartungsvertraege_{building}',
  5, 'Wrench', '#f59e0b'
),
(
  'Versicherungspolicen',
  'Erkennt Versicherungsunterlagen und Schadensmeldungen',
  'Du bist ein Experte für Gebäudeversicherungen. Suche nach: Versicherungspolicen, Gebäudeversicherung, Haftpflicht, Glasversicherung, Schadensmeldungen, Prämien.',
  ARRAY['Versicherung', 'Police', 'Gebäudeversicherung', 'Haftpflicht', 'Glasversicherung', 'Prämie', 'Schaden', 'Deckung'],
  'Wohngebäudeversicherung Police Nr. 123-456-789, Versicherungssumme gleitend, Jahresprämie 2.340,00 EUR...',
  'Versicherungen_{building}',
  6, 'Shield', '#ef4444'
),
(
  'Hausordnung',
  'Erkennt Hausordnungen und Verhaltensregeln',
  'Du bist ein Experte für Hausordnungen. Suche nach: Hausordnungen, Ruhezeiten, Tierhaltung, Müllentsorgung, Treppenhausreinigung, Verhaltensregeln.',
  ARRAY['Hausordnung', 'Ruhezeit', 'Tierhaltung', 'Müllentsorgung', 'Treppenhaus', 'Gemeinschaftsräume', 'Grillen', 'Lärm'],
  'Hausordnung der WEG Musterstraße 1: Ruhezeiten 13-15 Uhr und 22-7 Uhr, Tierhaltung nur mit Zustimmung...',
  'Hausordnung_{building}',
  7, 'Home', '#64748b'
),
(
  'Beschlusssammlung',
  'Erkennt die offizielle Beschlusssammlung',
  'Du bist ein Experte für WEG-Beschlüsse. Suche nach: Beschlusssammlungen, Beschlüssen mit laufender Nummer, Verkündungsdatum, Anfechtungsfristen.',
  ARRAY['Beschlusssammlung', 'Beschluss', 'laufende Nummer', 'Verkündung', 'Anfechtung', 'bestandskräftig', 'Mehrheit'],
  'Beschluss Nr. 2023-15: Sanierung der Tiefgarageneinfahrt, beschlossen mit 78% Mehrheit, verkündet am 15.05.2023...',
  'Beschlusssammlung_{building}',
  8, 'ClipboardList', '#a855f7'
),
(
  'Rücklagen & Instandhaltung',
  'Erkennt Rücklagenentwicklung und Instandhaltungsplanungen',
  'Du bist ein Experte für WEG-Rücklagen. Suche nach: Rücklagenentwicklung, Instandhaltungsrücklage, Sanierungsplanung, Zustandsbewertung, Maßnahmenplan.',
  ARRAY['Rücklage', 'Instandhaltung', 'Sanierung', 'Zustand', 'Maßnahme', 'Erhaltung', 'Reparatur', 'Investition'],
  'Rücklagenentwicklung 2020-2024: Bestand 01.01.2024: 125.000 EUR, geplante Entnahme Dachsanierung: 85.000 EUR...',
  'Ruecklagen_{building}',
  9, 'PiggyBank', '#22c55e'
),
(
  'Korrespondenz',
  'Erkennt wichtige Schriftwechsel und Mitteilungen',
  'Du bist ein Experte für WEG-Korrespondenz. Suche nach: Schreiben an/von Eigentümern, Mitteilungen, Ankündigungen, Mahnungen, Behördenschreiben.',
  ARRAY['Schreiben', 'Mitteilung', 'Ankündigung', 'Mahnung', 'Behörde', 'Brief', 'Information', 'Rundschreiben'],
  'Rundschreiben an alle Eigentümer vom 01.03.2024: Ankündigung der Fassadensanierung ab 15.04.2024...',
  'Korrespondenz_{building}_{year}',
  10, 'Mail', '#06b6d4'
),
(
  'Gerichtsurteile & Rechtsstreit',
  'Erkennt rechtliche Dokumente und Gerichtsverfahren',
  'Du bist ein Experte für WEG-Recht. Suche nach: Gerichtsurteilen, Klagen, Anwaltsschreiben, Vergleichen, Mahnbescheiden, Vollstreckungen.',
  ARRAY['Gericht', 'Urteil', 'Klage', 'Anwalt', 'Vergleich', 'Mahnbescheid', 'Vollstreckung', 'Rechtsstreit'],
  'Amtsgericht München, Az. 485 C 1234/23, Urteil vom 15.09.2023: Beschlussanfechtungsklage abgewiesen...',
  'Rechtsstreit_{building}',
  11, 'Scale', '#dc2626'
),
(
  'Eigentümerlisten',
  'Erkennt Eigentümerverzeichnisse und Kontaktdaten',
  'Du bist ein Experte für WEG-Verwaltung. Suche nach: Eigentümerlisten, Eigentümerverzeichnissen, Kontaktdaten, Wohnungsnummern, Miteigentumsanteilen.',
  ARRAY['Eigentümerliste', 'Eigentümerverzeichnis', 'Kontakt', 'Wohnung', 'Einheit', 'Miteigentum', 'Anschrift'],
  'Eigentümerverzeichnis Stand 01.01.2024: Einheit 1 - Müller, Max, 125/1000 MEA, Musterstraße 1...',
  'Eigentuemerliste_{building}',
  12, 'Users', '#0891b2'
),
(
  'Pläne & Grundrisse',
  'Erkennt technische Zeichnungen und Baupläne',
  'Du bist ein Experte für Bauzeichnungen. Suche nach: Grundrissen, Bauplänen, Schnitten, Ansichten, Lageplänen, technischen Zeichnungen, Maßangaben.',
  ARRAY['Grundriss', 'Bauplan', 'Schnitt', 'Ansicht', 'Lageplan', 'Zeichnung', 'Maßstab', 'Architekt'],
  'Grundriss Erdgeschoss, Maßstab 1:100, Architekt: Dipl.-Ing. Schmidt, Datum: 15.03.1995...',
  'Plaene_{building}',
  13, 'Map', '#7c3aed'
),
(
  'Energieausweis',
  'Erkennt Energieausweise und energetische Gutachten',
  'Du bist ein Experte für Gebäudeenergie. Suche nach: Energieausweisen, Energieeffizienzklassen, Endenergiebedarf, energetischen Sanierungen.',
  ARRAY['Energieausweis', 'Energieeffizienz', 'Endenergie', 'Primärenergie', 'CO2', 'Sanierung', 'Dämmung', 'Heizung'],
  'Energieausweis gültig bis 12/2030, Energieeffizienzklasse D, Endenergiebedarf 145 kWh/(m²·a)...',
  'Energieausweis_{building}',
  14, 'Zap', '#eab308'
),
(
  'Sonstiges',
  'Dokumente die keiner anderen Kategorie zugeordnet werden können',
  'Du bist ein Generalist für WEG-Dokumente. Ordne hier alles ein, was zu keiner spezifischen Kategorie passt: Diverse Unterlagen, Notizen, Fotos, sonstige Dokumente.',
  ARRAY['sonstig', 'diverse', 'verschiedenes', 'allgemein', 'unklar'],
  'Verschiedene Dokumente ohne klare Kategoriezuordnung',
  'Sonstiges_{building}',
  99, 'File', '#94a3b8'
);

-- =====================================================
-- INSERT DEFAULT WEG PRESET
-- =====================================================

INSERT INTO public.agent_presets (name, description, agent_ids, is_template, is_default, management_mode)
SELECT 
  'WEG-Stammakte',
  'Komplettes Set für die Reorganisation einer WEG-Stammakte mit allen 15 Standard-Kategorien',
  ARRAY_AGG(id ORDER BY sort_order),
  true,
  true,
  'weg'
FROM public.reorganization_agents
WHERE is_active = true;

-- =====================================================
-- STORAGE BUCKET FOR REORGANIZED DOCUMENTS
-- =====================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('reorganized-documents', 'reorganized-documents', false, 524288000, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- Storage policies for reorganized documents
CREATE POLICY "Admins can upload reorganized documents"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'reorganized-documents' AND
    public.user_has_admin_access(auth.uid())
  );

CREATE POLICY "Admins can view reorganized documents"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'reorganized-documents' AND
    public.user_has_admin_access(auth.uid())
  );

CREATE POLICY "Admins can delete reorganized documents"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'reorganized-documents' AND
    public.user_has_admin_access(auth.uid())
  );