// src/modules/billing.js
import { supabase } from '../lib/supabaseClient.js';
import * as StripeHandler from '../lib/stripe.js';

// --- SELECTORES ---
const currentPlanDisplay = document.getElementById('current-plan-display');
const invoicesTableBody = document.getElementById('invoices-table-body');

// --- INICIALIZACIÓN DEL MÓDULO ---
export async function initBillingModule() {
    if (!currentPlanDisplay) return;
    await loadBillingData();
}

// --- LÓGICA DE CARGA DE DATOS Y UI ---
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
    const manageBillingBtn = document.getElementById('manage-billing-btn');
    if (!manageBillingBtn) return;

    manageBillingBtn.disabled = false;
    // Clonamos el botón para limpiar listeners antiguos y evitar que se acumulen
    const newBillingBtn = manageBillingBtn.cloneNode(true);
    manageBillingBtn.parentNode.replaceChild(newBillingBtn, manageBillingBtn);

    if (profile.subscription_plan !== 'free') {
        newBillingBtn.textContent = 'Administrar Suscripción';
        newBillingBtn.addEventListener('click', handleManageBilling);
    } else {
        newBillingBtn.textContent = 'Ver Planes';
        newBillingBtn.addEventListener('click', () => { window.location.href = 'planes.html'; });
    }
}

async function renderInvoiceHistory() {
    invoicesTableBody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-sm text-gray-500">Cargando...</td></tr>`;
    try {
        const invoices = await StripeHandler.fetchInvoices();
        if (!invoices || invoices.length === 0) {
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
        console.error("Error al renderizar facturas:", error);
        invoicesTableBody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-sm text-red-500">Error al cargar facturas.</td></tr>`;
    }
}

// --- MANEJADORES DE EVENTOS ---
async function handleManageBilling() {
    const btn = document.getElementById('manage-billing-btn');
    btn.disabled = true;
    btn.textContent = 'Redirigiendo...';
    try {
        await StripeHandler.redirectToCustomerPortal();
    } catch (e) {
        alert('No se pudo abrir el portal de cliente.');
        btn.disabled = false;
        btn.textContent = 'Administrar Suscripción';
    }
}