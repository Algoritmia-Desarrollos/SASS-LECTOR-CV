// supabase/functions/stripe-checkout/index.ts
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

    const { planId } = await req.json()

    // --- CORRECCIÓN AQUÍ ---
    // Las claves ahora están en español para coincidir con el frontend.
    const priceIds = {
      basico: 'price_1S7dEmGowZwzTW7Q26Zm2ebh', 
      profesional: 'price_1S7eFsGowZwzTW7QB7eAKeSe'
    }
    // --- FIN DE LA CORRECCIÓN ---

    const priceId = priceIds[planId];
    if (!priceId) throw new Error(`ID de plan inválido: ${planId}`);

    const { data: profile } = await supabaseClient.from('app_saas_users').select('stripe_customer_id').eq('id', user.id).single();
    let customerId = profile?.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email, metadata: { supabase_id: user.id } });
      customerId = customer.id;
      await supabaseClient.from('app_saas_users').update({ stripe_customer_id: customerId }).eq('id', user.id);
    }
    
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      subscription_data: {
        metadata: {
          planId: planId // Guardamos 'basico' o 'profesional'
        }
      },
      success_url: `${Deno.env.get('APP_SITE_URL')!}/mi-cuenta.html`,
      cancel_url: `${Deno.env.get('APP_SITE_URL')!}/planes.html`,
    });

    return new Response(JSON.stringify({ checkout_url: session.url }), {
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