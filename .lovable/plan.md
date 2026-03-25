

# Plan: KI-Vorschlag resizable + BCC-Feld

## Änderungen

### 1) KI-Vorschlag Textarea resizable machen (`FloatingComposeWindow.tsx`)
- Zeile 460: `resize-none` durch `resize-y` ersetzen, damit das KI-Vorschlagsfeld vertikal vergrößert werden kann.

### 2) BCC-Feld hinzufügen

**Context (`ComposeEmailContext.tsx`):**
- `bcc: string` zum `ComposeState` Interface und `defaultState` hinzufügen.

**Floating Compose (`FloatingComposeWindow.tsx`):**
- BCC-Input nach dem CC-Feld einfügen (gleicher Stil).
- In `handleSend` die BCC-Adressen parsen und als `bcc` Parameter an die Edge Function senden.

**Compose Dialog (`ComposeEmailDialog.tsx`):**
- BCC-Input nach CC einfügen.
- In `handleSend` ebenfalls `bcc` mitsenden.

**Edge Function (`send-email/index.ts`):**
- Bereits implementiert: `bcc` wird aus dem Request-Body gelesen und an nodemailer weitergegeben. Keine Änderung nötig.

## Betroffene Dateien
- `src/contexts/ComposeEmailContext.tsx` (bcc zum State)
- `src/components/email/FloatingComposeWindow.tsx` (resize-y + BCC-Feld)
- `src/components/email/ComposeEmailDialog.tsx` (BCC-Feld)

