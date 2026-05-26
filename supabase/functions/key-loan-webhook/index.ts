// Stub edge function for key loan webhook (Make.com integration).
// Triggered on loan_issued (when send_confirmation_email=true) and on overdue reminders.
// Currently logs payload only; later wire up to Make.com webhook URL via env var.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';

const PayloadSchema = z.object({
  event: z.enum(['loan_issued', 'loan_overdue', 'loan_returned']),
  loan_id: z.string().uuid(),
  building_id: z.string().uuid(),
  tag_number: z.string().optional(),
  borrower_name: z.string().min(1),
  borrower_email: z.string().email().optional().nullable(),
  due_at: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  try {
    const body = await req.json();
    const parsed = PayloadSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const webhookUrl = Deno.env.get('MAKE_KEY_LOAN_WEBHOOK_URL');
    console.log('[key-loan-webhook] event:', parsed.data.event, 'loan:', parsed.data.loan_id);

    if (webhookUrl) {
      const resp = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      console.log('[key-loan-webhook] forwarded → Make.com status:', resp.status);
    } else {
      console.log('[key-loan-webhook] MAKE_KEY_LOAN_WEBHOOK_URL not set, skipping forward');
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[key-loan-webhook] error:', e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
