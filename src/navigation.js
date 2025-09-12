// src/navigation.js
import { supabase } from './supabaseClient.js';

async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = '/index.html';
}

async function loadNav() {
    const response = await fetch('/nav.html');
    const navHtml = await response.text();
    document.getElementById('navbar-placeholder').innerHTML = navHtml;

    // Lógica para el menú móvil
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const mobileMenu = document.getElementById('mobile-menu');
    mobileMenuBtn.addEventListener('click', () => {
        mobileMenu.classList.toggle('hidden');
    });

    // Lógica de usuario y logout
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
        document.getElementById('user-email').textContent = user.email;
        document.getElementById('mobile-user-email').textContent = user.email;

        // Cargar datos del plan
        const { data: profile } = await supabase
            .from('app_saas_users')
            .select('subscription_plan')
            .eq('id', user.id)
            .single();

        if (profile) {
            const planText = `${profile.subscription_plan} Plan`;
            document.getElementById('plan-info').textContent = planText;
            document.getElementById('mobile-plan-info').textContent = planText;
        }
    }

    document.getElementById('logout-btn').addEventListener('click', handleLogout);
    document.getElementById('mobile-logout-btn').addEventListener('click', handleLogout);

    // Resaltar el link de la página activa
    const currentPage = window.location.pathname.split('/').pop();
    if (currentPage === 'lista-avisos.html' || currentPage === 'crear-aviso.html' || currentPage === 'detalles-aviso.html') {
        document.getElementById('nav-link-busquedas').classList.add('text-indigo-600');
    } else if (currentPage === 'base-talentos.html') {
        document.getElementById('nav-link-talentos').classList.add('text-indigo-600');
    } else if (currentPage === 'carga-masiva.html') {
        document.getElementById('nav-link-carga').classList.add('text-indigo-600');
    }
}

loadNav();