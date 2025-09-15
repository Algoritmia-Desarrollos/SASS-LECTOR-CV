// src/planes.js
import { supabase } from './lib/supabaseClient.js';

document.addEventListener('DOMContentLoaded', () => {
    const basicBtn = document.getElementById('subscribe-basic-btn');
    const professionalBtn = document.getElementById('subscribe-professional-btn');

    const handleSubscription = async (planId, buttonElement) => {
        buttonElement.disabled = true;
        buttonElement.textContent = 'Redirigiendo...';

        try {
            const { data, error } = await supabase.functions.invoke('stripe-checkout', {
                body: { planId: planId },
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
            buttonElement.textContent = `Elegir Plan ${planId.charAt(0).toUpperCase() + planId.slice(1)}`;
        }
    };

    if (basicBtn) {
        basicBtn.addEventListener('click', (e) => {
            e.preventDefault();
            handleSubscription('basic', basicBtn);
        });
    }

    if (professionalBtn) {
        professionalBtn.addEventListener('click', (e) => {
            e.preventDefault();
            handleSubscription('professional', professionalBtn);
        });
    }
});