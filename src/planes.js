// src/planes.js
import { supabase } from './lib/supabaseClient.js';

document.addEventListener('DOMContentLoaded', async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
        .from('app_saas_users')
        .select('subscription_plan')
        .eq('id', user.id)
        .single();

    const currentPlan = profile?.subscription_plan || 'gratis';

    // Desactivar y marcar el botón del plan actual
    const currentPlanButton = document.getElementById(`btn-plan-${currentPlan}`);
    if (currentPlanButton) {
        currentPlanButton.textContent = 'Tu Plan Actual';
        currentPlanButton.disabled = true;
        currentPlanButton.classList.add('bg-gray-500', 'cursor-not-allowed');
        currentPlanButton.classList.remove('bg-indigo-600', 'hover:bg-indigo-700', 'bg-gray-800', 'hover:bg-gray-900');
    }

    // Activar los botones de los otros planes
    ['gratis', 'basico', 'profesional'].forEach(plan => {
        if (plan !== currentPlan) {
            const button = document.getElementById(`btn-plan-${plan}`);
            if (button) {
                button.disabled = false;
                const planName = plan.charAt(0).toUpperCase() + plan.slice(1);
                button.textContent = 'Cambiar a este Plan';
                if (plan === 'gratis') {
                  button.textContent = 'Plan Inicial';
                  button.disabled = true;
                }
            }
        }
    });

    const handleSubscription = async (planId, buttonElement) => {
        buttonElement.disabled = true;
        buttonElement.textContent = 'Redirigiendo...';
        try {
            const { data, error } = await supabase.functions.invoke('stripe-checkout', { 
                body: { planId: planId }
            });
            if (error) throw error;
            if (data.checkout_url) {
                window.location.href = data.checkout_url;
            } else {
                throw new Error('No se pudo obtener la URL de pago.');
            }
        } catch (error) {
            alert(`Error: ${error.message}`);
            buttonElement.disabled = false;
            buttonElement.textContent = 'Suscribirse';
        }
    };

    document.getElementById('btn-plan-basico')?.addEventListener('click', e => handleSubscription('basico', e.currentTarget));
    document.getElementById('btn-plan-profesional')?.addEventListener('click', e => handleSubscription('profesional', e.currentTarget));
});