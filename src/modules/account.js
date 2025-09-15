// src/modules/account.js
import { supabase } from '../lib/supabaseClient.js';

const form = document.getElementById('account-form');
const nameInput = document.getElementById('account-name');
const usernameInput = document.getElementById('account-username');
const emailInput = document.getElementById('account-email');
const bioInput = document.getElementById('account-bio');
const websiteInput = document.getElementById('account-website');
const updateBtn = document.getElementById('update-profile-btn');

let user = null;

async function loadProfile() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    user = session.user;

    emailInput.value = user.email;

    const { data: profile, error } = await supabase
        .from('app_saas_users')
        .select('full_name, username, website, bio')
        .eq('id', user.id)
        .single();
    
    if (error) {
        console.warn('Error cargando perfil:', error.message);
        return;
    }

    if (profile) {
        nameInput.value = profile.full_name || '';
        usernameInput.value = profile.username || '';
        websiteInput.value = profile.website || '';
        bioInput.value = profile.bio || '';
    }
}

async function handleUpdateProfile(e) {
    e.preventDefault();
    updateBtn.disabled = true;
    updateBtn.textContent = 'Guardando...';

    const updates = {
        id: user.id,
        full_name: nameInput.value,
        username: usernameInput.value,
        website: websiteInput.value,
        bio: bioInput.value,
    };

    const { error } = await supabase.from('app_saas_users').update(updates).eq('id', user.id);

    if (error) {
        alert(`Error al actualizar: ${error.message}`);
    } else {
        alert('Perfil actualizado con éxito.');
    }

    updateBtn.disabled = false;
    updateBtn.textContent = 'Guardar Cambios';
}

export function initAccountModule() {
    if (!form) return;
    loadProfile();
    form.addEventListener('submit', handleUpdateProfile);
}