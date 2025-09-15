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

// --- SELECTORES DE STRIPE Y NAVEGACIÓN ---
const manageBillingBtn = document.getElementById('manage-billing-btn');
const stripeFormContainer = document.getElementById('stripe-form-container');
const paymentForm = document.getElementById('payment-form');
const submitPaymentBtn = document.getElementById('submit-payment-btn');
const paymentMessage = document.getElementById('payment-message');
const settingsNav = document.getElementById('settings-nav');
const navLinks = settingsNav.querySelectorAll('a');
const panels = document.querySelectorAll('.settings-panel');

// --- ESTADO ---
let stripe;
let elements;

// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', async () => {
  // Inicializa Stripe con tu CLAVE PUBLICABLE (empieza con pk_test_ o pk_live_)
  stripe = Stripe('TU_CLAVE_PUBLICABLE_DE_STRIPE_AQUI');
  
  await loadSettingsData();
  setupEventListeners();
  setupNavigation();
  checkPaymentStatus();
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

// --- CARGA DE DATOS INICIAL ---
async function loadSettingsData() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  if(userEmailDisplay) userEmailDisplay.textContent = user.email;
  if (billingEmailDisplay) billingEmailDisplay.textContent = user.email;

  const { data: profile } = await supabase
    .from('app_saas_users')
    .select('subscription_plan, notification_preferences, stripe_customer_id')
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
      // Actualizamos la UI si el usuario ya tiene una suscripción
      if (profile.stripe_customer_id && paymentMethodDisplay) {
          paymentMethodDisplay.textContent = 'Suscripción activa';
          manageBillingBtn.textContent = 'Administrar Suscripción';
          // Aquí podrías redirigir a un portal de cliente de Stripe en el futuro
      }
  }

  renderInvoices([]); // Placeholder para futuras facturas
}

// --- MANEJO DE EVENTOS ---
function setupEventListeners() {
    if(showPasswordFormBtn) showPasswordFormBtn.addEventListener('click', () => togglePasswordForm(true));
    if(cancelPasswordBtn) cancelPasswordBtn.addEventListener('click', () => togglePasswordForm(false));
    if(updatePasswordBtn) updatePasswordBtn.addEventListener('click', handleUpdatePassword);
    
    notificationCheckboxes.forEach(checkbox => checkbox.addEventListener('change', handleNotificationChange));
    
    if(manageBillingBtn) {
        manageBillingBtn.addEventListener('click', initializeCheckout);
    }
}


// --- LÓGICA DE CHECKOUT CON STRIPE ---

async function initializeCheckout() {
    manageBillingBtn.disabled = true;
    manageBillingBtn.textContent = 'Cargando formulario...';
    stripeFormContainer.classList.remove('hidden');

    try {
        const { clientSecret } = await createSubscription();
        
        elements = stripe.elements({ clientSecret });
        const paymentElement = elements.create("payment");
        paymentElement.mount("#payment-element"); // Monta el formulario en el div del HTML
        
        paymentForm.addEventListener('submit', handlePaymentSubmit);

    } catch (error) {
        showMessage(`Error: ${error.message}`);
        manageBillingBtn.disabled = false;
        manageBillingBtn.textContent = 'Suscribirse al Plan Básico';
    }
}

// Llama a la función de Supabase para crear la suscripción y obtener el clientSecret
async function createSubscription() {
    const { data, error } = await supabase.functions.invoke('stripe-checkout', {
        body: { planId: 'basic' }
    });
    if (error) throw new Error('No se pudo iniciar el proceso de pago.');
    return data;
}

// Se ejecuta cuando el usuario hace clic en el botón "Pagar ahora"
async function handlePaymentSubmit(e) {
    e.preventDefault();
    setLoading(true);

    const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: {
            // URL a la que el usuario volverá después de autenticar el pago
            return_url: window.location.href.split('?')[0].split('#')[0] + '#facturacion',
        },
    });

    // Este punto solo se alcanza si hay un error de validación inmediato
    if (error.type === "card_error" || error.type === "validation_error") {
        showMessage(error.message);
    } else {
        showMessage("Ocurrió un error inesperado.");
    }
    setLoading(false);
}

// Revisa el estado del pago cuando el usuario vuelve a la página
function checkPaymentStatus() {
    const urlParams = new URLSearchParams(window.location.search);
    const paymentIntentClientSecret = urlParams.get('payment_intent_client_secret');

    if (!paymentIntentClientSecret) {
        return;
    }

    stripe.retrievePaymentIntent(paymentIntentClientSecret).then(({ paymentIntent }) => {
        switch (paymentIntent.status) {
            case "succeeded":
                showMessage("¡Pago exitoso! Tu suscripción está activa.", "success");
                loadSettingsData(); // Recarga los datos para mostrar el nuevo plan
                break;
            case "processing":
                showMessage("Tu pago se está procesando.", "info");
                break;
            case "requires_payment_method":
                showMessage("El pago falló. Por favor, intenta con otro método de pago.", "error");
                break;
            default:
                showMessage("Algo salió mal.", "error");
                break;
        }
    });
}


// --- LÓGICA DE GESTIÓN DE CUENTA ---
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


// --- FUNCIONES AUXILIARES ---
function renderInvoices(invoices) {
    if (!invoicesList) return;
    if (invoices.length === 0) {
        invoicesList.innerHTML = `<div class="p-4 text-center text-sm text-gray-500">Aún no tienes facturas.</div>`;
        return;
    }
}

function showPasswordFeedback(message, type) {
  if (!passwordFeedback) return;
  passwordFeedback.textContent = message;
  passwordFeedback.className = 'text-sm mt-2';
  passwordFeedback.classList.add(type === 'error' ? 'text-red-600' : 'text-green-600');
  setTimeout(() => { passwordFeedback.textContent = ''; }, 5000);
}

function setLoading(isLoading) {
    submitPaymentBtn.disabled = isLoading;
    const buttonText = document.getElementById('button-text');
    if (isLoading) {
        buttonText.textContent = 'Procesando...';
    } else {
        buttonText.textContent = 'Pagar ahora';
    }
}

function showMessage(messageText, type = 'error') {
    paymentMessage.classList.remove('hidden', 'text-red-500', 'text-green-500', 'text-blue-500');
    if (type === 'success') {
        paymentMessage.classList.add('text-green-500');
    } else if (type === 'info') {
        paymentMessage.classList.add('text-blue-500');
    } else {
        paymentMessage.classList.add('text-red-500');
    }
    
    paymentMessage.textContent = messageText;

    setTimeout(() => {
        paymentMessage.classList.add('hidden');
        paymentMessage.textContent = '';
    }, 5000);
}