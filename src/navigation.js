// src/navigation.js
import { supabase } from './supabaseClient.js';

async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = '/index.html';
}

// ...tu código anterior

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
    // Abrir al pasar el mouse
    userMenuButton.addEventListener('mouseenter', () => {
      userMenu.classList.remove('hidden');
    });

// Cerrar cuando se sale del botón o del menú
    userMenuButton.addEventListener('mouseleave', () => {
      setTimeout(() => {
        if (!userMenu.matches(':hover')) {
          userMenu.classList.add('hidden');
        }
      }, 150);
    });

    userMenu.addEventListener('mouseleave', () => {
      userMenu.classList.add('hidden');
    });

    userMenu.addEventListener('mouseenter', () => {
      userMenu.classList.remove('hidden');
    });
  }


    // Lógica usuario supabase
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
        document.getElementById('user-email').textContent = user.email;
        document.getElementById('mobile-user-email').textContent = user.email;

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

    // Resaltar link activo
    const currentPage = window.location.pathname.split('/').pop();
    if (['lista-avisos.html','crear-aviso.html','detalles-aviso.html'].includes(currentPage)) {
        document.getElementById('nav-link-busquedas').classList.add('text-indigo-600');
    } else if (currentPage === 'base-talentos.html') {
        document.getElementById('nav-link-talentos').classList.add('text-indigo-600');
    } else if (currentPage === 'carga-masiva.html') {
        document.getElementById('nav-link-carga').classList.add('text-indigo-600');
    }
}


loadNav();