-- Hinweise in der App zu Meldungen: Übergabe an eine Person und Antwort des
-- Melders. Die Typen fehlten in der Liste der erlaubten Benachrichtigungen,
-- dadurch schlug das Übergeben einer Meldung fehl.
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type = any (array['pin_assigned','pin_returned','subtask_done','comment','reminder','case_email','review_due','deadline','report_assigned','report_reply']));
