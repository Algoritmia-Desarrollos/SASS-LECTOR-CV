// src/auth.js
import { supabase } from './supabaseClient.js';

// --- SELECTORES DEL DOM ---
const authForm = document.getElementById('auth-form');
const authBtn = document.getElementById('auth-btn');
const authBtnText = document.getElementById('auth-btn-text');
const googleAuthBtn = document.getElementById('google-auth-btn');
const emailInput = document.getElementById('email-input');
const passwordInput = document.getElementById('password-input');
const errorMessage = document.getElementById('error-message');
const successView = document.getElementById('success-view');
const authView = document.getElementById('auth-view');
const formTitle = document.getElementById('form-title');
const toggleAuthBtn = document.getElementById('toggle-auth-btn');
const toggleAuthText = document.getElementById('toggle-auth-text');

// --- ESTADO ---
// Esta variable controla si el formulario es para Iniciar Sesión (true) o Registrarse (false)
let isLoginView = false; // La vista inicial es para REGISTRARSE

// --- LÓGICA DE AUTENTICACIÓN ---

// Redirigir si el usuario ya tiene una sesión activa
supabase.auth.onAuthStateChange((event, session) => {
    if (session) {
        window.location.href = 'lista-avisos.html';
    }
});

// Listener para el formulario de Email/Contraseña
authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();
    if (!email || !password) {
        showError("Por favor, completa todos los campos.");
        return;
    }
    setLoading(true);

    try {
        // ====================================================================
        //    AQUÍ SE DECIDE SI REGISTRAR O INICIAR SESIÓN
        // ====================================================================
        if (isLoginView) {
            // --- Lógica de INICIO DE SESIÓN ---
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) throw error;
        } else {
            // --- Lógica de REGISTRO ---
            const { data, error } = await supabase.auth.signUp({ email, password });
            if (error) throw error;
            
            if (data.user && data.user.identities && data.user.identities.length === 0) {
                 showError("Este usuario ya existe. Por favor, inicia sesión.");
            } else {
                authView.classList.add('hidden');
                successView.classList.remove('hidden');
            }
        }
    } catch (error) {
        showError(getFriendlyErrorMessage(error));
    } finally {
        setLoading(false);
    }
});

// ====================================================================
//    AQUÍ SE MANEJA EL CLIC EN EL BOTÓN DE GOOGLE
// ====================================================================
googleAuthBtn.addEventListener('click', async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
    });
    if (error) {
        showError(getFriendlyErrorMessage(error));
        setLoading(false);
    }
});

// ====================================================================
//    AQUÍ SE MANEJA EL CAMBIO DE VISTA
// ====================================================================
toggleAuthBtn.addEventListener('click', () => {
    isLoginView = !isLoginView; // Invierte el estado (de registro a login y viceversa)
    updateAuthView();
});

// --- FUNCIONES AUXILIARES ---

// Actualiza los textos de la UI según si es vista de Login o Registro
function updateAuthView() {
    hideError();
    if (isLoginView) {
        formTitle.textContent = 'Inicia Sesión';
        authBtnText.textContent = 'Ingresar';
        toggleAuthText.textContent = '¿No tienes una cuenta?';
        toggleAuthBtn.textContent = 'Regístrate gratis';
    } else {
        formTitle.textContent = 'Crea tu cuenta gratis';
        authBtnText.textContent = 'Continuar con Email';
        toggleAuthText.textContent = '¿Ya tienes una cuenta?';
        toggleAuthBtn.textContent = 'Inicia sesión';
    }
}

function setLoading(isLoading) { /* ... (código sin cambios) */ }
function showError(message) { /* ... (código sin cambios) */ }
function hideError() { /* ... (código sin cambios) */ }
function getFriendlyErrorMessage(error) { /* ... (código sin cambios) */ }

// --- Pegado para completitud del ejemplo ---
function setLoading(isLoading) {
    authBtn.disabled = isLoading;
    googleAuthBtn.disabled = isLoading;
    if (isLoading) {
        authBtnText.textContent = 'Procesando...';
    } else {
        updateAuthView();
    }
}
function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.remove('hidden');
}
function hideError() {
    errorMessage.classList.add('hidden');
}
function getFriendlyErrorMessage(error) {
    if (error.message.includes('Invalid login credentials')) return 'Email o contraseña incorrectos.';
    if (error.message.includes('User already registered')) return 'Este email ya está registrado. Por favor, inicia sesión.';
    if (error.message.includes('Password should be at least 6 characters')) return 'La contraseña debe tener al menos 6 caracteres.';
    return 'Ocurrió un error. Por favor, inténtalo de nuevo.';
}

// Inicializa la vista por defecto al cargar la página
updateAuthView();