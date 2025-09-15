// src/modules/security.js
import { supabase } from '../lib/supabaseClient.js';

const showPasswordFormBtn = document.getElementById('show-password-form-btn');
const securityView = document.getElementById('security-view');
const passwordFormContainer = document.getElementById('password-form-container');
const newPasswordInput = document.getElementById('new-password');
const updatePasswordBtn = document.getElementById('update-password-btn');
const cancelPasswordBtn = document.getElementById('cancel-password-btn');
const passwordFeedback = document.getElementById('password-feedback');

function togglePasswordForm(show) {
    if(securityView) securityView.classList.toggle('hidden', show);
    if(passwordFormContainer) passwordFormContainer.classList.toggle('hidden', !show);
}

async function handleUpdatePassword() {
  const newPassword = newPasswordInput.value;
  if (newPassword.length < 6) {
    showPasswordFeedback("La contraseña debe tener al menos 6 caracteres.", "error");
    return;
  }
  updatePasswordBtn.disabled = true;
  updatePasswordBtn.textContent = 'Guardando...';
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) {
    showPasswordFeedback(`Error: ${error.message}`, "error");
  } else {
    showPasswordFeedback("¡Contraseña actualizada con éxito!", "success");
    newPasswordInput.value = '';
    setTimeout(() => togglePasswordForm(false), 2000);
  }
  updatePasswordBtn.disabled = false;
  updatePasswordBtn.textContent = 'Guardar Contraseña';
}

function showPasswordFeedback(message, type) {
  if (!passwordFeedback) return;
  passwordFeedback.textContent = message;
  passwordFeedback.className = 'text-sm mt-2';
  passwordFeedback.classList.add(type === 'error' ? 'text-red-600' : 'text-green-600');
  setTimeout(() => { passwordFeedback.textContent = ''; }, 5000);
}

export function initSecurityModule() {
    if (!securityView) return;
    showPasswordFormBtn.addEventListener('click', () => togglePasswordForm(true));
    cancelPasswordBtn.addEventListener('click', () => togglePasswordForm(false));
    updatePasswordBtn.addEventListener('click', handleUpdatePassword);
}