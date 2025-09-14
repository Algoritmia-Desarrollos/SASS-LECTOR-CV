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
const invoicesList = document.getElementById('invoices-list');
const notificationCheckboxes = document.querySelectorAll('.toggle-checkbox');
const addPaymentMethodBtn = document.getElementById('add-payment-method-btn');

// --- SELECTORES DEL MODAL DE TARJETA ---
const cardModal = document.getElementById('card-modal');
const closeCardModalBtn = document.getElementById('close-card-modal');
const cardForm = document.getElementById('card-form');
const cardFormSubmitBtn = document.getElementById('card-form-submit-btn');
const cardFormError = document.getElementById('card-form-error');

// --- SELECTORES PARA NAVEGACIÓN ---
const settingsNav = document.getElementById('settings-nav');
const navLinks = settingsNav.querySelectorAll('a');
const panels = document.querySelectorAll('.settings-panel');

// --- Lógica del Formulario de Tarjeta de Mercado Pago ---
// ¡TU PUBLIC KEY YA ESTÁ AQUÍ!
const mp = new MercadoPago('APP_USR-3229403e-a10b-40ae-b173-d1c239ce954a');
let cardNumber, cardExpirationDate, cardSecurityCode;

function setupCardForm() {
    const cardStyle = {
        style: {
            base: {
                color: "rgb(30 41 59)",
                fontSize: "16px",
                placeholder: { color: "rgb(107 114 128)" },
            },
        },
    };
    cardNumber = mp.fields.create('cardNumber', cardStyle).mount('form-card-number');
    cardExpirationDate = mp.fields.create('expirationDate', cardStyle).mount('form-card-expiration-date');
    cardSecurityCode = mp.fields.create('securityCode', cardStyle).mount('form-card-security-code');
}

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

  if(userEmailDisplay) userEmailDisplay.textContent = user.email;
  if (billingEmailDisplay) billingEmailDisplay.textContent = user.email;

  const { data: profile } = await supabase
    .from('app_saas_users')
    .select('subscription_plan, notification_preferences, mercadopago_customer_id')
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
      if (profile.mercadopago_customer_id && paymentMethodDisplay) {
          paymentMethodDisplay.textContent = 'Tarjeta guardada';
          addPaymentMethodBtn.textContent = 'Reemplazar';
      }
  }

  const { data: invoices } = await supabase
    .from('app_saas_invoices')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
    
  renderInvoices(invoices || []);
}

// --- MANEJO DE EVENTOS ---
function setupEventListeners() {
    if(showPasswordFormBtn) showPasswordFormBtn.addEventListener('click', () => togglePasswordForm(true));
    if(cancelPasswordBtn) cancelPasswordBtn.addEventListener('click', () => togglePasswordForm(false));
    if(updatePasswordBtn) updatePasswordBtn.addEventListener('click', handleUpdatePassword);
    
    notificationCheckboxes.forEach(checkbox => checkbox.addEventListener('change', handleNotificationChange));
    
    if(addPaymentMethodBtn) addPaymentMethodBtn.addEventListener('click', () => {
        cardModal.classList.remove('hidden');
        if (!cardNumber) setupCardForm(); // Inicializa el form solo la primera vez que se abre
    });

    if(closeCardModalBtn) closeCardModalBtn.addEventListener('click', () => cardModal.classList.add('hidden'));

    if(cardForm) cardForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        cardFormSubmitBtn.disabled = true;
        cardFormSubmitBtn.textContent = 'Guardando...';
        cardFormError.textContent = '';

        try {
            const { token } = await cardNumber.createToken();
            if (!token) {
                throw new Error('No se pudo generar el token. Revisa los datos de la tarjeta.');
            }

            const { data, error } = await supabase.functions.invoke('save-card', {
                body: { card_token: token },
            });

            if (error) throw error;
            
            alert('¡Tarjeta guardada con éxito!');
            cardModal.classList.add('hidden');
            loadSettingsData(); // Recargar datos para mostrar la nueva tarjeta

        } catch (error) {
            cardFormError.textContent = error.message || 'Error al guardar la tarjeta.';
        } finally {
            cardFormSubmitBtn.disabled = false;
            cardFormSubmitBtn.textContent = 'Guardar Tarjeta';
        }
    });
}

// --- LÓGICA DE ACCIONES ---
function togglePasswordForm(show) {
    if(securityView) securityView.classList.toggle('hidden', show);
    if(passwordFormContainer) passwordFormContainer.classList.toggle('hidden', !show);
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
  if (!passwordFeedback) return;
  passwordFeedback.textContent = message;
  passwordFeedback.className = 'text-sm mt-2';
  passwordFeedback.classList.add(type === 'error' ? 'text-red-600' : 'text-green-600');
  setTimeout(() => { passwordFeedback.textContent = ''; }, 5000);
}