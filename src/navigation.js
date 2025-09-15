// src/navigation.js
import { supabase } from './lib/supabaseClient.js';

async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = '/index.html';
}

async function loadNav() {
    const response = await fetch('/nav.html');
    const navHtml = await response.text();
    document.getElementById('navbar-placeholder').innerHTML = navHtml;

    // Lógica menú móvil
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const mobileMenu = document.getElementById('mobile-menu');
    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', () => {
            mobileMenu.classList.toggle('hidden');
        });
    }

   // --- DROPDOWN DE PERFIL (hover) ---
  const userMenuButton = document.getElementById('user-menu-button');
  const userMenu = document.getElementById('user-menu');

  if (userMenuButton && userMenu) {
    userMenuButton.addEventListener('mouseenter', () => userMenu.classList.remove('hidden'));
    userMenuButton.addEventListener('mouseleave', () => setTimeout(() => {
        if (!userMenu.matches(':hover')) userMenu.classList.add('hidden');
    }, 150));
    userMenu.addEventListener('mouseleave', () => userMenu.classList.add('hidden'));
    userMenu.addEventListener('mouseenter', () => userMenu.classList.remove('hidden'));
  }

    // Lógica de usuario de Supabase (¡ACTUALIZADA!)
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
        const userEmailElement = document.getElementById('user-email');
        const mobileUserEmailElement = document.getElementById('mobile-user-email');
        if(userEmailElement) userEmailElement.textContent = user.email;
        if(mobileUserEmailElement) mobileUserEmailElement.textContent = user.email;

        // Consultamos la tabla 'app_saas_users' para obtener el plan
        const { data: profile, error } = await supabase
            .from('app_saas_users')
            .select('subscription_plan')
            .eq('id', user.id)
            .single();

        if (profile) {
            const planName = profile.subscription_plan.charAt(0).toUpperCase() + profile.subscription_plan.slice(1);
            const planText = `${planName} Plan`;
            
            const planInfoElement = document.getElementById('plan-info');
            const mobilePlanInfoElement = document.getElementById('mobile-plan-info');

            if(planInfoElement) planInfoElement.textContent = planText;
            if(mobilePlanInfoElement) mobilePlanInfoElement.textContent = planText;
        } else if (error) {
            console.error("Error al cargar el perfil del usuario:", error.message);
        }
    }

    const logoutBtn = document.getElementById('logout-btn');
    const mobileLogoutBtn = document.getElementById('mobile-logout-btn');
    if(logoutBtn) logoutBtn.addEventListener('click', handleLogout);
    if(mobileLogoutBtn) mobileLogoutBtn.addEventListener('click', handleLogout);

    // Resaltar link activo
    const currentPage = window.location.pathname.split('/').pop();
    const navLinkBusquedas = document.getElementById('nav-link-busquedas');
    const navLinkTalentos = document.getElementById('nav-link-talentos');
    const navLinkCarga = document.getElementById('nav-link-carga');

    if (['lista-avisos.html','crear-aviso.html','detalles-aviso.html'].includes(currentPage) && navLinkBusquedas) {
        navLinkBusquedas.classList.add('text-indigo-600');
    } else if (currentPage === 'base-talentos.html' && navLinkTalentos) {
        navLinkTalentos.classList.add('text-indigo-600');
    } else if (currentPage === 'carga-masiva.html' && navLinkCarga) {
        navLinkCarga.classList.add('text-indigo-600');
    }
}

loadNav();