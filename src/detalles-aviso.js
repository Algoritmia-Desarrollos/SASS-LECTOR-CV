// src/detalles-aviso.js
import { supabase } from './supabaseClient.js';

// --- SELECTORES DEL DOM ---
const avisoTitulo = document.getElementById('aviso-titulo');
const avisoDescripcion = document.getElementById('aviso-descripcion');
const necesariasList = document.getElementById('necesarias-list');
const deseablesList = document.getElementById('deseables-list');
const avisoIdSpan = document.getElementById('aviso-id');
const avisoMaxCvSpan2 = document.getElementById('aviso-max-cv-2');
const avisoValidoHastaSpan = document.getElementById('aviso-valido-hasta');
const linkPostulanteInput = document.getElementById('link-postulante');
const copiarLinkBtn = document.getElementById('copiar-link-btn');
const copyIcon = document.getElementById('copy-icon');
const postulantesCountSpan = document.getElementById('postulaciones-count');
const verPostuladosBtn = document.getElementById('ver-postulados-btn');
const deleteAvisoBtn = document.getElementById('delete-aviso-btn');
const qrCodeContainer = document.getElementById('qr-code-container');
const openLinkBtn = document.getElementById('open-link-btn');
const addFromBaseBtn = document.getElementById('add-from-base-btn');
const addFromAvisoBtn = document.getElementById('add-from-aviso-btn');


// --- ESTADO ---
let avisoActivo = null;

// --- LÓGICA PRINCIPAL ---
window.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    const avisoId = params.get('id');

    if (!avisoId) {
        alert("ID de aviso no encontrado.");
        window.location.href = 'lista-avisos.html';
        return;
    }

    await loadAvisoDetails(avisoId);
});


async function loadAvisoDetails(id) {
    const { data, error } = await supabase
        .from('app_saas_avisos')
        .select('*')
        .eq('id', id)
        .single();

    if (error) {
        console.error('Error cargando detalles del aviso:', error);
        document.body.innerHTML = `<div class="text-center p-10"><h1>Error</h1><p>No se pudo cargar el aviso.</p><a href="lista-avisos.html" class="text-indigo-600">Volver</a></div>`;
        return;
    }

    avisoActivo = data;
    populateUI(avisoActivo);
}

function populateUI(aviso) {
    avisoTitulo.textContent = aviso.titulo;
    avisoDescripcion.textContent = aviso.descripcion;
    
    renderCondiciones(necesariasList, aviso.condiciones_necesarias, 'No se especificaron condiciones necesarias.');
    renderCondiciones(deseablesList, aviso.condiciones_deseables, 'No se especificaron condiciones deseables.');
    
    avisoIdSpan.textContent = aviso.id;
    avisoMaxCvSpan2.textContent = aviso.max_cv || 'Ilimitados';
    avisoValidoHastaSpan.textContent = new Date(aviso.valido_hasta).toLocaleDateString('es-AR', { timeZone: 'UTC' });
    
    const publicLink = `${window.location.origin}/postulacion.html?avisoId=${aviso.id}`;
    linkPostulanteInput.value = publicLink;

    postulantesCountSpan.textContent = aviso.postulaciones_count || 0;
    verPostuladosBtn.href = `resumenes.html?avisoId=${aviso.id}`;

    // --- LÓGICA DEL QR ---
    qrCodeContainer.innerHTML = '';
    const qr = qrcode(0, 'M');
    qr.addData(publicLink);
    qr.make();
    qrCodeContainer.innerHTML = qr.createImgTag(4, 16); // Tamaño 4, margen 16px
}

function renderCondiciones(listElement, condiciones, emptyMessage) {
    listElement.innerHTML = '';
    if (condiciones && condiciones.length > 0) {
        condiciones.forEach(condicion => {
            const li = document.createElement('li');
            li.textContent = condicion;
            listElement.appendChild(li);
        });
    } else {
        const li = document.createElement('li');
        li.textContent = emptyMessage;
        li.classList.add('text-gray-400');
        listElement.appendChild(li);
    }
}

// --- MANEJO DE EVENTOS ---
copiarLinkBtn.addEventListener('click', () => {
    linkPostulanteInput.select();
    navigator.clipboard.writeText(linkPostulanteInput.value).then(() => {
        copyIcon.classList.remove('fa-copy');
        copyIcon.classList.add('fa-check');
        setTimeout(() => {
            copyIcon.classList.remove('fa-check');
            copyIcon.classList.add('fa-copy');
        }, 2000);
    });
});

openLinkBtn.addEventListener('click', () => {
    if (linkPostulanteInput.value) {
        window.open(linkPostulanteInput.value, '_blank');
    }
});

deleteAvisoBtn.addEventListener('click', async () => {
    if (!avisoActivo) return;

    if (confirm(`¿Estás seguro de que quieres eliminar el aviso "${avisoActivo.titulo}"?`)) {
        // Lógica de eliminación...
        const { error } = await supabase
            .from('app_saas_avisos')
            .delete()
            .eq('id', avisoActivo.id);

        if (error) {
            alert('Error al eliminar el aviso.');
        } else {
            alert('Aviso eliminado correctamente.');
            window.location.href = 'lista-avisos.html';
        }
    }
});

// Botones con funcionalidad pendiente
addFromBaseBtn.addEventListener('click', () => {
    alert('Funcionalidad "Agregar desde Base" pendiente de implementación.');
});

addFromAvisoBtn.addEventListener('click', () => {
    alert('Funcionalidad "Agregar desde Aviso" pendiente de implementación.');
});