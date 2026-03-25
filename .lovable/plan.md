

# Plan: KI-Textverbesserung fuer E-Mails + Prioritaet in E-Mail-Liste

## 1. Edge Function: `improve-email-text`

Neue Edge Function mit Mistral API (wie `enhance-prompt` und `chat-with-ai`).

- Modell: `mistral-small-latest`
- System-Prompt: Professioneller Hausverwaltungs-E-Mail-Assistent, der den Text eloquenter und professioneller formuliert, Inhalt und Bedeutung beibehaelt
- Empfaengt `bodyText` und optional `subject`
- Gibt verbesserten Text zurueck (non-streaming)
- Nutzt vorhandenen `MISTRAL_API_KEY`

## 2. UI: Suggestion-Widget im FloatingComposeWindow

Inspiriert vom bestehenden `PromptEnhancerSuggestion`-Pattern:

- **Wand2-Button** neben dem "Nachricht"-Label (disabled bei weniger als 10 Zeichen)
- Bei Klick: Edge Function aufrufen, Loading-State anzeigen
- **Suggestion-Box** erscheint unterhalb des Textfeldes:
  - Zeigt den verbesserten Text in einem editierbaren Textarea (wie bei Nova/PromptEnhancerSuggestion)
  - Buttons: "Uebernehmen" (Check-Icon) und "Verwerfen" (X-Icon)
  - Bei "Uebernehmen": Text wird in `bodyText` eingesetzt
  - Bei Klick in den Text: direkt editierbar
- Gleiche Logik auch in `ComposeEmailDialog.tsx` falls noch verwendet

## 3. Prioritaet in der E-Mail-Liste

- In `Inbox.tsx` Zeile 629: Bedingung `=== "hoch"` entfernen
- Alle Prioritaeten als Badge anzeigen:
  - `hoch` → rot (destructive)
  - `mittel` → gelb/orange (outline mit Farbe)
  - `niedrig` → grau (secondary)

## Dateien

| Datei | Aenderung |
|---|---|
| `supabase/functions/improve-email-text/index.ts` | Neue Edge Function (Mistral) |
| `supabase/config.toml` | Funktion registrieren |
| `src/components/email/FloatingComposeWindow.tsx` | Wand2-Button + Suggestion-Widget |
| `src/pages/Inbox.tsx` | Prioritaets-Badges fuer alle Stufen |

