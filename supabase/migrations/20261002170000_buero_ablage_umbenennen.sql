-- Büro-Ablage: Dateien umbenennen.
--
-- Wer einen Eintrag sehen darf, darf auch seinen Anzeigenamen (und den
-- Kommentar) ändern — genau wie beim Löschen. Alle anderen Spalten bleiben
-- gesperrt: Absender, Empfänger und Speicherort lassen sich so nicht ändern.

grant update (file_name, note) on public.office_drop_items to authenticated;

drop policy if exists "Büro-Ablage umbenennen" on public.office_drop_items;
create policy "Büro-Ablage umbenennen"
  on public.office_drop_items
  for update
  using (public.office_drop_can_see(created_by, recipient_ids, auth.uid()))
  with check (
    public.office_drop_can_see(created_by, recipient_ids, auth.uid())
    and (kind <> 'file' or coalesce(btrim(file_name), '') <> '')
  );
