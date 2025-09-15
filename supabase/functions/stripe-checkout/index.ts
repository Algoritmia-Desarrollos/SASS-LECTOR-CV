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

    // IMPORTANTE: Usa el ID de PRECIO (price_...) que obtuviste de Stripe
    const priceIds = {
      basic: 'price_1S7dEmGowZwzTW7Q26Zm2ebh', // <-- REEMPLAZA ESTO CON TU ID DE PRECIO REAL
      professional: 'price_1S7eFsGowZwzTW7QB7eAKeSe' // <-- REEMPLAZA CON TU OTRO ID DE PRECIO
    }
    const priceId = priceIds[planId];
    if (!priceId) throw new Error('ID de plan inválido');

    // Busca o crea un cliente en Stripe para asociar la suscripción
    const { data: profile } = await supabaseClient.from('app_saas_users').select('stripe_customer_id').eq('id', user.id).single();
    let customerId = profile?.stripe_customer_id;

    if (!customerId) {
        const customer = await stripe.customers.create({ email: user.email });
        customerId = customer.id;
        // Guarda el nuevo ID de cliente en tu base de datos para futuros usos
        await supabaseClient.from('app_saas_users').update({ stripe_customer_id: customerId }).eq('id', user.id);
    }
    
    // Crea la suscripción y expande el "intento de pago" para obtener el clientSecret
    const subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: priceId }],
        payment_behavior: 'default_incomplete',
        payment_settings: { save_default_payment_method: 'on_subscription' },
        expand: ['latest_invoice.payment_intent'],
    });

    const paymentIntent = subscription.latest_invoice.payment_intent;

    // Devuelve el clientSecret al frontend
    return new Response(JSON.stringify({
        subscriptionId: subscription.id,
        clientSecret: paymentIntent.client_secret,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})