import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import * as hmac from "https://deno.land/std@0.168.0/node/crypto.ts";

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

// --- Función para verificar la firma de Mercado Pago ---
async function verifySignature(req: Request, rawBody: string): Promise<boolean> {
  const secret = Deno.env.get('MERCADOPAGO_WEBHOOK_SECRET')!;
  const signatureHeader = req.headers.get('x-signature');
  if (!signatureHeader) return false;

  const parts = signatureHeader.split(',');
  const tsPart = parts.find(part => part.startsWith('ts='));
  const hashPart = parts.find(part => part.startsWith('v1='));

  if (!tsPart || !hashPart) return false;

  const timestamp = tsPart.split('=')[1];
  const receivedHash = hashPart.split('=')[1];
  
  const manifest = `id:${(JSON.parse(rawBody)).data.id};request-id:${req.headers.get('x-request-id')};ts:${timestamp};`;
  
  const hmac_ = hmac.createHmac('sha256', secret);
  hmac_.update(manifest);
  const calculatedHash = hmac_.digest('hex');

  return calculatedHash === receivedHash;
}
// --------------------------------------------------------

serve(async (req) => {
  const rawBody = await req.text(); // Leemos el cuerpo como texto para la firma

  // --- Verificación de la firma ---
  const isVerified = await verifySignature(req, rawBody);
  if (!isVerified) {
    console.error("Webhook signature verification failed.");
    return new Response("Signature verification failed", { status: 401 });
  }
  // ---------------------------------

  try {
    const body = JSON.parse(rawBody); // Ahora procesamos el JSON
    console.log('Webhook de Mercado Pago recibido y verificado:', body)

    if (body.type === 'preapproval' && body.action === 'created') {
      const subscriptionId = body.data.id

      const mpResponse = await fetch(`https://api.mercadopago.com/preapproval/${subscriptionId}`, {
        headers: { 'Authorization': `Bearer ${Deno.env.get('MERCADOPAGO_ACCESS_TOKEN')}` }
      })
      const subscriptionDetails = await mpResponse.json()
      if (!mpResponse.ok) throw new Error(`MP Error: ${subscriptionDetails.message}`)
      
      const userEmail = subscriptionDetails.payer_email
      const customerId = subscriptionDetails.payer_id

      const { data: user, error: userError } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('email', userEmail)
        .single()
      if (userError || !user) throw new Error(`Usuario no encontrado con email: ${userEmail}`)

      const { error: updateError } = await supabaseAdmin
        .from('app_saas_users')
        .update({
          subscription_plan: 'basic',
          mercadopago_customer_id: customerId.toString(),
          mercadopago_subscription_id: subscriptionId
        })
        .eq('id', user.id)
      
      if (updateError) throw new Error(`Error al actualizar perfil: ${updateError.message}`)
      console.log(`Suscripción activada para el usuario ${userEmail}`)
    }

    return new Response('Webhook recibido', { status: 200 })

  } catch (error) {
    console.error('Error en el webhook:', error.message)
    return new Response(`Webhook Error: ${error.message}`, { status: 400 })
  }
})