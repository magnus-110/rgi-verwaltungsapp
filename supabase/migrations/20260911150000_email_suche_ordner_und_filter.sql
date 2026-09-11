-- E-Mail-Suche: im aktuellen Ordner, mit Archiv-Filtern und mehreren Suchwörtern
-- ===========================================================================
--
-- Die bisherige Suche (search_emails) hat immer über alle Ordner gesucht,
-- die Filter im Archiv (Liegenschaft, Kontakt) ignoriert und die komplette
-- Mail inkl. Text und HTML zurückgegeben. Das war langsam und lieferte in
-- „Eingang“ oder „Gesendet“ auch Treffer aus anderen Ordnern.
--
-- search_emails_v2 liefert nur die IDs der Treffer (die App lädt danach die
-- schlanken Listenspalten) und berücksichtigt:
--   * Ordner (p_folder_id) bzw. Archiv (p_archived)
--   * Liegenschaft / Kontakt, jeweils auch „ohne“
--   * E-Mail-Konten und Zuständigkeit wie bisher
--   * mehrere Suchwörter: jedes Wort muss irgendwo vorkommen
--     (Betreff, Absender, Empfänger, CC oder Text)
--
-- Die alte Funktion bleibt unverändert bestehen.

CREATE OR REPLACE FUNCTION public.search_emails_v2(
  p_search text,
  p_folder_id uuid DEFAULT NULL,
  p_archived boolean DEFAULT NULL,
  p_building_id uuid DEFAULT NULL,
  p_without_building boolean DEFAULT false,
  p_contact_id uuid DEFAULT NULL,
  p_without_contact boolean DEFAULT false,
  p_account_ids uuid[] DEFAULT NULL,
  p_assigned_to uuid DEFAULT NULL,
  p_assigned_filter text DEFAULT 'all',
  p_limit int DEFAULT 200,
  p_offset int DEFAULT 0
)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH terms AS (
    -- Suchwörter; %, _ und \ werden maskiert, damit sie wörtlich gesucht werden
    SELECT '%' || replace(replace(replace(w, '\', '\\'), '%', '\%'), '_', '\_') || '%' AS pattern
    FROM regexp_split_to_table(btrim(coalesce(p_search, '')), '\s+') AS w
    WHERE length(w) > 0
  )
  SELECT e.id
  FROM public.emails e
  WHERE public.user_has_admin_access(auth.uid())
    -- Gelöschte Mails nur, wenn gezielt ein Ordner (z. B. Papierkorb) gewählt ist
    AND (p_folder_id IS NOT NULL OR e.deleted_at IS NULL)
    AND (p_folder_id IS NULL OR e.folder_id = p_folder_id)
    AND (p_archived IS NULL OR e.is_archived = p_archived)
    AND (NOT p_without_building OR e.building_id IS NULL)
    AND (p_building_id IS NULL OR e.building_id = p_building_id)
    AND (NOT p_without_contact OR e.contact_id IS NULL)
    AND (p_contact_id IS NULL OR e.contact_id = p_contact_id)
    AND (p_account_ids IS NULL OR e.account_id = ANY(p_account_ids))
    AND (
      p_assigned_filter = 'all'
      OR (p_assigned_filter = 'unassigned' AND e.assigned_to IS NULL)
      OR (p_assigned_filter = 'user' AND e.assigned_to = p_assigned_to)
    )
    AND EXISTS (SELECT 1 FROM terms)
    AND NOT EXISTS (
      SELECT 1
      FROM terms t
      WHERE NOT (
        coalesce(e.subject, '') ILIKE t.pattern
        OR coalesce(e.from_name, '') ILIKE t.pattern
        OR coalesce(e.from_address, '') ILIKE t.pattern
        OR coalesce(e.to_addresses::text, '') ILIKE t.pattern
        OR coalesce(e.cc_addresses::text, '') ILIKE t.pattern
        OR coalesce(e.body_text, '') ILIKE t.pattern
      )
    )
  ORDER BY e.date DESC NULLS LAST
  LIMIT GREATEST(p_limit, 0)
  OFFSET GREATEST(p_offset, 0);
$$;

GRANT EXECUTE ON FUNCTION public.search_emails_v2(text, uuid, boolean, uuid, boolean, uuid, boolean, uuid[], uuid, text, int, int) TO authenticated;
