-- BOOKINGS
CREATE INDEX IF NOT EXISTS idx_bookings_building_fy ON public.bookings(building_id, fiscal_year);
CREATE INDEX IF NOT EXISTS idx_bookings_building_date ON public.bookings(building_id, booking_date DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_invoice ON public.bookings(invoice_id) WHERE invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_account ON public.bookings(account_id);
CREATE INDEX IF NOT EXISTS idx_bookings_needs_review ON public.bookings(building_id) WHERE needs_review = true;

-- INVOICES
CREATE INDEX IF NOT EXISTS idx_invoices_building_created ON public.invoices(building_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_vendor ON public.invoices(vendor_name) WHERE vendor_name IS NOT NULL;

-- BANK_TRANSACTIONS
CREATE INDEX IF NOT EXISTS idx_bank_tx_building_date ON public.bank_transactions(building_id, booking_date DESC);
CREATE INDEX IF NOT EXISTS idx_bank_tx_statement ON public.bank_transactions(statement_id);
CREATE INDEX IF NOT EXISTS idx_bank_tx_invoice ON public.bank_transactions(matched_invoice_id) WHERE matched_invoice_id IS NOT NULL;

-- BUILDING_FILES
CREATE INDEX IF NOT EXISTS idx_building_files_building_created ON public.building_files(building_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_building_files_category ON public.building_files(category_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_building_files_contact ON public.building_files(linked_contact_id) WHERE linked_contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_building_files_invoice ON public.building_files(linked_invoice_id) WHERE linked_invoice_id IS NOT NULL;

-- BUILDING_DOCUMENTS
CREATE INDEX IF NOT EXISTS idx_building_docs_building_status ON public.building_documents(building_id, status);

-- CONTACTS
CREATE INDEX IF NOT EXISTS idx_contacts_lastname ON public.contacts(last_name);
CREATE INDEX IF NOT EXISTS idx_contacts_company ON public.contacts(company_name) WHERE company_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_type ON public.contacts(contact_type);

-- CONTACT_BUILDING_ASSIGNMENTS
CREATE INDEX IF NOT EXISTS idx_cba_building_role ON public.contact_building_assignments(building_id, role_in_building);
CREATE INDEX IF NOT EXISTS idx_cba_contact ON public.contact_building_assignments(contact_id);

-- TODOS
CREATE INDEX IF NOT EXISTS idx_todos_status_due ON public.todos(status, due_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_todos_building ON public.todos(building_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_todos_assigned ON public.todos(assigned_to) WHERE deleted_at IS NULL;

-- CASES (status enum: open, in_progress, waiting_external, waiting_owner, resolved, archived)
CREATE INDEX IF NOT EXISTS idx_cases_building_status ON public.cases(building_id, status);
CREATE INDEX IF NOT EXISTS idx_cases_assignee ON public.cases(assignee_user_id);

-- ETV
CREATE INDEX IF NOT EXISTS idx_etv_votes_agenda ON public.etv_votes(agenda_item_id);
CREATE INDEX IF NOT EXISTS idx_etv_attendees_meeting ON public.etv_attendees(meeting_id);
CREATE INDEX IF NOT EXISTS idx_etv_agenda_meeting ON public.etv_agenda_items(meeting_id);

-- DOCUMENT_CHUNKS
CREATE INDEX IF NOT EXISTS idx_doc_chunks_building_cat ON public.document_chunks(building_id, category) WHERE building_id IS NOT NULL;

-- BUILDING_MANAGERS (RLS hot path)
CREATE INDEX IF NOT EXISTS idx_building_managers_user ON public.building_managers(user_id);
CREATE INDEX IF NOT EXISTS idx_building_managers_building ON public.building_managers(building_id);

-- BUILDINGS
CREATE INDEX IF NOT EXISTS idx_buildings_mode ON public.buildings(management_mode);

-- DASHBOARD AGGREGATION RPC
CREATE OR REPLACE FUNCTION public.get_building_dashboard_stats(p_building_id uuid)
RETURNS json
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'open_invoices', (SELECT COUNT(*) FROM invoices WHERE building_id = p_building_id AND status IN ('open','pending')),
    'open_bookings_review', (SELECT COUNT(*) FROM bookings WHERE building_id = p_building_id AND needs_review = true),
    'unmatched_transactions', (SELECT COUNT(*) FROM bank_transactions WHERE building_id = p_building_id AND match_status != 'matched'),
    'open_todos', (SELECT COUNT(*) FROM todos WHERE building_id = p_building_id AND status != 'done' AND deleted_at IS NULL),
    'open_cases', (SELECT COUNT(*) FROM cases WHERE building_id = p_building_id AND status NOT IN ('resolved','archived')),
    'documents_count', (SELECT COUNT(*) FROM building_files WHERE building_id = p_building_id AND deleted_at IS NULL),
    'owners_count', (SELECT COUNT(DISTINCT contact_id) FROM contact_building_assignments WHERE building_id = p_building_id AND role_in_building = 'eigentuemer'),
    'last_activity', (SELECT MAX(created_at) FROM building_files WHERE building_id = p_building_id)
  )
$$;