import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'

console.log("Function cold starting (Checkout Pro version)...");

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
    if (!user) throw new Error('User not found')

    const { planId } = await req.json()
    if (planId !== 'basic' && planId !== 'professional') {
      throw new Error('Invalid plan ID')
    }

    // AHORA INCLUIMOS EL PRECIO JUNTO AL ID
    const planConfig = {
        basic: {
            id: 'a32322dc215f432ba91d288e1cf7de88', // Reemplaza con tu ID real del Plan Básico
            price: 24900 // El precio EXACTO que configuraste en Mercado Pago
        },
        professional: {
            id: '367e0c6c5785494f905b048450a4fa37', // Reemplaza con tu ID real del Plan Avanzado
            price: 40000 // El precio EXACTO que configuraste
        }
    }

    const selectedPlan = planConfig[planId];
    const siteUrl = Deno.env.get('APP_SITE_URL')!;
    
    // El cuerpo de la petición ahora es para crear una "Preferencia de Pago"
    const body = {
      items: [
        {
          title: `Suscripción Plan ${planId.charAt(0).toUpperCase() + planId.slice(1)} - Selecta CV`,
          quantity: 1,
          unit_price: selectedPlan.price,
          currency_id: 'ARS' // Moneda de Argentina
        }
      ],
      payer: {
        email: user.email
      },
      back_urls: {
        success: `${siteUrl}/configuracion.html#facturacion`,
        failure: `${siteUrl}/configuracion.html#facturacion`,
        pending: `${siteUrl}/configuracion.html#facturacion`
      },
      auto_return: 'approved',
      // Esta línea le dice a la preferencia que debe crear una suscripción
      preapproval_plan_id: selectedPlan.id
    };

    const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('MERCADOPAGO_ACCESS_TOKEN')}`
      },
      body: JSON.stringify(body)
    })

    const data = await response.json()
    if (!response.ok) {
      console.error("Error from Mercado Pago:", data);
      throw new Error(data.message || 'Error creating checkout preference')
    }

    // La respuesta ahora contiene 'init_point' que es el link de pago
    return new Response(JSON.stringify({ init_point: data.init_point }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error("Error inside function catch block:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})