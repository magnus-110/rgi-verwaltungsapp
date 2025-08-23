import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

// Generiere neue VAPID Schlüsselpaare
async function generateVAPIDKeys() {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'ECDSA',
      namedCurve: 'P-256',
    },
    true,
    ['sign', 'verify']
  );

  const publicKeyBuffer = await crypto.subtle.exportKey('raw', keyPair.publicKey);
  const privateKeyBuffer = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

  // Convert to base64url
  const publicKey = btoa(String.fromCharCode(...new Uint8Array(publicKeyBuffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
    
  const privateKey = btoa(String.fromCharCode(...new Uint8Array(privateKeyBuffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  return { publicKey, privateKey };
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'GET') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    console.log('Generating new VAPID keys...');
    
    const keys = await generateVAPIDKeys();
    
    console.log('Keys generated successfully');
    console.log('Public Key:', keys.publicKey);
    console.log('Private Key (first 20 chars):', keys.privateKey.substring(0, 20) + '...');

    return new Response(
      JSON.stringify({
        success: true,
        keys: keys,
        instructions: {
          step1: 'Kopiere diese Keys in die Supabase Edge Function Secrets',
          step2: 'VAPID_PUBLIC_KEY = ' + keys.publicKey,
          step3: 'VAPID_PRIVATE_KEY = ' + keys.privateKey,
          step4: 'Teste dann die Push-Benachrichtigungen erneut'
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Function error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to generate keys', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});