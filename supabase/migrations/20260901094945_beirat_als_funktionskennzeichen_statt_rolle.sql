-- Der Verwaltungsbeirat ist keine Eigentumsrolle, sondern eine Funktion, die ein
-- Eigentümer zusätzlich ausübt - genau wie die Kassenprüfung (is_cash_auditor).
-- Bisher war 'beirat' ein Wert von role_in_building und hat die Betroffenen aus
-- allen Eigentümerlisten und MEA-Summen fallen lassen.

ALTER TABLE public.contact_building_assignments
  ADD COLUMN IF NOT EXISTS is_beirat boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_beirat_vorsitz boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.contact_building_assignments.is_beirat IS
  'Mitglied des Verwaltungsbeirats (§ 29 WEG). Funktionskennzeichen auf der Eigentümerzuordnung, keine eigene Rolle.';
COMMENT ON COLUMN public.contact_building_assignments.is_beirat_vorsitz IS
  'Vorsitz des Verwaltungsbeirats. Setzt is_beirat voraus.';

-- Vorsitz nur, wer auch im Beirat ist.
ALTER TABLE public.contact_building_assignments
  DROP CONSTRAINT IF EXISTS cba_beirat_vorsitz_setzt_mitgliedschaft_voraus;
ALTER TABLE public.contact_building_assignments
  ADD CONSTRAINT cba_beirat_vorsitz_setzt_mitgliedschaft_voraus
  CHECK (NOT is_beirat_vorsitz OR is_beirat);

CREATE INDEX IF NOT EXISTS idx_cba_beirat
  ON public.contact_building_assignments (building_id)
  WHERE is_beirat;

-- Normalisierung: Wer als 'beirat' angelegt oder gespeichert wird, ist ab sofort
-- automatisch Eigentümer mit gesetztem Beiratskennzeichen. Damit gilt die Regel
-- auch dann, wenn ein Client den Enum-Wert weiterhin sendet.
CREATE OR REPLACE FUNCTION public.normalize_beirat_role()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.role_in_building = 'beirat' THEN
    NEW.role_in_building := 'eigentuemer';
    NEW.is_beirat := true;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_normalize_beirat_role ON public.contact_building_assignments;
CREATE TRIGGER trg_normalize_beirat_role
  BEFORE INSERT OR UPDATE ON public.contact_building_assignments
  FOR EACH ROW EXECUTE FUNCTION public.normalize_beirat_role();

-- Der Enum-Wert 'beirat' bleibt vorerst bestehen, damit bestehende Clients keinen
-- Fehler bekommen. Er kann entfernt werden, sobald kein Client ihn mehr sendet.
