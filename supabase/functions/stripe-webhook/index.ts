// supabase/functions/stripe-webhook/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@11.1.0'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2022-11-15',
  httpClient: Stripe.createFetchHttpClient()
})

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

serve(async (req) => {
  const signature = req.headers.get('Stripe-Signature')
  const body = await req.text()

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature!,
      Deno.env.get('STRIPE_WEBHOOK_SIGNING_SECRET')!
    )
  } catch (err) {
    return new Response(err.message, { status: 400 })
  }

  const session = event.data.object as any;

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        // Obtenemos el objeto de la suscripción desde Stripe
        const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
        
        // ¡LÓGICA MEJORADA! Leemos el plan directamente de la metadata
        const newPlan = subscription.metadata.planId;
        if (!newPlan) {
            console.error('Webhook Error: planId no encontrado en la metadata de la suscripción.');
            break;
        }

        await supabaseAdmin
          .from('app_saas_users')
          .update({
            subscription_plan: newPlan, // 'basic' o 'professional'
            stripe_subscription_id: subscription.id
          })
          .eq('stripe_customer_id', session.customer);
        break;
      }

      case 'customer.subscription.deleted': {
        // Cuando un usuario cancela, lo volvemos al plan 'free'
        await supabaseAdmin
          .from('app_saas_users')
          .update({ subscription_plan: 'free', stripe_subscription_id: null })
          .eq('stripe_subscription_id', session.id);
        break;
      }
    }
  } catch (error) {
      console.error(`Error manejando el evento ${event.type}:`, error.message);
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 })
})