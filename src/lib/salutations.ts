// Centralized salutation list — used by both admin (CreateContactDialog) and owner self-service.
// Keep in sync with src/components/contacts/CreateContactDialog.tsx
export const SALUTATIONS = [
  "Herr",
  "Frau",
  "Eheleute",
  "Firma",
  "Familie",
  "Herr Dr.",
  "Frau Dr.",
  "Herr Prof.",
  "Frau Prof.",
  "Herr Prof. Dr.",
  "Frau Prof. Dr.",
  "Herr/Frau",
] as const;

export type Salutation = (typeof SALUTATIONS)[number];
