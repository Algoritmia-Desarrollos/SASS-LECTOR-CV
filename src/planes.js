// src/planes.js (Versión final con Stripe Wrapper)
import { supabase } from './lib/supabaseClient.js';

// --- ¡¡¡IMPORTANTE!!! ---
// Pega aquí los enlaces de pago que copiaste desde tu dashboard de Stripe.
const paymentLinks = {
  basico: 'https://buy.stripe.com/test_7sY3cv2Mz9sxeJka8h8Vi00',
  profesional: 'https://buy.stripe.com/test_aFa7sL72PdINbx85S18Vi01'
};
// -------------------------

document.addEventListener('DOMContentLoaded', async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data: profile } = await supabase
    .from('app_saas_users')
    .select('subscription_plan')
    .eq('id', user.id)
    .single();

  const currentPlan = profile?.subscription_plan || 'gratis';

  // Lógica para actualizar los botones (sin cambios)
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

  // Nueva función para redirigir al enlace de pago
  const handleSubscription = (planId, buttonElement) => {
    buttonElement.disabled = true;
    buttonElement.textContent = 'Redirigiendo...';
    
    // Pasamos el email y el ID de usuario a Stripe.
    const checkoutUrl = `${paymentLinks[planId]}?prefilled_email=${encodeURIComponent(user.email)}&client_reference_id=${user.id}`;
    window.location.href = checkoutUrl;
  };

  document.getElementById('btn-plan-basico')?.addEventListener('click', e => handleSubscription('basico', e.currentTarget));
  document.getElementById('btn-plan-profesional')?.addEventListener('click', e => handleSubscription('profesional', e.currentTarget));
});