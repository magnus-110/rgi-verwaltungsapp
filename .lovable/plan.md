

# Plan: fetch-emails Edge Function reparieren

## Problem
"Failed to send a request to the Edge Function" — die Funktion wurde kürzlich geändert und muss neu deployed werden. Zusätzlich fehlen in den CORS-Headers einige Supabase-Client-Header, die neuere SDK-Versionen mitsenden.

## Lösung

### 1) CORS-Headers aktualisieren
In `supabase/functions/fetch-emails/index.ts` die `corsHeaders` erweitern:

```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
```

### 2) Redeployment
Die Dateiänderung triggert automatisch ein Redeployment der Edge Function.

## Betroffene Datei
- `supabase/functions/fetch-emails/index.ts` (nur CORS-Header-Zeile ändern)

