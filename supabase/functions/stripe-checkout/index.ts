// supabase/functions/stripe-checkout/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@11.1.0' // O la versión más reciente
import { corsHeaders } from '../_shared/cors.ts'

// Inicializa Stripe con tu clave secreta
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2022-11-15', // Usa una versión de API fija
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

    // Obtiene el usuario autenticado
    const { data: { user } } = await supabaseClient.auth.getUser()
    if (!user) throw new Error('Usuario no encontrado')

    const { planId } = await req.json() // Ej: 'basic' o 'professional'

    // Mapea los planes de tu app a los IDs de Precio de Stripe
    const priceIds = {
      basic: 'prod_T3kk7TgGKgcN8X', // <-- REEMPLAZA con tu Price ID de Stripe
      professional: 'price_yyyyyyyyyyyyyyyyy' // <-- REEMPLAZA con tu Price ID de Stripe
    }

    const priceId = priceIds[planId];
    if (!priceId) throw new Error('ID de plan inválido');

    // Crea la Sesión de Checkout en Stripe
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      // URLs a las que Stripe redirigirá al usuario
      success_url: `${Deno.env.get('APP_SITE_URL')}/configuracion.html?status=success`,
      cancel_url: `${Deno.env.get('APP_SITE_URL')}/configuracion.html?status=cancel`,
      // Guarda el ID de tu usuario para saber quién pagó en el webhook
      client_reference_id: user.id
    })

    // Devuelve la URL de la página de pago al frontend
    return new Response(JSON.stringify({ checkout_url: session.url }), {
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