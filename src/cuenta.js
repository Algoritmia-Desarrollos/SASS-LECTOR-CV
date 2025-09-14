import { supabase } from './supabaseClient.js';

// --- SELECTORES DEL DOM ---
const joinDateDisplay = document.getElementById('join-date');
const avisosCountDisplay = document.getElementById('avisos-count');
const candidatosCountDisplay = document.getElementById('candidatos-count');
const totalAnalysisDisplay = document.getElementById('total-analysis-count');
const currentPlanDisplay = document.getElementById('current-plan');
const cvCountDisplay = document.getElementById('cv-count');
const cvLimitDisplay = document.getElementById('cv-limit');
const usageBar = document.getElementById('usage-bar');

document.addEventListener('DOMContentLoaded', loadAccountData);

async function loadAccountData() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("No se pudo obtener la información del usuario.");

    const [profileRes, avisosRes, candidatosRes] = await Promise.all([
        supabase.from('app_saas_users').select('subscription_plan, cv_read_count').eq('id', user.id).single(),
        supabase.from('app_saas_avisos').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('app_saas_candidatos').select('id', { count: 'exact', head: true }).eq('user_id', user.id)
    ]);
    
    if (profileRes.error) throw profileRes.error;
    if (avisosRes.error) throw avisosRes.error;
    if (candidatosRes.error) throw candidatosRes.error;

    const joinDate = new Date(user.created_at);
    joinDateDisplay.textContent = joinDate.toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });

    avisosCountDisplay.textContent = avisosRes.count;
    candidatosCountDisplay.textContent = candidatosRes.count;
    totalAnalysisDisplay.textContent = profileRes.data.cv_read_count;

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
    document.querySelector('main').innerHTML = '<p class="text-center text-red-500">No se pudieron cargar los datos de tu cuenta. Por favor, intenta de nuevo más tarde.</p>';
  }
}