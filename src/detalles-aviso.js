// src/detalles-aviso.js
import { supabase } from './supabaseClient.js';
import { showModal, hideModal } from './utils.js'; // Importamos nuestras funciones de utilidad

// --- SELECTORES DEL DOM ---
const avisoTitulo = document.getElementById('aviso-titulo');
const avisoDescripcion = document.getElementById('aviso-descripcion');
const necesariasList = document.getElementById('necesarias-list');
const deseablesList = document.getElementById('deseables-list');
const avisoIdSpan = document.getElementById('aviso-id');
const avisoMaxCvSpan = document.getElementById('aviso-max-cv');
const avisoValidoHastaSpan = document.getElementById('aviso-valido-hasta');
const linkPostulanteInput = document.getElementById('link-postulante');
const copiarLinkBtn = document.getElementById('copiar-link-btn');
const copyIcon = document.getElementById('copy-icon');
const postulantesHeader = document.getElementById('postulantes-header');
const verPostuladosBtn = document.getElementById('ver-postulados-btn');
const deleteAvisoBtn = document.getElementById('delete-aviso-btn');

// --- ESTADO ---
let avisoActivo = null;

// --- LÓGICA PRINCIPAL ---
window.addEventListener('DOMContentLoaded', async () => {
    // Obtenemos el ID del aviso desde la URL (ej: detalles-aviso.html?id=123)
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
        .from('app_saas_avisos') // <-- ASÍ DEBE QUEDAR
        .select('*')
        .eq('id', id)
        .single(); // Usamos single() porque esperamos un solo resultado

    if (error) {
        console.error('Error cargando detalles del aviso:', error);
        document.body.innerHTML = `<div class="text-center p-10"><h1>Error</h1><p>No se pudo cargar el aviso. Es posible que haya sido eliminado o no tengas permiso para verlo.</p><a href="lista-avisos.html" class="text-indigo-600">Volver</a></div>`;
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
    avisoMaxCvSpan.textContent = aviso.max_cv || 'Ilimitados';
    avisoValidoHastaSpan.textContent = new Date(aviso.valido_hasta).toLocaleDateString('es-AR', { timeZone: 'UTC' });
    
    // Generamos el link público para los candidatos
    const publicLink = `${window.location.origin}/postulacion.html?avisoId=${aviso.id}`;
    linkPostulanteInput.value = publicLink;

    postulantesHeader.textContent = `Ver Postulados (${aviso.postulaciones_count || 0})`;
    verPostuladosBtn.href = `resumenes.html?avisoId=${aviso.id}`;
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

deleteAvisoBtn.addEventListener('click', async () => {
    if (!avisoActivo) return;

    if (confirm(`¿Estás seguro de que quieres eliminar permanentemente el aviso "${avisoActivo.titulo}" y todas sus postulaciones? Esta acción no se puede deshacer.`)) {
        deleteAvisoBtn.disabled = true;
        deleteAvisoBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Eliminando...';

        const { error } = await supabase
            .from('app_saas_avisos')
            .delete()
            .eq('id', avisoActivo.id);

        if (error) {
            alert('Error al eliminar el aviso.');
            deleteAvisoBtn.disabled = false;
            deleteAvisoBtn.innerHTML = '<i class="fa-solid fa-trash mr-2"></i> Eliminar';
        } else {
            alert('Aviso eliminado correctamente.');
            window.location.href = 'lista-avisos.html';
        }
    }
});

// Por ahora, el botón de editar simplemente mostrará una alerta.
// En un paso futuro, implementaremos el modal completo.
document.getElementById('edit-aviso-btn').addEventListener('click', () => {
    alert("La funcionalidad de edición se implementará en un próximo paso.");
    // Aquí es donde llamaríamos a showModal('modal-edit-aviso') y poblaríamos el formulario.
});