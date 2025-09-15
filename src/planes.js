// src/planes.js (Versión final con Enlaces de Pago)
import { supabase } from './lib/supabaseClient.js';

// --- ENLACES DE PAGO DE STRIPE ---
const paymentLinks = {
  basico: 'https://buy.stripe.com/test_7sY3cv2Mz9sxeJka8h8Vi00',
  profesional: 'https://buy.stripe.com/test_aFa7sL72PdINbx85S18Vi01'
};
// ---------------------------------

document.addEventListener('DOMContentLoaded', async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data: profile } = await supabase
    .from('app_saas_users')
    .select('subscription_plan')
    .eq('id', user.id)
    .single();

  const currentPlan = profile?.subscription_plan || 'gratis';

  const currentPlanButton = document.getElementById(`btn-plan-${currentPlan}`);
  if (currentPlanButton) {
      currentPlanButton.textContent = 'Tu Plan Actual';
      currentPlanButton.disabled = true;
      currentPlanButton.classList.add('bg-gray-500', 'cursor-not-allowed');
  }

  ['gratis', 'basico', 'profesional'].forEach(plan => {
      if (plan !== currentPlan) {
          const button = document.getElementById(`btn-plan-${plan}`);
          if (button) {
              button.disabled = false;
              button.textContent = 'Cambiar a este Plan';
              if (plan === 'gratis') {
                button.textContent = 'Plan Inicial';
                button.disabled = true;
              }
          }
      }
  });

  const handleSubscription = (planId, buttonElement) => {
    buttonElement.disabled = true;
    buttonElement.textContent = 'Redirigiendo...';
    
    // Pasamos el ID de usuario a Stripe para que el webhook sepa a quién actualizar
    const checkoutUrl = `${paymentLinks[planId]}?client_reference_id=${user.id}&prefilled_email=${encodeURIComponent(user.email)}`;
    window.location.href = checkoutUrl;
  };

  document.getElementById('btn-plan-basico')?.addEventListener('click', e => handleSubscription('basico', e.currentTarget));
  document.getElementById('btn-plan-profesional')?.addEventListener('click', e => handleSubscription('profesional', e.currentTarget));
});