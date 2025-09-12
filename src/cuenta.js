import { supabase } from './supabaseClient.js';
import './navigation.js'; // carga la nav

async function loadCuenta() {
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    document.getElementById('cuenta-email').textContent = user.email;

    const { data: profile } = await supabase
      .from('app_saas_users')
      .select('subscription_plan')
      .eq('id', user.id)
      .single();

    if (profile) {
      document.getElementById('cuenta-plan').textContent = `${profile.subscription_plan} Plan`;
    }
  } else {
    window.location.href = "/index.html"; // redirige si no hay sesión
  }

  // Logout
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.href = '/index.html';
  });
}

loadCuenta();
