import { supabase } from './supabaseClient.js';

// --- SELECTORES ---
const userEmailDisplay = document.getElementById('user-email-display');
const showPasswordFormBtn = document.getElementById('show-password-form-btn');
const securityView = document.getElementById('security-view');
const passwordFormContainer = document.getElementById('password-form-container');
const newPasswordInput = document.getElementById('new-password');
const updatePasswordBtn = document.getElementById('update-password-btn');
const cancelPasswordBtn = document.getElementById('cancel-password-btn');
const passwordFeedback = document.getElementById('password-feedback');
const manageBillingBtn = document.getElementById('manage-billing-btn');
const invoicesList = document.getElementById('invoices-list');
const themeLightBtn = document.getElementById('theme-light-btn');
const themeDarkBtn = document.getElementById('theme-dark-btn');
const notificationCheckboxes = document.querySelectorAll('.toggle-checkbox');

// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', () => {
  loadSettingsData();
  setupEventListeners();
  applyTheme();
});

// --- CARGA DE DATOS ---
async function loadSettingsData() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  userEmailDisplay.textContent = user.email;

  const { data: profile } = await supabase
    .from('app_saas_users')
    .select('notification_preferences')
    .eq('id', user.id)
    .single();

  if (profile && profile.notification_preferences) {
      document.getElementById('notify-weekly').checked = profile.notification_preferences.weekly_summary || false;
      document.getElementById('notify-candidates').checked = profile.notification_preferences.new_candidates || false;
      document.getElementById('notify-product').checked = profile.notification_preferences.product_updates || false;
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
  showPasswordFormBtn.addEventListener('click', () => togglePasswordForm(true));
  cancelPasswordBtn.addEventListener('click', () => togglePasswordForm(false));
  updatePasswordBtn.addEventListener('click', handleUpdatePassword);
  notificationCheckboxes.forEach(checkbox => checkbox.addEventListener('change', handleNotificationChange));
  themeLightBtn.addEventListener('click', () => setTheme('light'));
  themeDarkBtn.addEventListener('click', () => setTheme('dark'));
  manageBillingBtn.addEventListener('click', () => {
      alert("En una aplicación real, esto redirigiría a un portal de cliente de Stripe para gestionar la suscripción y los métodos de pago.");
  });
}

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
    setTimeout(() => togglePasswordForm(false), 2000); // Oculta el form tras el éxito
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

// --- TEMA (APARIENCIA) ---
function setTheme(theme) {
  localStorage.setItem('theme', theme);
  applyTheme();
}

function applyTheme() {
  const theme = localStorage.getItem('theme') || 'light';
  if (theme === 'dark') {
    document.documentElement.classList.add('dark');
    themeDarkBtn.classList.add('bg-indigo-600', 'text-white');
    themeLightBtn.classList.remove('bg-indigo-600', 'text-white');
  } else {
    document.documentElement.classList.remove('dark');
    themeLightBtn.classList.add('bg-indigo-600', 'text-white');
    themeDarkBtn.classList.remove('bg-indigo-600', 'text-white');
  }
}

// --- RENDERIZADO Y AUXILIARES ---
function renderInvoices(invoices) {
    if (invoices.length === 0) {
        invoicesList.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-gray-500">No tienes facturas anteriores.</td></tr>`;
        return;
    }
    invoicesList.innerHTML = invoices.map(invoice => {
        const date = new Date(invoice.created_at).toLocaleDateString('es-ES');
        const amount = `$${(invoice.amount / 100).toFixed(2)}`;
        const statusClass = invoice.status === 'paid' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
        const statusText = invoice.status === 'paid' ? 'Pagado' : 'Fallido';
        return `
            <tr class="text-sm text-gray-800">
                <td class="p-3">${date}</td>
                <td class="p-3">${invoice.plan_name}</td>
                <td class="p-3 font-medium">${amount}</td>
                <td class="p-3"><span class="px-2 py-1 text-xs font-semibold rounded-full ${statusClass}">${statusText}</span></td>
                <td class="p-3"><a href="${invoice.invoice_url}" target="_blank" class="text-indigo-600 hover:underline">Descargar</a></td>
            </tr>
        `;
    }).join('');
}

function showPasswordFeedback(message, type) {
  passwordFeedback.textContent = message;
  passwordFeedback.className = 'text-sm mt-2';
  passwordFeedback.classList.add(type === 'error' ? 'text-red-600' : 'text-green-600');
  setTimeout(() => { passwordFeedback.textContent = ''; }, 5000);
}