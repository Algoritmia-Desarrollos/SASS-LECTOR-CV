import { supabase } from './lib/supabaseClient.js';
// ... (mantén tus selectores del DOM)
const joinDateDisplay = document.getElementById('join-date');
const avisosCountDisplay = document.getElementById('avisos-count');
const candidatosCountDisplay = document.getElementById('candidatos-count');
const totalAnalysisDisplay = document.getElementById('total-analysis-count');
const currentPlanDisplay = document.getElementById('current-plan');
const cvCountDisplay = document.getElementById('cv-count');
const cvLimitDisplay = document.getElementById('cv-limit');
const usageBar = document.getElementById('usage-bar');


// --- Nuevos límites de planes ---
const planLimits = {
    gratis: 50,
    basico: 2000,
    profesional: Infinity
};

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Usuario no encontrado.");

    const [profileRes, avisosRes, candidatosRes] = await Promise.all([
        supabase.from('app_saas_users').select('subscription_plan, cv_read_count').eq('id', user.id).single(),
        supabase.from('app_saas_avisos').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('app_saas_candidatos').select('id', { count: 'exact', head: true }).eq('user_id', user.id)
    ]);
    
    // ... (código para mostrar datos)
    if (profileRes.error) throw profileRes.error;
    if (avisosRes.error) throw avisosRes.error;
    if (candidatosRes.error) throw candidatosRes.error;

    const profile = profileRes.data;
    const currentPlan = profile.subscription_plan || 'gratis';
    const limit = planLimits[currentPlan];
    const planName = currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1);
    
    joinDateDisplay.textContent = new Date(user.created_at).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
    avisosCountDisplay.textContent = avisosRes.count;
    candidatosCountDisplay.textContent = candidatosRes.count;
    totalAnalysisDisplay.textContent = profile.cv_read_count;
    currentPlanDisplay.textContent = planName;
    cvCountDisplay.textContent = profile.cv_read_count;

    if (limit === Infinity) {
        cvLimitDisplay.textContent = `/ Ilimitados este mes`;
        usageBar.style.width = `100%`;
    } else {
        cvLimitDisplay.textContent = `/ ${limit} analizados este mes`;
        const usagePercentage = Math.min((profile.cv_read_count / limit) * 100, 100);
        usageBar.style.width = `${usagePercentage}%`;
    }

  } catch (error) {
    console.error("Error al cargar datos de la cuenta:", error);
  }
});