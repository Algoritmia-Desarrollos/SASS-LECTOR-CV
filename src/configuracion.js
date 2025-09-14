import { supabase } from './supabaseClient.js';

// --- SELECTORES DEL DOM ---
// Perfil
const fullNameInput = document.getElementById('full-name');
const companyNameInput = document.getElementById('company-name');
const saveProfileBtn = document.getElementById('save-profile-btn');

// Seguridad
const newPasswordInput = document.getElementById('new-password');
const updatePasswordBtn = document.getElementById('update-password-btn');
const passwordFeedback = document.getElementById('password-feedback');

// Facturación
const manageBillingBtn = document.getElementById('manage-billing-btn');
const invoicesList = document.getElementById('invoices-list');

// Apariencia
const themeLightBtn = document.getElementById('theme-light-btn');
const themeDarkBtn = document.getElementById('theme-dark-btn');

// Notificaciones
const notifyWeeklyCheckbox = document.getElementById('notify-weekly');
const notifyCandidatesCheckbox = document.getElementById('notify-candidates');
const notifyProductCheckbox = document.getElementById('notify-product');

// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', () => {
  loadSettingsData();
  setupEventListeners();
  applyTheme();
});

// --- LÓGICA DE CARGA DE DATOS ---
async function loadSettingsData() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  // Cargar perfil de usuario
  const { data: profile, error: profileError } = await supabase
    .from('app_saas_users')
    .select('full_name, company_name, notification_preferences')
    .eq('id', user.id)
    .single();

  if (profile) {
    fullNameInput.value = profile.full_name || '';
    companyNameInput.value = profile.company_name || '';
    // Cargar preferencias de notificación
    if (profile.notification_preferences) {
        notifyWeeklyCheckbox.checked = profile.notification_preferences.weekly_summary;
        notifyCandidatesCheckbox.checked = profile.notification_preferences.new_candidates;
        notifyProductCheckbox.checked = profile.notification_preferences.product_updates;
    }
  }

  // Cargar historial de pagos (simulado)
  // En una app real, aquí consultarías tu tabla de facturas
  renderInvoices(getFakeInvoices()); 
}

// --- MANEJO DE EVENTOS ---
function setupEventListeners() {
  saveProfileBtn.addEventListener('click', handleProfileUpdate);
  updatePasswordBtn.addEventListener('click', handleUpdatePassword);
  
  // Event listener para todas las checkboxes de notificaciones
  [notifyWeeklyCheckbox, notifyCandidatesCheckbox, notifyProductCheckbox].forEach(checkbox => {
    checkbox.addEventListener('change', handleNotificationChange);
  });

  themeLightBtn.addEventListener('click', () => setTheme('light'));
  themeDarkBtn.addEventListener('click', () => setTheme('dark'));
  
  manageBillingBtn.addEventListener('click', () => {
      alert("Redirigiendo al portal de facturación de Stripe...");
      // En producción: window.location.href = 'URL_DEL_PORTAL_DE_STRIPE';
  });
}

// --- LÓGICA DE ACCIONES ---

async function handleProfileUpdate() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const updatedProfile = {
    full_name: fullNameInput.value.trim(),
    company_name: companyNameInput.value.trim(),
  };

  const { error } = await supabase.from('app_saas_users').update(updatedProfile).eq('id', user.id);
  
  if (error) {
    alert("Error al guardar el perfil: " + error.message);
  } else {
    alert("Perfil guardado con éxito.");
  }
}

async function handleUpdatePassword() {
  // (La lógica es la misma que en la respuesta anterior)
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
  }
  updatePasswordBtn.disabled = false;
  updatePasswordBtn.textContent = 'Guardar Contraseña';
}

async function handleNotificationChange() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const prefs = {
        weekly_summary: notifyWeeklyCheckbox.checked,
        new_candidates: notifyCandidatesCheckbox.checked,
        product_updates: notifyProductCheckbox.checked,
    };
    
    const { error } = await supabase.from('app_saas_users').update({ notification_preferences: prefs }).eq('id', user.id);
    if(error) {
        alert("No se pudieron guardar tus preferencias de notificación.");
    }
}


// --- LÓGICA DE APARIENCIA (TEMA) ---
function setTheme(theme) {
  localStorage.setItem('theme', theme);
  applyTheme();
}

function applyTheme() {
  const theme = localStorage.getItem('theme') || 'light';
  if (theme === 'dark') {
    document.documentElement.classList.add('dark'); // Asumiendo que tienes estilos para dark mode en tu CSS
    themeDarkBtn.classList.add('bg-indigo-600', 'text-white');
    themeLightBtn.classList.remove('bg-indigo-600', 'text-white');
  } else {
    document.documentElement.classList.remove('dark');
    themeLightBtn.classList.add('bg-indigo-600', 'text-white');
    themeDarkBtn.classList.remove('bg-indigo-600', 'text-white');
  }
}


// --- RENDERIZADO Y FUNCIONES AUXILIARES ---
function renderInvoices(invoices) {
    if (!invoices || invoices.length === 0) {
        invoicesList.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-gray-500">No hay pagos registrados.</td></tr>`;
        return;
    }
    invoicesList.innerHTML = invoices.map(invoice => `
        <tr class="text-sm text-gray-800">
            <td class="p-3">${invoice.date}</td>
            <td class="p-3">${invoice.plan}</td>
            <td class="p-3 font-medium">${invoice.amount}</td>
            <td class="p-3">
                <span class="px-2 py-1 text-xs font-semibold rounded-full ${invoice.status === 'Pagado' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
                    ${invoice.status}
                </span>
            </td>
            <td class="p-3">
                <a href="${invoice.url}" target="_blank" class="text-indigo-600 hover:underline">Ver</a>
            </td>
        </tr>
    `).join('');
}

function getFakeInvoices() {
    // ESTO ES SIMULADO. En producción, vendría de tu base de datos.
    return [
        { date: '01/09/2025', plan: 'Básico', amount: '$29.00', status: 'Pagado', url: '#' },
        { date: '01/08/2025', plan: 'Básico', amount: '$29.00', status: 'Pagado', url: '#' },
        { date: '01/07/2025', plan: 'Básico', amount: '$29.00', status: 'Pagado', url: '#' },
    ];
}

function showPasswordFeedback(message, type) {
  passwordFeedback.textContent = message;
  passwordFeedback.className = 'text-sm mt-2';
  passwordFeedback.classList.add(type === 'error' ? 'text-red-600' : 'text-green-600');
  setTimeout(() => { passwordFeedback.textContent = ''; }, 5000);
}