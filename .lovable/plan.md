## Drei zusammenhängende Probleme

### 1. AGB-Dialog vor Onboarding-Wizard zeigen
Aktuell rendert `WegOwnerLayout` `<TermsAcceptanceDialog>` **und** `<OnboardingFAB>` parallel. Der FAB öffnet den Wizard automatisch beim Mount (`useEffect` in `OnboardingFAB.tsx` Zeile 18-23), unabhängig davon, ob die AGB schon akzeptiert sind. Beide Dialoge erscheinen damit gleichzeitig.

**Fix:** In `src/components/WegOwnerLayout.tsx` den `<OnboardingFAB />` nur rendern, wenn `termsAccepted === true`. Solange noch geladen wird (`null`), nichts rendern → kein Flicker.

---

### 2. Hans van Praag wurde als `tenant` statt `weg_owner` angelegt
**Diagnose:**
- `profiles.role = 'tenant'` (er sieht das `TenantLayout`, kein FAB)
- `contact_building_assignments.role_in_building = 'eigentuemer'` (im Beispielgebäude korrekt als Eigentümer zugewiesen)

**Ursache:** In `supabase/functions/invite-contact-user/index.ts` Zeile 103 wird die Profile-Rolle stur aus dem `management_mode`-Parameter abgeleitet, der vom aufrufenden Dialog kommt:
```ts
const role = management_mode === 'weg' ? 'weg_owner' : 'tenant'
```
Hans wurde offenbar zuerst von einer **Miet-Liegenschaft** aus eingeladen → Profile-Rolle blieb `tenant`, auch nachdem er später in einer WEG als Eigentümer zugewiesen wurde.

**Fix in `invite-contact-user`:** Die Rolle nicht mehr nur aus `management_mode` ableiten, sondern aus den **tatsächlichen Assignments** des Kontakts:
- Wenn der Kontakt in **irgendeiner** Liegenschaft `role_in_building IN ('eigentuemer','beirat')` hat → `weg_owner`
- Sonst → `tenant`

Das funktioniert für Erst-Einladung wie auch für nachträgliche Aufrüstung (Mieter wird später Eigentümer).

**Sofort-Fix für Hans (Daten-Update):** `profiles.role = 'weg_owner'` setzen für `user_id = ef1b58d8-085e-4182-b881-ebf456aabcc8` per Migration. Damit er beim nächsten Login das richtige Layout + Wizard sieht.

---

### 3. (Bonus) Profile-Rolle automatisch upgraden, wenn ein bestehender Account einer WEG zugewiesen wird
Damit das Problem nicht erneut auftritt, wenn jemand erst Mieter und später Eigentümer wird:

In `AssignContactDialog.tsx` nach dem Insert in `contact_building_assignments` (Zeile 200): Wenn die neue Zuweisung `eigentuemer`/`beirat` ist und der Kontakt einen `user_id` hat → `profiles.role` auf `weg_owner` setzen. Edge Function ist dafür nicht zwingend nötig — geht direkt mit RLS-konformem Update über die anonyme Client-Session, sofern Admin (sicherer wäre eine kleine RPC oder Erweiterung der `invite-contact-user`-Logik, die ohnehin angefasst wird).

Saubere Variante: Beim Aufruf von `invite-contact-user` immer die Rolle anhand der Assignments neu bestimmen, auch wenn `authUserId` schon existiert (Zeile 108-116 der Edge Function). Das deckt alle Fälle ab.

---

## Zu ändernde Dateien
1. `src/components/WegOwnerLayout.tsx` — FAB hinter `termsAccepted`-Gate
2. `supabase/functions/invite-contact-user/index.ts` — Rolle aus Assignments ableiten statt aus `management_mode`
3. **Migration:** `UPDATE profiles SET role='weg_owner' WHERE user_id='ef1b58d8-085e-4182-b881-ebf456aabcc8'` (Sofort-Fix für Hans)

## Was nicht angefasst wird
- Der Wizard selbst, das `useOnboardingContext`-Hook und die Datenbankschemata bleiben unverändert.
- `management_mode` bleibt als Parameter erhalten — er wird nur nicht mehr für die Profile-Rolle verwendet, sondern weiterhin für `building_id` im Profil bei Mietverwaltungen.
