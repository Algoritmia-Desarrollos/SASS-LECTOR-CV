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

    // Consultamos nuestra tabla app_saas_users para obtener el plan y el conteo de CVs.
    const { data: profile, error: profileError } = await supabase
        .from('app_saas_users')
        .select('subscription_plan, cv_read_count')
        .eq('id', user.id)
        .single();
    
    if (profileError) {
        console.error("Error cargando perfil de usuario:", profileError);
        return;
    }

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
        // 1. Añadimos 'created_at' a la consulta
        const { data: avisos, error } = await supabase
            .from('app_saas_avisos')
            .select('id, titulo, valido_hasta, max_cv, postulaciones_count, created_at')
            .order('created_at', { ascending: false });

        if (error) throw error;
        renderizarTabla(avisos);

    } catch (error) {
        console.error("Error al cargar los avisos:", error);
        avisoListBody.innerHTML = `<tr><td colspan="5" class="text-center py-6 text-red-500">Error al cargar los avisos.</td></tr>`;
    }
}

function renderizarTabla(avisos) {
    if (!avisos || avisos.length === 0) {
        avisoListBody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center py-10">
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
        // 2. Formateamos ambas fechas
        const creadoEl = new Date(aviso.created_at).toLocaleDateString('es-AR');
        const validoHasta = new Date(aviso.valido_hasta).toLocaleDateString('es-AR');

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
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">${creadoEl}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">${validoHasta}</td>
            <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                <a href="resumenes.html?avisoId=${aviso.id}" class="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700">Postulantes</a>
                <a href="detalles-aviso.html?id=${aviso.id}" class="inline-flex items-center rounded-md bg-white px-3 py-2 text-xs font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50">Detalles</a>
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


if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
if (mobileLogoutBtn) mobileLogoutBtn.addEventListener('click', handleLogout);

if (mobileMenuBtn) {
    mobileMenuBtn.addEventListener('click', () => {
        mobileMenu.classList.toggle('hidden');
    });
}
