// src/utils.js

/**
 * Muestra un modal y su overlay, gestionando el scroll del body.
 * @param {string} modalId - El ID del elemento del modal.
 */
export function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden'; // Evita el scroll del fondo
    }
}

/**
 * Oculta un modal y su overlay, restaurando el scroll del body.
 * @param {string} modalId - El ID del elemento del modal.
 */
export function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('hidden');
        document.body.style.overflow = ''; // Restaura el scroll
    }
}