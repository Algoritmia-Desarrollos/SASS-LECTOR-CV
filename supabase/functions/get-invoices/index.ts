// supabase/functions/get-invoices/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@11.1.0'
import { corsHeaders } from '../_shared/cors.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2022-11-15',
  httpClient: Stripe.createFetchHttpClient()
})

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )
    const { data: { user } } = await supabaseClient.auth.getUser()
    if (!user) throw new Error('Usuario no encontrado')

    const { data: profile } = await supabaseClient
        .from('app_saas_users')
        .select('stripe_customer_id')
        .eq('id', user.id)
        .single();
    
    if (!profile || !profile.stripe_customer_id) {
      return new Response(JSON.stringify([]), { // Devuelve un array vacío si no es cliente
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    const { data: invoices } = await stripe.invoices.list({
      customer: profile.stripe_customer_id,
      limit: 10, // Traemos las últimas 10 facturas
    });

    const formattedInvoices = invoices.map(invoice => ({
        id: invoice.id,
        date: new Date(invoice.created * 1000).toLocaleDateString('es-ES'),
        amount: `$${(invoice.amount_paid / 100).toFixed(2)}`,
        status: invoice.status,
        pdf_url: invoice.invoice_pdf,
    }));

    return new Response(JSON.stringify(formattedInvoices), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})