# Vorlage „Nebenkostenabrechnung" – Platzhalterliste

Format: **docxtemplater** (geschweifte Klammern `{ … }`).
Wandlung Word → PDF: **CloudConvert**.
Datei-Name in Storage `templates/`: `Vorlage_Nebenkostenabrechnung.docx`.

Quelle aller Daten ist `service_orders.input_snapshot` (siehe `NebenkostenTool.tsx → handleBuy`)
plus angereicherte Stamm­daten (Vermieter, Wohnung, Liegenschaft), die die
Edge Function `generate-service-document` zusätzlich aus der DB nachlädt.

---

## 1. Kopfdaten / Allgemein

| Platzhalter            | Quelle                                       | Beispiel              |
| ---------------------- | -------------------------------------------- | --------------------- |
| `{rechnung_datum}`     | heutiges Datum bei Generierung               | 16.06.2026            |
| `{abrechnung_nr}`      | `service_orders.id` (kurz) oder Sequenz      | NK-2025-000123        |
| `{fiscal_year}`        | `input_snapshot.fiscal_year`                 | 2025                  |
| `{period_from}`        | `input_snapshot.period.from` (dd.mm.yyyy)    | 01.01.2025            |
| `{period_to}`          | `input_snapshot.period.to`                   | 31.12.2025            |

## 2. Vermieter / Eigentümer (Aussteller der Abrechnung)

Aus `contact_building_assignments` → `contacts` (assignment_id im snapshot).

| Platzhalter             | Quelle                                          |
| ----------------------- | ----------------------------------------------- |
| `{vermieter_name}`      | `contacts.display_name`                          |
| `{vermieter_strasse}`   | `contacts.street`                                |
| `{vermieter_plz_ort}`   | `contacts.postal_code` + `contacts.city`         |
| `{vermieter_email}`     | erste `contact_emails.email`                     |
| `{vermieter_telefon}`   | erste `contact_phones.phone`                     |
| `{vermieter_iban}`      | erste `contact_bank_accounts.iban` (optional)    |

## 3. Mieter

Aus `input_snapshot.tenant` und `service_tenancies`.

| Platzhalter            | Quelle                                            |
| ---------------------- | ------------------------------------------------- |
| `{mieter_name}`        | `tenant.name`                                     |
| `{mieter_adresse}`     | `tenant.address` (mehrzeilig erlaubt)             |
| `{mieter_personen}`    | `tenant.persons`                                  |
| `{mieter_einzug}`      | `tenant.move_in` (dd.mm.yyyy, leer = „—")         |
| `{mieter_auszug}`      | `tenant.move_out` (dd.mm.yyyy, leer = „—")        |
| `{mieter_monate}`      | `tenant.months_in_period`                         |
| `{vorauszahlung_monatlich}` | `tenant.prepayment_monthly` (€)              |
| `{vorauszahlung_gesamt}`    | `tenant.prepayment_total` (€)                |

## 4. Wohnung / Liegenschaft

Aus `contact_building_assignments` + `buildings`.

| Platzhalter             | Quelle                                       |
| ----------------------- | -------------------------------------------- |
| `{wohnung_nr}`          | `assignments.unit_number`                    |
| `{wohnung_qm}`          | `assignments.living_area_sqm`                |
| `{wohnung_mea}`         | MEA aus `contact_building_shares` (share_type=mea) |
| `{liegenschaft_name}`   | `buildings.name`                             |
| `{liegenschaft_adresse}`| `buildings.street`, `buildings.postal_code`, `buildings.city` |

## 5. Kostenpositionen (Loop)

Aus `input_snapshot.positions[]` (umlagefähige Konten aus der finalisierten
Abrechnung) **plus** `input_snapshot.extra_costs[]` (manuell erfasste
Eigentümer-Kosten, z. B. Versicherung, Grundsteuer, die nicht über die WEG
abgerechnet werden).

docxtemplater Loop-Syntax:

```
{#positionen}
  {konto_nr}  {bezeichnung}  {gesamt_eur}  {verteilerschluessel}  {anteil_eur}
{/positionen}
```

Erwartetes Array `positionen` (Edge-Function bildet es aus `positions` + `extra_costs`):

| Feld                   | Quelle                                      |
| ---------------------- | ------------------------------------------- |
| `{konto_nr}`           | `position.account_number` / `EX` bei Extra  |
| `{bezeichnung}`        | `position.account_name` / `extra.label`     |
| `{gesamt_eur}`         | `position.total_amount` (Liegenschaft)      |
| `{verteilerschluessel}`| `position.distribution_key` (mea/qm/personen/einheit) |
| `{anteil_eur}`         | `position.share_amount` bzw. `extra.amount` |
| `{anteil_eur_text}`    | optional: deutsche Zahl mit `.` als Tausender |

## 6. Summen

| Platzhalter                | Berechnung (Edge Function)                                  |
| -------------------------- | ----------------------------------------------------------- |
| `{summe_umlage}`           | Σ `positions.share_amount`                                  |
| `{summe_extra}`            | Σ `extra_costs.amount`                                      |
| `{summe_gesamt}`           | `summe_umlage + summe_extra`                                |
| `{summe_vorauszahlungen}`  | `tenant.prepayment_total`                                   |
| `{saldo}`                  | `summe_gesamt − summe_vorauszahlungen`                      |
| `{saldo_label}`            | „Nachzahlung" wenn > 0, sonst „Guthaben"                    |
| `{saldo_abs}`              | `|saldo|`                                                   |

## 7. Hinweise & Recht

| Platzhalter         | Inhalt                                                            |
| ------------------- | ----------------------------------------------------------------- |
| `{einspruchsfrist}` | „12 Monate ab Zugang dieser Abrechnung (§ 556 Abs. 3 BGB)"        |
| `{agb_version}`     | `service_orders.agb_version` (z. B. „2.0")                        |
| `{erzeugt_am}`      | Zeitstempel der Erstellung                                        |
| `{order_id}`        | `service_orders.id`                                               |

---

## Konvention für die Edge Function

In `generate-service-document` wird ein Render-Objekt gebaut:

```ts
const data = {
  rechnung_datum: fmtDate(new Date()),
  abrechnung_nr:  shortId(order.id),
  fiscal_year:    snap.fiscal_year,
  period_from:    fmtDate(snap.period.from),
  period_to:      fmtDate(snap.period.to),

  vermieter_name, vermieter_strasse, vermieter_plz_ort,
  vermieter_email, vermieter_telefon, vermieter_iban,

  mieter_name:    snap.tenant.name,
  mieter_adresse: snap.tenant.address,
  mieter_personen:snap.tenant.persons,
  mieter_einzug:  fmtDate(snap.tenant.move_in),
  mieter_auszug:  fmtDate(snap.tenant.move_out),
  mieter_monate:  snap.tenant.months_in_period,
  vorauszahlung_monatlich: eur(snap.tenant.prepayment_monthly),
  vorauszahlung_gesamt:    eur(snap.tenant.prepayment_total),

  wohnung_nr, wohnung_qm, wohnung_mea,
  liegenschaft_name, liegenschaft_adresse,

  positionen: [
    ...snap.positions.map(p => ({
      konto_nr: p.account_number,
      bezeichnung: p.account_name,
      gesamt_eur: eur(p.total_amount),
      verteilerschluessel: p.distribution_key,
      anteil_eur: eur(p.share_amount),
    })),
    ...snap.extra_costs.map(e => ({
      konto_nr: "EX",
      bezeichnung: e.label,
      gesamt_eur: eur(e.amount),
      verteilerschluessel: "direkt",
      anteil_eur: eur(e.amount),
    })),
  ],

  summe_umlage:          eur(sumShare),
  summe_extra:           eur(sumExtra),
  summe_gesamt:          eur(sumShare + sumExtra),
  summe_vorauszahlungen: eur(snap.tenant.prepayment_total),
  saldo:                 eur(saldo),
  saldo_label:           saldo > 0 ? "Nachzahlung" : "Guthaben",
  saldo_abs:             eur(Math.abs(saldo)),

  einspruchsfrist: "12 Monate ab Zugang dieser Abrechnung (§ 556 Abs. 3 BGB)",
  agb_version: order.agb_version,
  erzeugt_am: fmtDateTime(new Date()),
  order_id: order.id,
};
```

Word-Vorlage: `templates/Vorlage_Nebenkostenabrechnung.docx` in den
Supabase-Storage-Bucket `templates` legen (privat). Die Edge Function lädt
sie via Signed URL, rendert mit `docxtemplater`, konvertiert per CloudConvert
nach PDF und legt das Ergebnis unter
`service-documents/{user_id}/{order_id}.pdf` ab.
