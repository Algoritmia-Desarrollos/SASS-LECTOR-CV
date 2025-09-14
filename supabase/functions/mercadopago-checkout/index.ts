import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  // Manejo de CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    // Obtener el usuario autenticado
    const { data: { user } } = await supabaseClient.auth.getUser()
    if (!user) {
      throw new Error('User not found')
    }

    // El plan al que el usuario quiere suscribirse (ej. "Básico")
    const { planId } = await req.json()
    if (planId !== 'basic' && planId !== 'professional') {
        throw new Error('Invalid plan ID')
    }

    // ID de planes pre-configurados en Mercado Pago
    // DEBERÁS CREAR ESTOS PLANES EN TU CUENTA DE MERCADO PAGO
    const planPrecios = {
        basic: '2f638d63652448408d5f47407bc33612', 
        professional: '2f638d63652448408d5f47407bc33612'
    }

    const MERCADOPAGO_API_URL = 'https://api.mercadopago.com/preapproval'
    const MERCADOPAGO_ACCESS_TOKEN = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN')

    const body = {
      preapproval_plan_id: planPrecios[planId],
      reason: `Suscripción al Plan ${planId.charAt(0).toUpperCase() + planId.slice(1)} de Selecta CV`,
      payer_email: user.email,
      back_url: `${Deno.env.get('SUPABASE_URL')}/dashboard/configuracion` // A donde vuelve el usuario
    }

    const response = await fetch(MERCADOPAGO_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`
      },
      body: JSON.stringify(body)
    })

    const data = await response.json()
    
    if (!response.ok) {
        throw new Error(data.message || 'Error creating subscription link')
    }

    return new Response(JSON.stringify({ init_point: data.init_point }), {
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