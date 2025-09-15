// src/lista-avisos.js
import { supabase } from './lib/supabaseClient.js';

// --- SELECTORES DEL DOM ---
const avisoListBody = document.getElementById('aviso-list-body');
const freeTrialBanner = document.getElementById('free-trial-banner');
const cvCountDisplay = document.getElementById('cv-count');
const cvLimitDisplay = document.getElementById('cv-limit');

// --- LÓGICA PRINCIPAL ---
window.addEventListener('DOMContentLoaded', async () => {
    await Promise.all([
        loadUserInfoAndPlanLimits(), // Renombramos para mayor claridad
        loadAvisos()
    ]);
});

// --- FUNCIONES ---

// LÓGICA DE LÍMITES DE PLAN (¡ACTUALIZADA!)
async function loadUserInfoAndPlanLimits() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile, error } = await supabase
        .from('app_saas_users')
        .select('subscription_plan, cv_read_count')
        .eq('id', user.id)
        .single();
    
    if (error) {
        console.error("Error cargando perfil de usuario:", error);
        return;
    }

    // Definimos los límites de cada plan
    const planLimits = {
        free: 100,
        basic: 500,
        professional: 2000
    };

    const currentPlan = profile.subscription_plan;
    const limit = planLimits[currentPlan] || 100; // Por defecto, 100 si el plan no se encuentra

    if (freeTrialBanner && cvCountDisplay && cvLimitDisplay) {
        freeTrialBanner.classList.remove('hidden'); // Mostramos el banner para todos los planes
        cvCountDisplay.textContent = profile.cv_read_count;
        cvLimitDisplay.textContent = limit;

        // Personalizamos el mensaje del banner según el plan
        const bannerTextElement = freeTrialBanner.querySelector('p');
        if (currentPlan === 'free') {
            bannerTextElement.innerHTML = `Estás en el plan gratuito. Has utilizado <strong>${profile.cv_read_count}</strong> de <strong>${limit}</strong> análisis de CV. <a href="planes.html" class="font-bold underline hover:text-indigo-900">Actualiza tu plan</a> para obtener más.`;
        } else {
            const planName = currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1);
            bannerTextElement.innerHTML = `Estás en el plan ${planName}. Has utilizado <strong>${profile.cv_read_count}</strong> de <strong>${limit}</strong> análisis de CV este mes.`;
        }
    }
}

// Obtiene los avisos del usuario y los muestra en la tabla
async function loadAvisos() {
    if (!avisoListBody) return;
    avisoListBody.innerHTML = `<tr><td colspan="5" class="text-center py-10"><i class="fa-solid fa-spinner fa-spin text-2xl text-gray-400"></i></td></tr>`;

    try {
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
            </tr>`;
        return;
    }

    avisoListBody.innerHTML = '';
    avisos.forEach(aviso => {
        const creadoEl = new Date(aviso.created_at).toLocaleDateString('es-AR');
        const validoHasta = new Date(aviso.valido_hasta).toLocaleDateString('es-AR');
        const row = document.createElement('tr');
        row.className = 'hover:bg-gray-50';
        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap"><div class="text-sm font-semibold text-gray-900">${aviso.titulo}</div></td>
            <td class="px-6 py-4 whitespace-nowrap"><span class="text-sm text-gray-800 font-medium">${aviso.postulaciones_count || 0}</span><span class="text-sm text-gray-500"> / ${aviso.max_cv || '∞'}</span></td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">${creadoEl}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">${validoHasta}</td>
            <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                <a href="resumenes.html?avisoId=${aviso.id}" class="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700">Postulantes</a>
                <a href="detalles-aviso.html?id=${aviso.id}" class="inline-flex items-center rounded-md bg-white px-3 py-2 text-xs font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50">Detalles</a>
            </td>`;
        avisoListBody.appendChild(row);
    });
}