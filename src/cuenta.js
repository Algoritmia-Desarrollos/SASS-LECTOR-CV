import { supabase } from './supabaseClient.js';

// --- SELECTORES DEL DOM ---
// Nuevas estadísticas
const joinDateDisplay = document.getElementById('join-date');
const avisosCountDisplay = document.getElementById('avisos-count');
const candidatosCountDisplay = document.getElementById('candidatos-count');
const totalAnalysisDisplay = document.getElementById('total-analysis-count');

// Plan y uso
const currentPlanDisplay = document.getElementById('current-plan');
const cvCountDisplay = document.getElementById('cv-count');
const cvLimitDisplay = document.getElementById('cv-limit');
const usageBar = document.getElementById('usage-bar');

// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', loadAccountData);

// --- LÓGICA DE CARGA ---
async function loadAccountData() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("No se pudo obtener la información del usuario.");

    // --- Usar Promise.all para cargar todo en paralelo ---
    const [profileRes, avisosRes, candidatosRes] = await Promise.all([
        supabase.from('app_saas_users').select('subscription_plan, cv_read_count').eq('id', user.id).single(),
        supabase.from('app_saas_avisos').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('app_saas_candidatos').select('id', { count: 'exact', head: true }).eq('user_id', user.id)
    ]);
    
    // --- Manejar errores de las consultas ---
    if (profileRes.error) throw profileRes.error;
    if (avisosRes.error) throw avisosRes.error;
    if (candidatosRes.error) throw candidatosRes.error;

    // --- Poblar los datos en la UI ---
    
    // Fecha de registro
    const joinDate = new Date(user.created_at);
    joinDateDisplay.textContent = joinDate.toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });

    // Estadísticas
    avisosCountDisplay.textContent = avisosRes.count;
    candidatosCountDisplay.textContent = candidatosRes.count;
    totalAnalysisDisplay.textContent = profileRes.data.cv_read_count;

    // Información del plan y uso
    const profile = profileRes.data;
    const planName = profile.subscription_plan.charAt(0).toUpperCase() + profile.subscription_plan.slice(1);
    currentPlanDisplay.textContent = planName;

    const limits = { free: 100, basic: 500, professional: 2000 };
    const limit = limits[profile.subscription_plan] || 100;
    
    cvCountDisplay.textContent = profile.cv_read_count;
    cvLimitDisplay.textContent = `/ ${limit} analizados`;
    
    const usagePercentage = Math.min((profile.cv_read_count / limit) * 100, 100);
    usageBar.style.width = `${usagePercentage}%`;

  } catch (error) {
    console.error("Error al cargar datos de la cuenta:", error);
    // Mostrar un mensaje de error genérico en la UI
    document.querySelector('main').innerHTML = '<p class="text-center text-red-500">No se pudieron cargar los datos de tu cuenta. Por favor, intenta de nuevo más tarde.</p>';
  }
}