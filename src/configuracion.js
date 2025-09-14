import { supabase } from './supabaseClient.js';

// --- SELECTORES ---
const userEmailDisplay = document.getElementById('user-email-display');
const billingEmailDisplay = document.getElementById('billing-email-display');
const currentPlanDisplay = document.getElementById('current-plan-display');
const paymentMethodDisplay = document.getElementById('payment-method-display');
const showPasswordFormBtn = document.getElementById('show-password-form-btn');
const securityView = document.getElementById('security-view');
const passwordFormContainer = document.getElementById('password-form-container');
const newPasswordInput = document.getElementById('new-password');
const updatePasswordBtn = document.getElementById('update-password-btn');
const cancelPasswordBtn = document.getElementById('cancel-password-btn');
const passwordFeedback = document.getElementById('password-feedback');
const manageBillingBtn = document.getElementById('manage-billing-btn');
const replacePaymentBtn = document.getElementById('replace-payment-btn');
const invoicesList = document.getElementById('invoices-list');
const notificationCheckboxes = document.querySelectorAll('.toggle-checkbox');

// --- SELECTORES PARA NAVEGACIÓN ---
const settingsNav = document.getElementById('settings-nav');
const navLinks = settingsNav.querySelectorAll('a');
const panels = document.querySelectorAll('.settings-panel');

// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', () => {
  loadSettingsData();
  setupEventListeners();
  setupNavigation();
});

// --- LÓGICA DE NAVEGACIÓN ---
function setupNavigation() {
    const handleNav = () => {
        const hash = window.location.hash || '#cuenta';
        panels.forEach(panel => panel.classList.add('hidden'));
        navLinks.forEach(link => link.classList.remove('active'));
        const activePanel = document.getElementById(`panel-${hash.substring(1)}`);
        const activeLink = settingsNav.querySelector(`a[href="${hash}"]`);
        if (activePanel) activePanel.classList.remove('hidden');
        if (activeLink) activeLink.classList.add('active');
    };
    window.addEventListener('hashchange', handleNav);
    handleNav(); 
}

// --- CARGA DE DATOS ---
async function loadSettingsData() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  userEmailDisplay.textContent = user.email;
  if (billingEmailDisplay) billingEmailDisplay.textContent = user.email;

  const { data: profile } = await supabase
    .from('app_saas_users')
    .select('subscription_plan, notification_preferences, mercadopago_customer_id') // Asumiendo que tendrás una columna así
    .eq('id', user.id)
    .single();

  if (profile) {
      if (currentPlanDisplay) {
          const planName = profile.subscription_plan.charAt(0).toUpperCase() + profile.subscription_plan.slice(1);
          currentPlanDisplay.textContent = `${planName} Plan`;
      }
      if (profile.notification_preferences) {
          document.getElementById('notify-weekly').checked = profile.notification_preferences.weekly_summary || false;
          document.getElementById('notify-candidates').checked = profile.notification_preferences.new_candidates || false;
          document.getElementById('notify-product').checked = profile.notification_preferences.product_updates || false;
      }
      // Simulación: Si el usuario tiene un ID de cliente de MP, mostramos una tarjeta falsa.
      if (profile.mercadopago_customer_id && paymentMethodDisplay) {
          paymentMethodDisplay.textContent = 'Tarjeta terminada en 4242';
          replacePaymentBtn.textContent = 'Reemplazar';
      }
  }

  const { data: invoices } = await supabase
    .from('app_saas_invoices')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
    
  renderInvoices(invoices || []);
}

// ... (código existente de configuracion.js)

// --- MANEJO DE EVENTOS ---
function setupEventListeners() {
  showPasswordFormBtn.addEventListener('click', () => togglePasswordForm(true));
  cancelPasswordBtn.addEventListener('click', () => togglePasswordForm(false));
  updatePasswordBtn.addEventListener('click', handleUpdatePassword);
  notificationCheckboxes.forEach(checkbox => checkbox.addEventListener('change', handleNotificationChange));
  
  // Dentro de la función setupEventListeners en src/configuracion.js

  const redirectToMercadoPago = (button) => {
      button.disabled = true;
      button.textContent = 'Redirigiendo...';

      // Objeto con los IDs de tus planes de Mercado Pago
      const planConfig = {
          basic: {
              id: 'a32322dc215f432ba91d288e1cf7de88', // Tu ID del Plan Básico
          },
          professional: {
              id: '367e0c6c5785494f905b048450a4fa37', // Tu ID del Plan Avanzado
          }
      };
      
      const planId = 'basic'; 
      const selectedPlan = planConfig[planId];

      // --- ESTA ES LA LÍNEA CORREGIDA ---
      if (!selectedPlan || selectedPlan.id.length < 30) { 
          alert('Error: El ID del plan no está configurado correctamente en el código.');
          button.disabled = false;
          button.textContent = 'Portal de Cliente';
          return;
      }
      
      // Construimos la URL de checkout directamente en el navegador
      const checkoutUrl = `https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_plan_id=${selectedPlan.id}`;
      
      // Redirigimos al usuario a la página de Mercado Pago
      window.location.href = checkoutUrl;
  };

  if (manageBillingBtn) {
    manageBillingBtn.addEventListener('click', () => redirectToMercadoPago(manageBillingBtn));
  }
  if (replacePaymentBtn) {
    replacePaymentBtn.addEventListener('click', () => redirectToMercadoPago(replacePaymentBtn));
  }
}
// ... (resto del código de configuracion.js)
// --- LÓGICA DE ACCIONES ---
function togglePasswordForm(show) {
    securityView.classList.toggle('hidden', show);
    passwordFormContainer.classList.toggle('hidden', !show);
}

async function handleUpdatePassword() {
  const newPassword = newPasswordInput.value;
  if (newPassword.length < 6) {
    showPasswordFeedback("La contraseña debe tener al menos 6 caracteres.", "error");
    return;
  }
  updatePasswordBtn.disabled = true;
  updatePasswordBtn.textContent = 'Guardando...';
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) {
    showPasswordFeedback(`Error: ${error.message}`, "error");
  } else {
    showPasswordFeedback("¡Contraseña actualizada con éxito!", "success");
    newPasswordInput.value = '';
    setTimeout(() => togglePasswordForm(false), 2000);
  }
  updatePasswordBtn.disabled = false;
  updatePasswordBtn.textContent = 'Guardar Contraseña';
}

async function handleNotificationChange() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const prefs = {
        weekly_summary: document.getElementById('notify-weekly').checked,
        new_candidates: document.getElementById('notify-candidates').checked,
        product_updates: document.getElementById('notify-product').checked,
    };
    await supabase.from('app_saas_users').update({ notification_preferences: prefs }).eq('id', user.id);
}

// --- RENDERIZADO Y AUXILIARES ---
function renderInvoices(invoices) {
    if (!invoicesList) return;
    if (invoices.length === 0) {
        invoicesList.innerHTML = `<div class="p-4 text-center text-gray-500">No tienes facturas anteriores.</div>`;
        return;
    }
    invoicesList.innerHTML = invoices.map(invoice => {
        const date = new Date(invoice.created_at).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
        const amount = `$${(invoice.amount / 100).toFixed(2)}`;
        const isPaid = invoice.status === 'paid';
        
        return `
            <div class="invoice-item">
                <div class="flex items-center">
                    <i class="fa-solid ${isPaid ? 'fa-circle-check text-green-500' : 'fa-circle-xmark text-red-500'} mr-4"></i>
                    <div class="flex-grow">
                        <p class="font-medium text-gray-800">${invoice.plan_name} (${isPaid ? 'Pagado' : 'Fallido'})</p>
                        <p class="text-sm text-gray-500">${date}</p>
                    </div>
                    <p class="font-mono text-sm text-gray-600 mr-4">${amount}</p>
                    <a href="${invoice.invoice_url || '#'}" target="_blank" class="text-sm font-semibold text-indigo-600 hover:text-indigo-800">Ver</a>
                </div>
            </div>
        `;
    }).join('');
}

function showPasswordFeedback(message, type) {
  passwordFeedback.textContent = message;
  passwordFeedback.className = 'text-sm mt-2';
  passwordFeedback.classList.add(type === 'error' ? 'text-red-600' : 'text-green-600');
  setTimeout(() => { passwordFeedback.textContent = ''; }, 5000);
}