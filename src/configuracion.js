// src/configuracion.js
import { supabase } from './lib/supabaseClient.js';
import * as StripeHandler from './lib/stripe.js';

// --- SELECTORES ---
const currentPlanDisplay = document.getElementById('current-plan-display');
const manageBillingBtn = document.getElementById('manage-billing-btn');
const stripeFormContainer = document.getElementById('stripe-form-container');
const paymentForm = document.getElementById('payment-form');
const submitPaymentBtn = document.getElementById('submit-payment-btn');
const paymentMessage = document.getElementById('payment-message');
const invoicesTableBody = document.getElementById('invoices-table-body');
// ... otros selectores que necesites para los otros paneles

// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', () => {
  StripeHandler.initializeStripe('pk_test_51S7dAmGowZwzTW7QiCMdtytaka5tGNKHFv7wwNJGPgPwgKQZPL3OoxZ0E2EqV5JaECdLoylHPXkuWZzqriFYxocl000BwjtoWN'); // <-- REEMPLAZA con tu Clave Publicable
  
  loadBillingData();
  StripeHandler.checkPaymentStatus(handlePaymentStatus);
});

// --- CARGA DE DATOS Y LÓGICA DE UI ---
async function loadBillingData() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data: profile } = await supabase.from('app_saas_users')
    .select('subscription_plan, stripe_customer_id').eq('id', user.id).single();

  if (profile) {
      const planName = profile.subscription_plan.charAt(0).toUpperCase() + profile.subscription_plan.slice(1);
      currentPlanDisplay.textContent = `${planName} Plan`;

      updateBillingButton(profile);
      await renderInvoiceHistory();
  }
}

function updateBillingButton(profile) {
    manageBillingBtn.disabled = false;
    // Limpiamos listeners anteriores para evitar duplicados
    manageBillingBtn.replaceWith(manageBillingBtn.cloneNode(true));
    // Volvemos a obtener la referencia al nuevo botón
    const newBillingBtn = document.getElementById('manage-billing-btn');

    if (profile.subscription_plan !== 'free' && profile.stripe_customer_id) {
        newBillingBtn.textContent = 'Administrar Suscripción';
        newBillingBtn.addEventListener('click', handleManageBilling);
    } else {
        newBillingBtn.textContent = 'Suscribirse al Plan Básico';
        newBillingBtn.addEventListener('click', handleSubscribe);
    }
}

async function renderInvoiceHistory() {
    invoicesTableBody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-sm text-gray-500">Cargando...</td></tr>`;
    try {
        const invoices = await StripeHandler.fetchInvoices();
        if (invoices.length === 0) {
            invoicesTableBody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-sm text-gray-500">No hay facturas para mostrar.</td></tr>`;
            return;
        }

        invoicesTableBody.innerHTML = invoices.map(invoice => `
            <tr class="border-b">
                <td class="px-4 py-3 text-sm text-gray-700">${invoice.date}</td>
                <td class="px-4 py-3 text-sm text-gray-700">${invoice.amount}</td>
                <td class="px-4 py-3 text-sm">
                    <span class="px-2 py-1 text-xs font-semibold rounded-full ${invoice.status === 'paid' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
                        ${invoice.status}
                    </span>
                </td>
                <td class="px-4 py-3 text-right">
                    <a href="${invoice.pdf_url}" target="_blank" class="text-sm font-medium text-indigo-600 hover:underline">Descargar</a>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        invoicesTableBody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-sm text-red-500">Error al cargar facturas.</td></tr>`;
    }
}

// --- MANEJADORES DE EVENTOS ---
async function handleSubscribe() {
    manageBillingBtn.disabled = true;
    stripeFormContainer.classList.remove('hidden');

    try {
        const elements = await StripeHandler.mountPaymentElement('#payment-element');
        paymentForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            setLoading(true);
            const { error } = await StripeHandler.confirmPayment(elements);
            if (error) showMessage(error);
            setLoading(false);
        });
    } catch (error) {
        showMessage(error.message);
        manageBillingBtn.disabled = false;
    }
}

async function handleManageBilling() {
    manageBillingBtn.disabled = true;
    try {
        await StripeHandler.redirectToCustomerPortal();
    } catch (e) {
        alert('No se pudo abrir el portal de cliente.');
        manageBillingBtn.disabled = false;
    }
}

function handlePaymentStatus(status) {
    switch (status) {
        case "succeeded":
            showMessage("¡Pago exitoso! Tu suscripción está activa.", "success");
            loadBillingData();
            break;
        case "processing":
            showMessage("Tu pago se está procesando.", "info");
            break;
        default:
            showMessage("El pago falló. Por favor, intenta de nuevo.", "error");
            break;
    }
}

// --- FUNCIONES AUXILIARES DE UI ---
function setLoading(isLoading) {
    submitPaymentBtn.disabled = isLoading;
    submitPaymentBtn.querySelector('#button-text').textContent = isLoading ? 'Procesando...' : 'Pagar ahora';
}

function showMessage(message, type = 'error') {
    // ... (función showMessage que ya tenías)
}