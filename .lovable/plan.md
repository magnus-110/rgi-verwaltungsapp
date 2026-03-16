

## Plan: Drei Anpassungen (Nova Text, Erklaerungsvideo, DSGVO-Pruefung)

### 1. "KI Assistentin" statt "KI Assistent"

Textaenderung in drei Dateien:
- `src/components/chat/WelcomeScreen.tsx` (Zeile 40): "Nova - RGI KI Assistentin"
- `src/pages/tenant/Dashboard.tsx` (Zeile 228): "RGI KI Assistentin"
- `src/pages/weg-owner/Dashboard.tsx` (Zeile 186): "RGI KI Assistentin"

### 2. Erklaerungsvideo als zweiter Schritt im Onboarding-Dialog

Nach dem Akzeptieren der AGB und Datenschutzerklaerung wird ein zweiter Schritt angezeigt, der das Erklaerungsvideo vorschlaegt.

**Ablauf:**
1. Schritt 1 (bestehend): AGB und Datenschutz akzeptieren - Button "Akzeptieren und fortfahren"
2. Schritt 2 (neu): Erklaerungsvideo-Vorschlag mit Thumbnail und Link
   - Das hochgeladene Bild wird als Thumbnail angezeigt (klickbar)
   - YouTube-Link: https://youtube.com/shorts/Ccw9pb_Y6XY?si=ehjPVhZ5bVTikQul
   - Button "Video ansehen" (oeffnet YouTube) und "Ueberspringen" (schliesst Dialog)

**Technische Umsetzung in `src/components/TermsAcceptanceDialog.tsx`:**
- Neuer State `step` (1 oder 2)
- Nach erfolgreichem Speichern der Terms-Akzeptanz wechselt der Dialog zu Schritt 2
- Schritt 2 zeigt das Thumbnail-Bild und zwei Buttons
- Das hochgeladene Bild wird nach `public/images/` kopiert

### 3. DSGVO-Pruefung: Nova Dokumentenzugriff

**Ergebnis der Pruefung:**

Die Dokumentenzugriffe in der `chat-with-ai` Edge Function sind korrekt geschuetzt:

- **Persoenliche Dateien**: Gefiltert nach `assigned_user_id = userId` -- nur eigene Dateien
- **Gebaeude-Dateien**: Gefiltert nach `building_id` des Nutzers UND `assigned_user_id IS NULL` -- nur allgemeine Gebaeudedateien des eigenen Gebaeudes
- **Gebaeudedokumente (RAG)**: Gefiltert nach den Gebaeude-IDs des Nutzers (bei Mietern: `profile.building_id`, bei WEG-Eigentuemern: `weg_owner_buildings`)
- **RLS-Policies**: Zusaetzlich auf Datenbankebene abgesichert

**Ein kleiner Verbesserungsvorschlag:** Die Wissensdokumente (`chatbot_knowledge_documents`) werden aktuell nicht nach `management_mode` gefiltert. Das bedeutet, ein Mieter koennte theoretisch auch WEG-spezifische Wissensdokumente als Kontext erhalten (und umgekehrt). Dies ist kein direktes DSGVO-Problem (da es sich um allgemeine, nicht personenbezogene Wissensinhalte handelt), aber fuer saubere Datentrennung sollte ein Filter ergaenzt werden.

**Aenderung in `supabase/functions/chat-with-ai/index.ts`** (Zeile 457-461):
- Filter `.eq('management_mode', managementMode)` zur Wissensdokumente-Abfrage hinzufuegen

### Zusammenfassung der Dateiaenderungen

| Datei | Aenderung |
|-------|-----------|
| `src/components/chat/WelcomeScreen.tsx` | "Assistentin" |
| `src/pages/tenant/Dashboard.tsx` | "Assistentin" |
| `src/pages/weg-owner/Dashboard.tsx` | "Assistentin" |
| `src/components/TermsAcceptanceDialog.tsx` | Zweistufiger Dialog mit Video-Vorschlag |
| `supabase/functions/chat-with-ai/index.ts` | management_mode Filter fuer Wissensdokumente |
| Bild kopieren nach `public/images/` | Thumbnail fuer Video |

