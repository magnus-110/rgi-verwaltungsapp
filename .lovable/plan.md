

## Fix: CSV-Import setzt keine `person_id` bei Telefon/E-Mail

### Problem

Die Edge Function `import-contacts-csv` fügt Telefonnummern und E-Mails nur mit `contact_id` ein, aber **ohne `person_id`**. Die `ContactDetail`-Komponente lädt diese Daten jedoch gefiltert nach `person_id === person.id` (Zeile 98-100). Da `person_id` null ist, werden die Daten nie angezeigt — obwohl sie in der Datenbank existieren.

Die Vorschau funktioniert, weil sie rein clientseitig ist und die Daten direkt aus dem geparsten Objekt anzeigt.

### Lösung

**Datei: `supabase/functions/import-contacts-csv/index.ts`**

Im `action === "import"` Block (Zeile 324-396): Nach dem Einfügen der Personen (`contact_persons`) die zurückgegebenen IDs abrufen, dann beim Einfügen von Phones, Emails und Bank-Accounts die korrekte `person_id` setzen.

Konkret:
1. Persons-Insert mit `.select("id")` erweitern, um die generierten IDs zu erhalten
2. Die primäre Person (oder erste Person) als Fallback-`person_id` für Phones/Emails/Banks verwenden
3. Falls mehrere Personen existieren und die Daten zugeordnet werden können (z.B. über Index), die jeweilige `person_id` setzen

```typescript
// Persons einfügen und IDs zurückbekommen
const { data: personsData, error: persErr } = await supabase
  .from("contact_persons")
  .insert(personInserts)
  .select("id");

// Primäre Person-ID ermitteln
const primaryPersonId = personsData?.[0]?.id || null;

// Phones mit person_id einfügen
const phoneInserts = validPhones.map((p) => ({
  contact_id: contactId,
  person_id: primaryPersonId,  // <-- DAS FEHLTE
  phone_number: p.phone_number.trim(),
  label: p.label || "Mobil",
  note: p.note || null,
}));

// Emails mit person_id einfügen  
const emailInserts = validEmails.map((e, idx) => ({
  contact_id: contactId,
  person_id: primaryPersonId,  // <-- DAS FEHLTE
  email: e.email.trim(),
  label: e.label || "Privat",
  is_primary: idx === 0,
  note: e.note || null,
}));

// Bank mit person_id einfügen
await supabase.from("contact_bank_accounts").insert({
  contact_id: contactId,
  person_id: primaryPersonId,  // <-- DAS FEHLTE
  ...
});
```

### Zusätzlich: Adressen bereinigen

Alle Kontakte außer Magnus Göttinger und Cristina van Praag löschen (wie angefordert).

### Dateien
1. `supabase/functions/import-contacts-csv/index.ts` — `person_id` bei allen Sub-Inserts setzen

