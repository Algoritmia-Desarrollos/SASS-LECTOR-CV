// src/auth-guard.js
import { supabase } from './supabaseClient.js';

// Verificamos la sesión del usuario inmediatamente al cargar el script.
const { data: { session } } = await supabase.auth.getSession();

if (!session) {
    // Si NO hay sesión, no se carga el resto de la página.
    // Redirigimos al usuario a la página de login.
    alert("Acceso denegado. Por favor, inicia sesión para continuar.");
    window.location.href = '/login.html';
}

// Si el script llega hasta aquí, significa que hay una sesión activa
// y se permite que el resto de la página se cargue normalmente.