-- Benachrichtigungen für neue Anfragen und neue Makler-Interessenten erlauben.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type = any (array['pin_assigned','pin_returned','subtask_done','comment','reminder','case_email','review_due','deadline','report_assigned','report_reply','anfrage','makler_interessent','mahnung']));
