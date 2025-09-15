// supabase/functions/save-card/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

// El Access Token de Mercado Pago (lo lees de los secrets de Supabase)
const MP_ACCESS_TOKEN = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN')!

serve(async (req) => {
  // Manejo de CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Obtener el usuario y el token de la tarjeta desde el frontend
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )
    const { data: { user } } = await supabaseClient.auth.getUser()
    if (!user) throw new Error('Usuario no encontrado')

    const { card_token } = await req.json()
    if (!card_token) throw new Error('El token de la tarjeta es requerido')

    // Cliente de Supabase con permisos de admin para modificar datos
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // 2. Buscar el perfil del usuario para ver si ya es cliente en Mercado Pago
    const { data: profile } = await supabaseAdmin
      .from('app_saas_users')
      .select('mercadopago_customer_id')
      .eq('id', user.id)
      .single()

    let customerId = profile?.mercadopago_customer_id;

    // 3. Si el usuario no existe en Mercado Pago, crearlo
    if (!customerId) {
      const customerResponse = await fetch('https://api.mercadopago.com/v1/customers', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${MP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email: user.email })
      });
      const customerData = await customerResponse.json();
      if (!customerResponse.ok) throw new Error(customerData.message || 'Error al crear cliente en MP');
      
      customerId = customerData.id;

      // Guardar el nuevo ID de cliente en nuestra base de datos
      await supabaseAdmin
        .from('app_saas_users')
        .update({ mercadopago_customer_id: customerId })
        .eq('id', user.id)
    }

    // 4. Asociar la nueva tarjeta (usando el token) al cliente en Mercado Pago
    await fetch(`https://api.mercadopago.com/v1/customers/${customerId}/cards`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ token: card_token })
    });

    // ¡Éxito!
    return new Response(JSON.stringify({ message: 'Tarjeta guardada con éxito' }), {
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