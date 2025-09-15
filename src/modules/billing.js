// src/modules/billing.js
import { supabase } from '../lib/supabaseClient.js';
import * as StripeHandler from '../lib/stripe.js';

const currentPlanDisplay = document.getElementById('current-plan-display');
const invoicesTableBody = document.getElementById('invoices-table-body');

export async function initBillingModule() {
    if (!currentPlanDisplay) return;
    await loadBillingData();
}

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
            <tr class="border-b"><td class="p-2 text-sm">${invoice.date}</td><td class="p-2 text-sm">${invoice.amount}</td><td class="p-2 text-sm"><span class="px-2 py-1 text-xs rounded-full ${invoice.status === 'paid' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}">${invoice.status}</span></td><td class="p-2 text-right"><a href="${invoice.pdf_url}" target="_blank" class="text-sm text-indigo-600 hover:underline">Descargar</a></td></tr>
        `).join('');
    } catch (error) {
        invoicesTableBody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-sm text-red-500">Error al cargar facturas.</td></tr>`;
    }
}

async function handleManageBilling() {
    const btn = document.getElementById('manage-billing-btn');
    btn.disabled = true;
    btn.textContent = 'Redirigiendo...';
    try {
        await StripeHandler.redirectToCustomerPortal();
    } catch (e) {
        alert('No se pudo abrir el portal de cliente.');
        btn.disabled = false;
    }
}