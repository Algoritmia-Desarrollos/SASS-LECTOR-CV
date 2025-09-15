// src/configuracion.js
import { initializeStripe } from './lib/stripe.js';
import { initBillingModule } from './modules/billing.js';
import { initAccountModule } from './modules/account.js';
import { initSecurityModule } from './modules/security.js';

document.addEventListener('DOMContentLoaded', () => {
    // Reemplaza con tu Clave Publicable de Stripe (empieza con pk_test_ o pk_live_)
    initializeStripe('pk_test_51S7dAmGowZwzTW7QiCMdtytaka5tGNKHFv7wwNJGPgPwgKQZPL3OoxZ0E2EqV5JaECdLoylHPXkuWZzqriFYxocl000BwjtoWN'); 
  
    // Inicializa cada módulo de la página
    initAccountModule();
    initSecurityModule();
    initBillingModule();
    setupNavigation(); // La navegación se configura una sola vez
});

function setupNavigation() {
    const navLinks = document.querySelectorAll('#settings-nav a');
    const panels = document.querySelectorAll('.settings-panel');

    const handleNav = () => {
        const hash = window.location.hash || '#cuenta';
        panels.forEach(panel => {
            if(panel) panel.classList.add('hidden');
        });
        navLinks.forEach(link => {
            if(link) link.classList.remove('active');
        });
        
        const activePanel = document.getElementById(`panel-${hash.substring(1)}`);
        const activeLink = document.querySelector(`#settings-nav a[href="${hash}"]`);

        if (activePanel) activePanel.classList.remove('hidden');
        if (activeLink) activeLink.classList.add('active');
    };

    window.addEventListener('hashchange', handleNav);
    handleNav(); // Llama al inicio para establecer el estado correcto
}