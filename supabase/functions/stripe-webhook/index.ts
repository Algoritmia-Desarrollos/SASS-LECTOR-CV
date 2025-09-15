// supabase/functions/stripe-webhook/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@11.1.0'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2022-11-15',
  httpClient: Stripe.createFetchHttpClient()
})

// Cliente de Supabase con permisos de administrador para modificar la base de datos
const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

serve(async (req) => {
  const signature = req.headers.get('Stripe-Signature')
  const body = await req.text()

  let event: Stripe.Event;
  try {
    // Verifica que la notificación venga realmente de Stripe usando un "secreto"
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature!,
      Deno.env.get('STRIPE_WEBHOOK_SIGNING_SECRET')!
    )
  } catch (err) {
    return new Response(err.message, { status: 400 })
  }

  // Si la sesión de pago se completó exitosamente...
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.client_reference_id; // Recuperamos el ID de nuestro usuario
    const subscriptionId = session.subscription;
    const planId = 'basic'; // Deberías obtener el plan real desde el evento si tienes varios

    // Actualiza la tabla de usuarios para activar el plan
    const { error } = await supabaseAdmin
      .from('app_saas_users')
      .update({
        subscription_plan: planId, // Actualiza al plan que pagó
        stripe_subscription_id: subscriptionId // Guarda el ID de la suscripción
      })
      .eq('id', userId);
    
    if (error) {
        console.error('Error al actualizar el perfil del usuario:', error.message);
    } else {
        console.log(`Suscripción activada para el usuario ${userId}`);
    }
  }

  // Puedes manejar más eventos aquí, como 'customer.subscription.deleted' para cancelaciones

  return new Response(JSON.stringify({ received: true }), { status: 200 })
})