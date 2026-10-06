-- Entwürfe in geteilten Postfächern
--
-- Bisher sah jeder nur seine eigenen Entwürfe. Wer im Postfach das Konto einer
-- Kollegin mit angehakt hat, soll auch deren Entwürfe aus diesem Konto sehen,
-- weiterschreiben, versenden oder löschen können — genauso wie er ihre E-Mails
-- sieht (die Tabelle emails ist ebenfalls über user_has_admin_access offen).
--
-- Die bisherigen Regeln für eigene Entwürfe bleiben unverändert; diese hier
-- kommen nur dazu. Entwürfe ohne Konto bleiben privat.

DROP POLICY IF EXISTS "Staff see mailbox drafts" ON public.email_drafts;
CREATE POLICY "Staff see mailbox drafts" ON public.email_drafts
  FOR SELECT TO authenticated
  USING (account_id IS NOT NULL AND public.user_has_admin_access(auth.uid()));

DROP POLICY IF EXISTS "Staff update mailbox drafts" ON public.email_drafts;
CREATE POLICY "Staff update mailbox drafts" ON public.email_drafts
  FOR UPDATE TO authenticated
  USING (account_id IS NOT NULL AND public.user_has_admin_access(auth.uid()))
  WITH CHECK (account_id IS NOT NULL AND public.user_has_admin_access(auth.uid()));

DROP POLICY IF EXISTS "Staff delete mailbox drafts" ON public.email_drafts;
CREATE POLICY "Staff delete mailbox drafts" ON public.email_drafts
  FOR DELETE TO authenticated
  USING (account_id IS NOT NULL AND public.user_has_admin_access(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_email_drafts_account_updated
  ON public.email_drafts (account_id, updated_at DESC);
