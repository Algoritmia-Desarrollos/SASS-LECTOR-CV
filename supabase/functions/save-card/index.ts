import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { card_token } = await req.json()
    if (!card_token) throw new Error("Card Token is required.");

    const { data: { user } } = await createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    ).auth.getUser();

    if (!user) throw new Error("User not found.");

    const { data: profile, error } = await supabaseAdmin
      .from('app_saas_users')
      .select('mercadopago_customer_id')
      .eq('id', user.id)
      .single();

    if (error) throw error;
    
    let customerId = profile.mercadopago_customer_id;
    const MP_API = 'https://api.mercadopago.com';
    const MP_TOKEN = `Bearer ${Deno.env.get('MERCADOPAGO_ACCESS_TOKEN')}`;

    // 1. Si el usuario no es un cliente en Mercado Pago, lo creamos
    if (!customerId) {
      const customerResponse = await fetch(`${MP_API}/v1/customers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': MP_TOKEN },
        body: JSON.stringify({ email: user.email }),
      });
      const customerData = await customerResponse.json();
      if (!customerResponse.ok) throw new Error(customerData.message);
      
      customerId = customerData.id;
      
      await supabaseAdmin
        .from('app_saas_users')
        .update({ mercadopago_customer_id: customerId })
        .eq('id', user.id);
    }
    
    // 2. Asociamos el token de la tarjeta al cliente
    const cardResponse = await fetch(`${MP_API}/v1/customers/${customerId}/cards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': MP_TOKEN },
      body: JSON.stringify({ token: card_token }),
    });
    
    const cardData = await cardResponse.json();
    if (!cardResponse.ok) throw new Error(cardData.message);

    return new Response(JSON.stringify({ message: 'Card saved successfully', card: cardData }), {
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