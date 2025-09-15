// src/lib/stripe.js
import { supabase } from './supabaseClient.js';

let stripe;

// Inicializa Stripe con tu clave publicable
export function initializeStripe(publishableKey) {
    stripe = Stripe(publishableKey);
    return stripe;
}

// Llama a la función de Supabase para obtener el clientSecret
async function createSubscription() {
    const { data, error } = await supabase.functions.invoke('stripe-checkout', {
        body: { planId: 'basic' }
    });
    if (error) throw new Error('No se pudo iniciar el proceso de pago.');
    return data;
}

// Monta el formulario de pago en tu HTML
export async function mountPaymentElement(elementId) {
    const { clientSecret } = await createSubscription();
    const elements = stripe.elements({ clientSecret });
    const paymentElement = elements.create("payment");
    paymentElement.mount(elementId);
    return elements;
}

// Confirma el pago cuando el usuario envía el formulario
export async function confirmPayment(elements) {
    const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: {
            return_url: window.location.href.split('?')[0].split('#')[0] + '#facturacion',
        },
    });
    
    if (error.type === "card_error" || error.type === "validation_error") {
        return { error: error.message };
    } else {
        return { error: "Ocurrió un error inesperado." };
    }
}

// Redirige al portal de cliente de Stripe
export async function redirectToCustomerPortal() {
    const { data, error } = await supabase.functions.invoke('stripe-portal');
    if (error) throw error;
    window.location.href = data.portal_url;
}

// Busca el historial de facturas
export async function fetchInvoices() {
    const { data, error } = await supabase.functions.invoke('get-invoices');
    if (error) throw new Error('No se pudo cargar el historial de facturas.');
    return data;
}

// Revisa el estado de un pago al volver a la página
export function checkPaymentStatus(callback) {
    const urlParams = new URLSearchParams(window.location.search);
    const clientSecret = urlParams.get('payment_intent_client_secret');
    if (!clientSecret) return;

    stripe.retrievePaymentIntent(clientSecret).then(({ paymentIntent }) => {
        callback(paymentIntent.status);
    });
}