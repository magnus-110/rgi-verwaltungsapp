# Step 1 Onboarding — Final Plan

## Ziel
1. **Hauptansprechpartner-UI** im Radio-Card-Design (siehe Screenshot)
2. **Vorausfüllen** mit bereits hinterlegten Kontaktdaten
3. **Gebäudespezifische Überschreibung** statt globaler Mutation

---

## 1. Datenmodell-Verständnis (bestätigt aus DB)

| Ebene | Tabelle | Inhalt |
|---|---|---|
| **Global** (gilt überall) | `contacts` | `address_street`, `address_zip`, `address_city`, `notes` |
| **Global** | `contact_persons` | Name, `email`, `phone`, `onboarding_expectations` |
| **Global** | `contact_phones`, `contact_emails` | Mehrfacheinträge mit `note` |
| **Global** | `contact_bank_accounts` | IBAN, SEPA-Ref |
| **Gebäude-spezifisch** | `contact_building_assignments` | `unit_number`, `notes`, `bank_account_id`, etc. |

→ Aktuell gibt es **keine** Spalten in `contact_building_assignments` für gebäudespezifische **Adresse / Telefon / E-Mail / Hauptansprechpartner**.

---

## 2. Neue Spalten in `contact_building_assignments` (Migration)

Damit Änderungen während des Onboardings **nur für dieses Gebäude** wirken — nicht global —, brauchen wir Override-Felder:

```sql
ALTER TABLE public.contact_building_assignments
  ADD COLUMN address_street_override text,
  ADD COLUMN address_zip_override text,
  ADD COLUMN address_city_override text,
  ADD COLUMN phones_override jsonb,        -- [{number, note}]
  ADD COLUMN emails_override jsonb,        -- [{address}]
  ADD COLUMN iban_override text,
  ADD COLUMN primary_contact_self boolean, -- true = Eigentümer selbst
  ADD COLUMN primary_contact_other jsonb,  -- {name, relation, street, zip, city, phone, email}
  ADD COLUMN expectations_override text;
```

**Logik:** Wenn ein Override-Feld gesetzt ist, gilt es **für dieses Gebäude**. Ansonsten Fallback auf den globalen Wert in `contacts` / `contact_persons`.

---

## 3. Edge Function: neue `prefill-onboarding-step1`

Lädt **vorhandene Daten** aus mehreren Quellen und mergt sie zu einem Step1-Objekt:

```
1. Lade contact_building_assignments (für dieses building+contact)
   → falls Overrides vorhanden, bevorzugen
2. Sonst Fallback:
   - contacts.address_street/zip/city
   - contact_phones (alle, mit note)
   - contact_emails (alle)
   - contact_bank_accounts.iban (default)
   - contact_persons[primary].onboarding_expectations
```

Frontend ruft das beim Öffnen von Step 1 auf und hydriert das Formular.

---

## 4. Edge Function: `submit-onboarding-step` erweitern

Bei `step === 1` schreibt sie **ausschließlich** in `contact_building_assignments` (Overrides):

```typescript
await admin.from("contact_building_assignments").update({
  address_street_override: payload.street,
  address_zip_override: payload.zip,
  address_city_override: payload.city,
  phones_override: payload.phones,
  emails_override: payload.emails,
  iban_override: payload.iban?.replace(/\s/g, "").toUpperCase(),
  primary_contact_self: payload.contact_self,
  primary_contact_other: payload.contact_self === false ? payload.contact_other : null,
  expectations_override: payload.expectations || null,
}).eq("contact_id", contactId).eq("building_id", building_id);
```

→ **`contacts` / `contact_persons` / `contact_phones` / `contact_emails` / `contact_bank_accounts` werden NICHT angefasst.** Globale Stammdaten bleiben unberührt.

Admin sieht später im Building-Hub → People-Tab den Override und kann entscheiden, ob er ihn ins globale Profil übernimmt.

---

## 5. UI-Refactor `Step1Stammdaten.tsx`

### a) Hauptansprechpartner als Radio-Cards (Screenshot-Design)
- Zwei Karten nebeneinander (`grid-cols-2`)
- Aktiv: `border-primary`, `bg-primary/5`, oranger Radio-Indicator (Außenring + innerer Punkt)
- Inaktiv: `border-border/60`, `bg-card`, leerer Kreis
- Beim Wechsel auf "Andere Person" klappt das Subformular auf

### b) Prefill-Logik
```tsx
useEffect(() => {
  if (!buildingId || !contactId) return;
  supabase.functions.invoke("prefill-onboarding-step1", {
    body: { building_id: buildingId }
  }).then(({ data }) => {
    if (data) onChange({ ...data, ...currentValue }); // user-Edits gewinnen
  });
}, [buildingId]);
```

### c) Hinweis-Banner (wenn vorausgefüllt)
> *"Wir haben Ihre bisher hinterlegten Daten geladen. Änderungen gelten nur für dieses Gebäude."*

---

## 6. Globale Anzeige-Helfer (optional, nice-to-have)

Eine View `v_contact_building_effective` die für jede Assignment die effektiven Daten liefert (Override > Global). Damit kann das Admin-UI später konsistent „die echte Adresse für Haus X" anzeigen.

→ **Für diese Iteration erst mal nicht nötig** — kann nachgeliefert werden, wenn das Building-Hub-UI das anzeigen soll.

---

## Files

**Migration (neu):** Spalten in `contact_building_assignments`
**Neu:** `supabase/functions/prefill-onboarding-step1/index.ts`
**Editiert:** `supabase/functions/submit-onboarding-step/index.ts` (Step 1 → Overrides schreiben, nichts global mutieren)
**Editiert:** `src/components/onboarding/steps/Step1Stammdaten.tsx` (Radio-Cards + Prefill-Hook + Hinweis)
**Editiert:** `src/components/onboarding/OnboardingWizardModal.tsx` (Prefill beim Step-1-Mount triggern, falls dort orchestriert)

---

## Zusammengefasste Garantien
- ✅ Nutzer sieht eigene Daten vorausgefüllt
- ✅ Änderungen wirken **nur** für das aktuelle Gebäude
- ✅ Globale `contacts`-Stammdaten bleiben unverändert
- ✅ Admin kann später Overrides ins globale Profil heben (separater Workflow)
- ✅ Strikte relationale Vernetzung: jeder Override hängt an `building_id` + `contact_id`