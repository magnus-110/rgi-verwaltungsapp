## Ziel

Die Flags `is_billing_relevant` (abrechnungsrelevant) und `is_wirtschaftsplan_relevant` (wirtschaftsplanrelevant) sollen nicht mehr nur im Kontenrahmen, sondern direkt am Punkt der Verwendung änderbar sein:

- **Buchungen-Seite** → Toggle pro Konto für **Abrechnungsrelevanz**
- **Planung & Berichte / Manueller Wirtschaftsplan** → Toggle pro Konto für **Wirtschaftsplanrelevanz**

Außerdem: Default-Verhalten ändern – jedes Konto mit Bewegung (Saldo ≠ 0) wird automatisch als relevant betrachtet, kann aber an beiden Stellen manuell überschrieben werden.

---

## Konzept

### Default-Logik (neu)
Statt strikt nach dem DB-Flag `is_billing_relevant` / `is_wirtschaftsplan_relevant` zu filtern, gilt:

- **Effektive Relevanz** = `Konto hat Saldo ≠ 0 im Wirtschaftsjahr` ODER `manuell aktiviert`
- Manuell deaktivierte Konten (auch wenn Saldo ≠ 0) werden ausgeblendet/markiert
- Manuell aktivierte Konten ohne Saldo erscheinen, wenn der Nutzer das wünscht

### UI-Pattern
An beiden Stellen (Buchungen + Wirtschaftsplan-Editor) gibt es:
1. Eine Liste aller Konten des Gebäudes mit Saldo-Spalte
2. Pro Zeile ein **Switch** „Relevant"
3. Filter-Tabs/Buttons: **Alle** | **Nur relevante** | **Nur mit Saldo**
4. Speichern aktualisiert die DB-Flags direkt (so wirkt es sich konsistent in PDFs etc. aus)

---

## Umsetzung

### 1. Buchungen-Seite (`BookingsTab.tsx`)
- Neuer Bereich **„Konten-Übersicht"** (collapsible Card oben oder eigener Sub-Tab)
- Tabelle: Kontonummer | Bezeichnung | Saldo Wirtschaftsjahr | Switch „Abrechnungsrelevant"
- Switch togglet `chart_of_accounts.is_billing_relevant` direkt
- Saldo-Berechnung via bestehendem `sumForAccount`-Pattern (bank-zentrische Aggregation)
- Filter: „Alle anzeigen / Nur mit Saldo / Nur abrechnungsrelevant"

### 2. Manueller Wirtschaftsplan (`ManualEconomicPlanEditor.tsx`)
- Aktuelle Query (Zeile 90-102) filtert hart auf `is_wirtschaftsplan_relevant=true` → entfernen
- Stattdessen: alle Konten des Gebäudes laden, kombiniert mit Vorjahres-Saldo
- Neue Spalte **„WP-relevant"** mit Switch im Editor-Grid
- Default-Auswahl beim Anlegen: alle Konten mit Vorjahres-Saldo ≠ 0 ODER bereits gesetztem Flag
- Switch persistiert `is_wirtschaftsplan_relevant`
- Filter-Toggle oberhalb: „Nur relevante" (Standard) / „Alle anzeigen"

### 3. Konsistenz / Backwards-Compat
- Migration nicht nötig – Flags existieren bereits
- Der bestehende Kontenrahmen-Tab bleibt unverändert (zentrale Pflege weiter möglich)
- React-Query Invalidation: `["chart-of-accounts"]`, `["wp-accounts-manual"]`, `["bookings*"]` nach jedem Toggle

---

## Technische Details

**Geänderte Dateien:**
- `src/components/finance/BookingsTab.tsx` – neue Konten-Übersicht + Toggle-Logik
- `src/components/finance/ManualEconomicPlanEditor.tsx` – Query erweitern, Spalte + Filter
- ggf. neuer Helper `src/components/finance/lib/accountRelevance.ts` für die Default-Logik (Saldo-basiert)

**Mutation-Pattern (beide Stellen identisch):**
```ts
const toggleRelevance = async (accountId: string, field: 'is_billing_relevant'|'is_wirtschaftsplan_relevant', value: boolean) => {
  await supabase.from("chart_of_accounts").update({ [field]: value }).eq("id", accountId);
  queryClient.invalidateQueries(...);
};
```

**Default-Bestimmung (Saldo-basiert):**
```ts
const isEffectivelyRelevant = (account, balance) =>
  account[flagField] === true || Math.abs(balance) > 0.005;
```

---

## Offene Punkte

Ich gehe davon aus:
- Toggle wirkt **global** (beeinflusst auch PDFs/Abrechnung), nicht nur die aktuelle Ansicht – das war dein Wunsch laut "weil an diesen zwei Positionen ist es ja wichtig"
- Default-Sicht: **„Nur relevante"** (also nicht alle ~80 Konten zeigen, sondern nur die mit Saldo + manuell gesetzte)

Falls du lieber willst, dass die Toggles **nur lokal** (z.B. nur für diesen einen Wirtschaftsplan) gelten, müssten wir eine Junction-Table einführen – sag Bescheid, dann passe ich den Plan an.