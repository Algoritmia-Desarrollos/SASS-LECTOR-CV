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
      body, signature!, Deno.env.get('STRIPE_WEBHOOK_SIGNING_SECRET')!
    )
  } catch (err) {
    console.error(`Error en la verificación del webhook: ${err.message}`);
    return new Response(err.message, { status: 400 })
  }

  // --- LÓGICA PRINCIPAL PARA ACTUALIZAR EL PLAN ---
  try {
    const dataObject = event.data.object as any;

    if (event.type.startsWith('customer.subscription.')) {
      const subscription = dataObject as Stripe.Subscription;

      if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
        const newPlan = subscription.metadata.planId;
        if (!newPlan) {
          console.error('Error del Webhook: planId no encontrado en los metadatos.');
          return new Response('planId no encontrado', { status: 400 });
        }
        
        const customer = await stripe.customers.retrieve(subscription.customer as string) as Stripe.Customer;
        if (customer.deleted) {
          return new Response('Cliente eliminado', { status: 200 });
        }
        
        const userEmail = customer.email;
        if (!userEmail) {
          console.error(`Error del Webhook: No se encontró email para el cliente ${customer.id}.`);
          return new Response('Email no encontrado', { status: 400 });
        }

        const { data: authUser } = await supabaseAdmin.from('users').select('id').eq('email', userEmail).single();
        if (!authUser) {
          console.error(`Error del Webhook: No se encontró usuario con email ${userEmail}.`);
          return new Response('Usuario no encontrado', { status: 400 });
        }

        const { error: updateError } = await supabaseAdmin
          .from('app_saas_users')
          .update({
            subscription_plan: newPlan,
            stripe_subscription_id: subscription.id,
            stripe_customer_id: subscription.customer as string
          })
          .eq('id', authUser.id);

        if (updateError) throw updateError;
        console.log(`Plan actualizado a '${newPlan}' para el usuario ${userEmail}`);
      }
      
      else if (event.type === 'customer.subscription.deleted') {
        await supabaseAdmin
          .from('app_saas_users')
          .update({ subscription_plan: 'gratis', stripe_subscription_id: null })
          .eq('stripe_subscription_id', subscription.id);
        console.log(`Suscripción eliminada y plan revertido a 'gratis'.`);
      }
    }
  } catch (error) {
    console.error('Error manejando el webhook:', error.message);
    return new Response(`Error en el Webhook: ${error.message}`, { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
})