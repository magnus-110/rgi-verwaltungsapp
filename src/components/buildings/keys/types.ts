export interface KeyStorageLocation { id: string; name: string; code: string; is_active: boolean }
export interface KeyType { id: string; name: string; color_hex: string | null; code_suffix: string; is_active: boolean }
export interface KeySubjectType { id: string; name: string; icon: string | null; is_active: boolean }
export interface KeyManufacturer { id: string; name: string; is_active: boolean }

export interface KeyTag {
  id: string;
  building_id: string;
  storage_location_id: string;
  key_type_id: string;
  sequence_number: number;
  tag_number: string;
  photo_path: string | null;
  notes: string | null;
  current_loan_id: string | null;
  created_at: string;
}

export interface KeyItem {
  id: string;
  tag_id: string;
  subject_type_id: string | null;
  key_number: string | null;
  manufacturer_id: string | null;
  notes: string | null;
}

export type KeyLoanStatus = 'open' | 'returned' | 'lost';

export interface KeyLoan {
  id: string;
  tag_id: string;
  building_id: string;
  borrower_contact_id: string | null;
  borrower_name: string | null;
  borrower_email: string | null;
  issued_at: string;
  due_at: string | null;
  returned_at: string | null;
  status: KeyLoanStatus;
  requires_signature: boolean;
  signature_data: string | null;
  send_confirmation_email: boolean;
  send_overdue_reminder: boolean;
  issued_by_user_id: string | null;
  returned_confirmed_by_user_id: string | null;
  notes: string | null;
}

export interface KeyEvent {
  id: string;
  building_id: string;
  tag_id: string | null;
  key_id: string | null;
  loan_id: string | null;
  event_type: string;
  actor_label: string | null;
  payload: any;
  created_at: string;
}
