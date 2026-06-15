## Ziel

Eine geführte "Erste Schritte"-Tour für den Eigentümer-Bereich (`/weg-owner/*`), die einem 60-jährigen Nutzer ohne Vorkenntnisse Schritt für Schritt erklärt, was er auf jeder Seite sieht und tun kann. Beim ersten Login automatisch, später jederzeit über einen großen "Hilfe"-Button wieder aufrufbar.

## Konzept

**Kombi aus Spotlight-Tour + optionalen Mini-Animationen** — senior-tauglich (große Schrift, ruhige Sprache, „Weiter"/„Zurück"/„Überspringen" als große Buttons, niemals nur Icons).

```text
┌───────────────────────────────────────────────────────┐
│  abgedunkelte Seite (echte UI dahinter sichtbar)      │
│                                                       │
│      ┏━━━━━━━━━━━━━━━━━━━┓                            │
│      ┃  echtes Element    ┃◀── Spotlight (Aussparung) │
│      ┗━━━━━━━━━━━━━━━━━━━┛                            │
│           ▲                                           │
│   ┌───────┴────────────────────────────┐              │
│   │ Schritt 2 von 6                    │              │
│   │ Hier sehen Sie Ihre Versammlungen. │              │
│   │ Klicken Sie auf einen Eintrag, um  │              │
│   │ die Einladung zu öffnen.           │              │
│   │ ▶ Kurzes Video ansehen (optional)  │              │
│   │ [ Zurück ]   [ Überspringen ]  [ Weiter ] │       │
│   └────────────────────────────────────┘              │
└───────────────────────────────────────────────────────┘
```

## Inhalt pro Seite (Tour-Skripte)

Pro Route eine eigene Schritt-Liste, kurz und in Sie-Form:

- **Dashboard** (`/weg-owner`) — Begrüßung, Erklärung der Kacheln (Liegenschaft, nächste Versammlung, Postfach, Hilfe-Chat), wo finde ich was.
- **Versammlungen** (`/weg-owner/meetings`) — Liste, Status-Punkt, Einladung öffnen, Vollmacht erteilen, Live-Abstimmung.
- **Beschlüsse** (`/weg-owner/resolutions`) — grüne/rote Badges, Suche, Beschluss-Detail.
- **Berichte** (`/weg-owner/reports`) — Abrechnung, Wirtschaftsplan, Vermögensbericht — wo herunterladen.
- **Dokumente** (`/weg-owner/files`) — Ordnerbaum, Vorschau, Download.
- **Forum** (`/weg-owner/forum`) — Beiträge lesen/schreiben, Antworten.
- **Hilfe-Chat** (`/weg-owner/chatbot`) — Frage stellen, Beispielfragen.
- **Kassenprüfung** (`/weg-owner/kassenpruefung`) — Tabs, Signatur (nur falls Prüfer).
- **Einstellungen** (`/weg-owner/settings`) — Passwort ändern, Benachrichtigungen.

Globale Erstbenutzungs-Tour (Layout-Ebene): Sidebar/Navigation, Hilfe-Button, Logout.

Pro Schritt optional ein **20–40 s Erklärclip** (Lottie/MP4) — wird per "▶ Video ansehen" geladen, läuft nicht automatisch (Datenvolumen, Reizüberflutung).

## Technische Umsetzung

**Tour-Engine:** [`driver.js`](https://driverjs.com) (≈5 kB, framework-agnostisch, gute Tastatur- und A11y-Unterstützung, passt zu Tailwind/Radix). Eigener React-Wrapper `useGuidedTour(steps)`.

**Dateien (neu):**
```
src/components/weg-owner/onboarding/
├── GuidedTourProvider.tsx       # Kontext + Steuerung (start/stop/resume)
├── useGuidedTour.ts             # Hook: registriert Schritte pro Seite
├── tours/
│   ├── global.ts                # Layout/Sidebar
│   ├── dashboard.ts
│   ├── meetings.ts
│   ├── resolutions.ts
│   ├── reports.ts
│   ├── files.ts
│   ├── forum.ts
│   ├── chatbot.ts
│   ├── cash-audit.ts
│   └── settings.ts
├── TourStepCard.tsx             # Senior-taugliche Sprechblase (große Schrift, Buttons)
├── TourMediaPlayer.tsx          # Lazy-loaded Lottie/MP4-Player
└── HelpButton.tsx               # schwebender Button "?  Hilfe"
```

**Element-Anker:** stabile `data-tour="meetings-list"`-Attribute werden in die bestehenden Seiten eingefügt — keine Layout-Änderung, nur zusätzliche Attribute. Die Tour-Schritte referenzieren diese Selektoren.

**Wiedererkennung / Persistenz:**
- Neue Spalte `weg_owner_tour_state jsonb default '{}'::jsonb` in `profiles` (oder neue Tabelle `user_tour_progress`, siehe unten).
- Struktur: `{ "global": "completed", "meetings": "completed", "dashboard": "skipped", "version": 1 }`.
- Erstlogin (kein Eintrag) → globale Tour startet automatisch nach Login auf Dashboard.
- Beim ersten Besuch jeder weiteren Seite startet die seitenspezifische Mini-Tour automatisch einmal.
- Hilfe-Button (unten rechts, fix, groß, beschriftet) öffnet ein Menü „Tour erneut starten" mit allen Tour-Abschnitten.
- Wenn wir Tour-Inhalte aktualisieren, erhöhen wir `version`, sodass der Nutzer einmalig die neuen Schritte sieht („Neu in der App").

**Datenmodell:** Da im Projekt das Legacy-User-System entfernt ist und Profile minimal sind, lege ich eine separate Tabelle an, statt `profiles` zu erweitern:

```sql
public.user_tour_progress (
  user_id uuid pk references auth.users,
  progress jsonb not null default '{}'::jsonb,
  updated_at timestamptz
)
```
RLS: nur eigener Datensatz les-/schreibbar. GRANTs für `authenticated` und `service_role`.

**A11y / Senior-Tauglichkeit:**
- Mindest-Schriftgröße 18 px in der Sprechblase, hoher Kontrast, Buttons ≥ 44 px hoch.
- Tastatur: Enter = Weiter, Esc = Schließen (mit Rückfrage „Tour beenden? Sie können sie jederzeit über den Hilfe-Button wieder starten").
- ARIA-Live-Region für jeden Tour-Schritt, damit Screenreader vorlesen.
- „Diese Tour nicht mehr automatisch zeigen" Checkbox am Schluss.

**Mini-Videos:** Slot vorbereiten, aber zunächst nur 2–3 Pilot-Clips (Dashboard, Versammlungen, Abrechnung herunterladen) als Lottie-JSON in `src/assets/tours/`. Restliche Schritte rein textuell — Videos können wir Stück für Stück nachliefern, ohne Code-Änderung (nur JSON-Datei dazu).

## Umfang dieser Iteration

1. DB-Migration `user_tour_progress` (Tabelle + RLS + GRANTs).
2. `driver.js` installieren, `GuidedTourProvider` in `WegOwnerLayout` einhängen.
3. Schwebenden Hilfe-Button + Menü.
4. Globale Tour (Layout/Sidebar) + Dashboard-Tour + Versammlungen-Tour vollständig.
5. Restliche Seiten: Schritt-Gerüst + `data-tour`-Attribute, Inhalt kurz gehalten — sind danach trivial erweiterbar.
6. 1 Pilot-Lottie-Clip „So laden Sie Ihre Abrechnung herunter" als Beispiel-Integration.

## Nicht in diesem Schritt

- Vollständige Video-Produktion für alle Seiten (kommt iterativ, ohne Code-Änderung).
- Tour für Mieter-Bereich (`/tenant/*`) — bewusst ausgeklammert, Architektur ist aber wiederverwendbar.
- Mehrsprachigkeit (aktuell Deutsch-only, passend zur App).

## Risiken

- `driver.js` muss mit lazy-geladenen Komponenten/Routenwechseln umgehen — Provider wartet pro Step bis Selektor sichtbar (Polling mit Timeout, sonst Step überspringen).
- Realtime-UI (z. B. Live-Abstimmung) ändert sich während der Tour — wir markieren solche Schritte als „statisch erklärend" (kein Highlight auf flüchtige Elemente).
