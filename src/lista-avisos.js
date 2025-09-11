// src/lista-avisos.js
import { supabase } from './supabaseClient.js';

// --- SELECTORES DEL DOM ---
const avisoListBody = document.getElementById('aviso-list-body');

// Elementos de usuario y logout
const userEmailDisplay = document.getElementById('user-email');
const planInfoDisplay = document.getElementById('plan-info');
const logoutBtn = document.getElementById('logout-btn');
const mobileUserEmailDisplay = document.getElementById('mobile-user-email');
const mobilePlanInfoDisplay = document.getElementById('mobile-plan-info');
const mobileLogoutBtn = document.getElementById('mobile-logout-btn');

// Banner de prueba gratuita
const freeTrialBanner = document.getElementById('free-trial-banner');
const cvCountDisplay = document.getElementById('cv-count');
const cvLimitDisplay = document.getElementById('cv-limit');

// Menú móvil
const mobileMenuBtn = document.getElementById('mobile-menu-btn');
const mobileMenu = document.getElementById('mobile-menu');

// --- LÓGICA PRINCIPAL ---

// Al cargar la página, se ejecuta la función principal.
window.addEventListener('DOMContentLoaded', async () => {
    await Promise.all([
        loadUserInfo(),
        loadAvisos()
    ]);
});

// --- FUNCIONES ---

/**
 * Carga la información del perfil del usuario y la muestra en la UI.
 */
async function loadUserInfo() {
    // Obtenemos la sesión actual para saber quién es el usuario.
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
        console.error('Error o no hay sesión, el guardián debería haber redirigido.');
        return;
    }
    const user = session.user;
    const userEmail = user.email;

    // Mostramos el email del usuario en la barra de navegación.
    if (userEmailDisplay) userEmailDisplay.textContent = userEmail;
    if (mobileUserEmailDisplay) mobileUserEmailDisplay.textContent = userEmail;

   // Así debe quedar la primera sección:
const { data: profile, error: profileError } = await supabase
    .from('app_saas_users') // <--- CORREGIDO
    .select('subscription_plan, cv_read_count')
    // ...

// Y así la segunda:
const { data: avisos, error } = await supabase
    .from('app_saas_avisos') // <--- CORREGIDO
    .select('id, titulo, valido_hasta, max_cv, postulaciones_count')
    // ...

    // Mostramos la información del plan.
    if (planInfoDisplay) planInfoDisplay.textContent = `${profile.subscription_plan} Plan`;
    if (mobilePlanInfoDisplay) mobilePlanInfoDisplay.textContent = `${profile.subscription_plan} Plan`;

    // Si es el plan gratuito, mostramos el banner con el contador.
    if (profile.subscription_plan === 'free') {
        if(freeTrialBanner) freeTrialBanner.classList.remove('hidden');
        if(cvCountDisplay) cvCountDisplay.textContent = profile.cv_read_count;
        if(cvLimitDisplay) cvLimitDisplay.textContent = 100; // Límite del plan gratuito
    }
}

/**
 * Obtiene los avisos del usuario actual desde Supabase y los muestra en la tabla.
 */
async function loadAvisos() {
    if (!avisoListBody) return;

    try {
        // Hacemos la consulta a la nueva tabla APP_SAAS_AVISOS.
        // Gracias a RLS (Row Level Security), Supabase automáticamente filtrará
        // y devolverá solo los avisos que pertenecen al usuario autenticado.
        const { data: avisos, error } = await supabase
    .from('app_saas_avisos') // <-- ASÍ DEBE QUEDAR
            .select('id, titulo, valido_hasta, max_cv, postulaciones_count')
            .order('created_at', { ascending: false });

        if (error) throw error;
        renderizarTabla(avisos);

    } catch (error) {
        console.error("Error al cargar los avisos:", error);
        avisoListBody.innerHTML = `<tr><td colspan="4" class="text-center py-6 text-red-500">Error al cargar los avisos.</td></tr>`;
    }
}

/**
 * Dibuja las filas de la tabla con los datos de los avisos.
 */
function renderizarTabla(avisos) {
    if (!avisos || avisos.length === 0) {
        avisoListBody.innerHTML = `
            <tr>
                <td colspan="4" class="text-center py-10">
                    <i class="fa-solid fa-folder-open text-3xl text-gray-300"></i>
                    <h3 class="mt-2 text-lg font-medium text-gray-900">Aún no has creado ninguna búsqueda</h3>
                    <p class="mt-1 text-sm text-gray-500">¡Crea tu primer aviso para empezar a reclutar!</p>
                </td>
            </tr>
        `;
        return;
    }

    avisoListBody.innerHTML = '';
    avisos.forEach(aviso => {
        const validoHasta = new Date(aviso.valido_hasta).toLocaleDateString('es-AR', {
            year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC'
        });

        const row = document.createElement('tr');
        row.className = 'hover:bg-gray-50';
        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm font-semibold text-gray-900">${aviso.titulo}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="text-sm text-gray-800 font-medium">${aviso.postulaciones_count || 0}</span>
                <span class="text-sm text-gray-500">/ ${aviso.max_cv || '∞'}</span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">${validoHasta}</td>
            <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                <a href="resumenes.html?avisoId=${aviso.id}" class="text-indigo-600 hover:text-indigo-900">Postulantes</a>
                <a href="detalles-aviso.html?id=${aviso.id}" class="text-gray-500 hover:text-gray-800">Detalles</a>
            </td>
        `;
        avisoListBody.appendChild(row);
    });
}

/**
 * Cierra la sesión del usuario y lo redirige al login.
 */
async function handleLogout() {
    const { error } = await supabase.auth.signOut();
    if (error) {
        console.error("Error al cerrar sesión:", error);
    } else {
        // Redirige a la página de inicio, no a la de login.
        window.location.href = '/index.html';
    }
}


// --- LISTENERS DE EVENTOS ---
logoutBtn.addEventListener('click', handleLogout);
mobileLogoutBtn.addEventListener('click', handleLogout);

mobileMenuBtn.addEventListener('click', () => {
    mobileMenu.classList.toggle('hidden');
});