// src/auth.js
import { supabase } from './supabaseClient.js';

// --- SELECTORES DEL DOM ---
const googleAuthBtn = document.getElementById('google-auth-btn');
const emailInput = document.getElementById('email-input');
const passwordInput = document.getElementById('password-input');
const errorMessage = document.getElementById('error-message');
const successView = document.getElementById('success-view');
const authView = document.getElementById('auth-view');
const loginBtn = document.getElementById('login-btn');
const registerBtn = document.getElementById('register-btn');

// --- LÓGICA DE AUTENTICACIÓN ---

// Redirigir si el usuario ya tiene una sesión activa
supabase.auth.onAuthStateChange((event, session) => {
    if (session) {
        window.location.href = 'lista-avisos.html';
    }
});

// Listener para el botón de INICIAR SESIÓN
loginBtn.addEventListener('click', async () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();
    if (!email || !password) {
        showError("Por favor, completa todos los campos.");
        return;
    }
    setLoading(true);

    try {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
    } catch (error) {
        showError(getFriendlyErrorMessage(error));
    } finally {
        setLoading(false);
    }
});



registerBtn.addEventListener('click', async () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();
    if (!email || !password) {
        showError("Por favor, completa todos los campos.");
        return;
    }
    setLoading(true);

    try {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        // No es necesario mostrar successView.
        // El listener onAuthStateChange se encargará de la redirección.
    } catch (error) {
        showError(getFriendlyErrorMessage(error));
    } finally {
        setLoading(false);
    }
});

// Listener para el botón de Google
googleAuthBtn.addEventListener('click', async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: window.location.origin + '/lista-avisos.html'
        }
    });
    if (error) {
        showError(getFriendlyErrorMessage(error));
        setLoading(false);
    }
});

// --- FUNCIONES AUXILIARES ---

function setLoading(isLoading) {
    loginBtn.disabled = isLoading;
    registerBtn.disabled = isLoading;
    googleAuthBtn.disabled = isLoading;
    
    if (isLoading) {
        loginBtn.textContent = 'Procesando...';
        registerBtn.textContent = 'Procesando...';
    } else {
        loginBtn.textContent = 'Iniciar Sesión';
        registerBtn.textContent = 'Crear Cuenta';
    }
}

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.remove('hidden');
}

function hideError() {
    errorMessage.classList.add('hidden');
}

// =================================================================
//    AQUÍ ESTÁ LA LÓGICA MEJORADA PARA LOS MENSAJES DE ERROR
// =================================================================
function getFriendlyErrorMessage(error) {
    // Si el mensaje de error de Supabase incluye "User already registered",
    // mostramos tu mensaje personalizado.
    if (error.message.includes('User already registered')) {
        return 'Este email ya está registrado. Por favor, inicia sesión.';
    }
    if (error.message.includes('Invalid login credentials')) {
        return 'Email o contraseña incorrectos.';
    }
    if (error.message.includes('Password should be at least 6 characters')) {
        return 'La contraseña debe tener al menos 6 caracteres.';
    }
    // Para cualquier otro error, mostramos un mensaje genérico.
    return 'Ocurrió un error. Por favor, inténtalo de nuevo.';
}