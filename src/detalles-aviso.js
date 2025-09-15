// src/detalles-aviso.js
import { supabase } from './lib/supabaseClient.js';

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

// --- SELECTORES DEL NUEVO MODAL ---
const addCandidateModal = document.getElementById('add-candidate-modal');
const modalTitleAdd = document.getElementById('modal-title-add');
const modalCloseAdd = document.getElementById('modal-close-add');
const avisoSelectionContainer = document.getElementById('aviso-selection-container');
const avisoSelect = document.getElementById('aviso-select');
const searchCandidatesInput = document.getElementById('search-candidates-input');
const candidatesListContainer = document.getElementById('candidates-list-container');
const selectAllCheckbox = document.getElementById('select-all-candidates-checkbox');
const modalCancelAdd = document.getElementById('modal-cancel-add');
const modalConfirmAdd = document.getElementById('modal-confirm-add');


// --- ESTADO ---
let avisoActivo = null;
let currentSelectionMode = null; // 'base' o 'aviso'

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

    // Event listeners para los botones principales
    addFromBaseBtn.addEventListener('click', () => openAddModal('base'));
    addFromAvisoBtn.addEventListener('click', () => openAddModal('aviso'));

    // Event listeners del modal
    modalCloseAdd.addEventListener('click', closeAddModal);
    modalCancelAdd.addEventListener('click', closeAddModal);
    avisoSelect.addEventListener('change', loadCandidatesForModal);
    searchCandidatesInput.addEventListener('input', loadCandidatesForModal);
    selectAllCheckbox.addEventListener('change', (e) => {
        candidatesListContainer.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            checkbox.checked = e.target.checked;
        });
    });
    modalConfirmAdd.addEventListener('click', addSelectedCandidates);
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
    postulantesCountSpan.textContent = aviso.postulaciones_count || 0;
    avisoValidoHastaSpan.textContent = new Date(aviso.valido_hasta).toLocaleDateString('es-AR', { timeZone: 'UTC' });
    
    const publicLink = `${window.location.origin}/postulacion.html?avisoId=${aviso.id}`;
    linkPostulanteInput.value = publicLink;
    verPostuladosBtn.href = `resumenes.html?avisoId=${aviso.id}`;

    qrCodeContainer.innerHTML = '';
    const qr = qrcode(0, 'M');
    qr.addData(publicLink);
    qr.make();
    qrCodeContainer.innerHTML = qr.createImgTag(4, 16);
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

// --- LÓGICA DEL MODAL DE AGREGAR CANDIDATOS ---

async function openAddModal(mode) {
    currentSelectionMode = mode;
    searchCandidatesInput.value = '';
    selectAllCheckbox.checked = false;
    candidatesListContainer.innerHTML = '<p class="p-4 text-center text-gray-500">Cargando...</p>';
    
    if (mode === 'base') {
        modalTitleAdd.textContent = 'Agregar desde Base de Talentos';
        avisoSelectionContainer.classList.add('hidden');
        await loadCandidatesForModal();
    } else if (mode === 'aviso') {
        modalTitleAdd.textContent = 'Agregar desde otro Aviso';
        avisoSelectionContainer.classList.remove('hidden');
        await populateAvisoSelect();
        await loadCandidatesForModal();
    }
    
    addCandidateModal.classList.remove('hidden');
}

function closeAddModal() {
    addCandidateModal.classList.add('hidden');
}

async function populateAvisoSelect() {
    const { data: avisos, error } = await supabase
        .from('app_saas_avisos')
        .select('id, titulo')
        .neq('id', avisoActivo.id)
        .order('created_at', { ascending: false });
    
    if (error) {
        console.error("Error cargando avisos:", error);
        return;
    }

    avisoSelect.innerHTML = '<option value="">Selecciona un aviso...</option>';
    avisos.forEach(aviso => {
        const option = document.createElement('option');
        option.value = aviso.id;
        option.textContent = aviso.titulo;
        avisoSelect.appendChild(option);
    });
}

async function loadCandidatesForModal() {
    candidatesListContainer.innerHTML = '<p class="p-4 text-center text-gray-500">Buscando candidatos...</p>';
    const searchTerm = searchCandidatesInput.value.toLowerCase();
    
    const { data: existingPostulaciones, error: existingError } = await supabase
        .from('app_saas_postulaciones')
        .select('candidato_id')
        .eq('aviso_id', avisoActivo.id);
    
    if (existingError) {
        candidatesListContainer.innerHTML = '<p class="p-4 text-red-500">Error al obtener postulados actuales.</p>';
        return;
    }
    const existingCandidateIds = existingPostulaciones.map(p => p.candidato_id);

    let query;

    if (currentSelectionMode === 'base') {
        query = supabase.from('app_saas_candidatos').select('id, nombre_candidato, email');
        if (existingCandidateIds.length > 0) {
            query = query.not('id', 'in', `(${existingCandidateIds.join(',')})`);
        }
    } else {
        const selectedAvisoId = avisoSelect.value;
        if (!selectedAvisoId) {
            candidatesListContainer.innerHTML = '<p class="p-4 text-center text-gray-500">Por favor, selecciona un aviso para ver sus candidatos.</p>';
            return;
        }
        
        query = supabase
            .from('app_saas_postulaciones')
            .select('candidato:app_saas_candidatos(id, nombre_candidato, email)')
            .eq('aviso_id', selectedAvisoId);

        if (existingCandidateIds.length > 0) {
            query = query.not('candidato_id', 'in', `(${existingCandidateIds.join(',')})`);
        }
    }

    if (searchTerm) {
        query = query.or(`candidato.nombre_candidato.ilike.%${searchTerm}%,candidato.email.ilike.%${searchTerm}%`);
    }

    const { data, error } = await query;
    
    if (error) {
        candidatesListContainer.innerHTML = '<p class="p-4 text-red-500">Error al cargar candidatos.</p>';
        return;
    }
    
    const candidates = (currentSelectionMode === 'aviso' ? data.map(item => item.candidato) : data).filter(Boolean);
    renderCandidatesInModal(candidates);
}

function renderCandidatesInModal(candidates) {
    if (!candidates || candidates.length === 0) {
        candidatesListContainer.innerHTML = '<p class="p-4 text-center text-gray-500">No se encontraron candidatos.</p>';
        return;
    }

    candidatesListContainer.innerHTML = candidates.map(c => `
        <div class="flex items-center justify-between p-3">
            <div class="flex items-center">
                <input type="checkbox" data-id="${c.id}" class="h-4 w-4 text-indigo-600 border-gray-300 rounded">
                <div class="ml-3">
                    <p class="text-sm font-medium text-gray-900">${c.nombre_candidato}</p>
                    <p class="text-xs text-gray-500">${c.email}</p>
                </div>
            </div>
        </div>
    `).join('');
}

async function addSelectedCandidates() {
    const selectedIds = Array.from(candidatesListContainer.querySelectorAll('input:checked')).map(cb => parseInt(cb.dataset.id));

    if (selectedIds.length === 0) {
        alert("No has seleccionado ningún candidato.");
        return;
    }

    modalConfirmAdd.disabled = true;
    modalConfirmAdd.textContent = 'Agregando...';

    // --- INICIO DE LA CORRECCIÓN: Llamada a la función RPC ---
    const { error } = await supabase.rpc('importar_candidatos_a_aviso', {
        target_aviso_id: avisoActivo.id,
        source_candidato_ids: selectedIds
    });
    // --- FIN DE LA CORRECCIÓN ---

    if (error) {
        alert(`Error al agregar los candidatos: ${error.message}`);
    } else {
        alert(`${selectedIds.length} candidato(s) agregado(s) con éxito. Se iniciará el reanálisis en segundo plano.`);
        closeAddModal();
        await loadAvisoDetails(avisoActivo.id); // Recargar para actualizar contadores
    }
    
    modalConfirmAdd.disabled = false;
    modalConfirmAdd.textContent = 'Agregar Seleccionados';
}

// --- MANEJO DE EVENTOS (sin cambios) ---
copiarLinkBtn.addEventListener('click', () => { /* ... */ });
openLinkBtn.addEventListener('click', () => { /* ... */ });
deleteAvisoBtn.addEventListener('click', async () => { /* ... */ });