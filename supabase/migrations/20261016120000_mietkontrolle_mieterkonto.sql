-- Mietkontrolle: Mieterkonto, Zahltag, Startsaldo (16.10.2026)
--
-- mk_zahltag:      vereinbarter Zahltag (1–31); leer = 3. Werktag (§ 556b Abs. 1 BGB)
-- mk_start_datum:  Beginn der Mietkontrolle für diesen Mieter (Stichtag des Startsaldos)
-- mk_start_saldo:  offener Betrag aus der Zeit davor (> 0 Rückstand, < 0 Guthaben)
--
-- Mehrere Einheiten eines Mieters im selben Objekt werden in der Funktion
-- „mietkontrolle" zu einem Mieterkonto zusammengefasst; die Felder gelten dann
-- für das ganze Konto (gespeichert an der Haupt-Einheit).

alter table public.contact_building_assignments
  add column if not exists mk_zahltag smallint check (mk_zahltag between 1 and 31),
  add column if not exists mk_start_datum date,
  add column if not exists mk_start_saldo numeric;

alter table public.contact_building_assignments
  drop constraint if exists contact_building_assignments_mk_start_check;
alter table public.contact_building_assignments
  add constraint contact_building_assignments_mk_start_check
  check ((mk_start_datum is null) = (mk_start_saldo is null));
