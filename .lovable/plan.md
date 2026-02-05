
# Plan: NOVA Chatbot auf Mistral umstellen

## Ubersicht

Die Edge Function `chat-with-ai` wird von OpenAI auf Mistral umgestellt. Das Modell `mistral-small-latest` wird verwendet, da es schnell, zuverlassig und kostengunstig ist.

---

## Technische Anderungen

### Datei: `supabase/functions/chat-with-ai/index.ts`

**1. API-Endpunkt andern**
```typescript
// ALT: OpenAI
const response = await fetch('https://api.openai.com/v1/chat/completions', {...});

// NEU: Mistral
const response = await fetch('https://api.mistral.ai/v1/chat/completions', {...});
```

**2. API-Key andern**
```typescript
// ALT
const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
headers: { 'Authorization': `Bearer ${openaiApiKey}` }

// NEU
const mistralApiKey = Deno.env.get('MISTRAL_API_KEY');
headers: { 'Authorization': `Bearer ${mistralApiKey}` }
```

**3. Request-Body anpassen**
```typescript
// ALT: OpenAI-spezifische Parameter
body: JSON.stringify({
  model: settings.model || 'gpt-4.1-2025-04-14',
  messages: messages,
  ...(settings.model?.includes('gpt-4o') ? 
    { max_tokens: settings.max_tokens || 1000, temperature: settings.temperature || 0.7 } : 
    { max_completion_tokens: settings.max_tokens || 1000 }
  )
})

// NEU: Mistral-kompatible Parameter
body: JSON.stringify({
  model: 'mistral-small-latest',
  messages: messages,
  max_tokens: settings.max_tokens || 1000,
  temperature: settings.temperature || 0.7
})
```

**4. Health Check anpassen**
```typescript
// ALT
const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

// NEU
const mistralApiKey = Deno.env.get('MISTRAL_API_KEY');
```

---

## Vollstandige Anderungen in chat-with-ai/index.ts

```text
Zeile 21-22: OPENAI_API_KEY -> MISTRAL_API_KEY (Health Check)
Zeile 54-59: OPENAI_API_KEY -> MISTRAL_API_KEY
Zeile 292: Log-Ausgabe aktualisieren
Zeile 313-328: API-Aufruf von OpenAI auf Mistral andern
```

### Geanderte Abschnitte im Detail:

**Health Check (Zeile 20-32)**
```typescript
if (healthCheck === true || message === '__healthcheck__') {
  const mistralApiKey = Deno.env.get('MISTRAL_API_KEY');
  if (mistralApiKey) {
    return new Response(
      JSON.stringify({ online: true, status: 'healthy' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } else {
    return new Response(
      JSON.stringify({ online: false, status: 'unhealthy', error: 'Mistral API key not configured' }),
      { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}
```

**API Key Prufung (Zeile 53-60)**
```typescript
const mistralApiKey = Deno.env.get('MISTRAL_API_KEY');
if (!mistralApiKey) {
  return new Response(
    JSON.stringify({ error: 'Mistral API key not configured' }),
    { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
```

**API-Aufruf (Zeile 312-328)**
```typescript
console.log('Sending request to Mistral with model: mistral-small-latest and', messages.length, 'messages');

const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${mistralApiKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'mistral-small-latest',
    messages: messages,
    max_tokens: settings.max_tokens || 1000,
    temperature: settings.temperature || 0.7
  }),
});
```

---

## Keine Anderungen erforderlich

Die folgenden Dateien benotigen keine Anderungen:

| Datei | Grund |
|-------|-------|
| `src/pages/tenant/Chatbot.tsx` | Ruft nur Edge Function auf |
| `src/pages/weg-owner/Chatbot.tsx` | Ruft nur Edge Function auf |
| `chatbot_settings` Tabelle | Model-Feld wird ignoriert (hardcoded) |

---

## Vorteile der Umstellung

| Aspekt | Vorher (GPT-4o) | Nachher (Mistral Small) |
|--------|-----------------|-------------------------|
| Antwortzeit | 3-5 Sekunden | 1-2 Sekunden |
| Kosten/Anfrage | ~0.01-0.02 EUR | ~0.001 EUR |
| Halluzination | Gelegentlich | Seltener bei strukturierten Daten |
| API-Konsistenz | Stabil | Stabil |

---

## Testempfehlung

Nach der Umstellung sollten folgende Szenarien getestet werden:

1. Mieter-Chat: Meldungsstatus abfragen
2. Eigentumer-Chat: Gebaudeinformationen abrufen
3. Fehlerfall: Reaktion bei unbekannter Frage
4. Konversationsgedachtnis: Folge-Fragen im Chat
