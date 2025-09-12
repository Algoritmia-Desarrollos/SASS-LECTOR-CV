// --- UI de acciones en lote ---
function renderBulkActions() {
    // Eliminar el contenedor anterior si existe
    let old = document.getElementById('bulk-actions-modal');
    if (old) old.remove();
    // Crear modal fijo abajo
    let modal = document.createElement('div');
    modal.id = 'bulk-actions-modal';
    modal.className = 'fixed bottom-0 left-0 w-full z-40 flex justify-center pointer-events-none';
    modal.innerHTML = `
        <div id="bulk-actions-content" class="${selectedCandidates.size > 0 ? '' : 'hidden'} pointer-events-auto bg-white shadow-lg border-t border-gray-200 rounded-t-lg max-w-2xl w-full mx-auto mb-4 flex flex-col md:flex-row items-center gap-4 px-6 py-4">
            <span class="font-semibold text-gray-800" id="bulk-actions-count"></span>
            <div class="flex gap-2 flex-wrap">
                <button id="bulk-move-btn" class="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded font-semibold">Mover a carpeta...</button>
                <button id="bulk-delete-btn" class="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded font-semibold">Eliminar</button>
                <button id="bulk-cancel-btn" class="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded font-semibold">Cancelar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    const content = document.getElementById('bulk-actions-content');
    const count = document.getElementById('bulk-actions-count');
    const selectedCount = selectedCandidates.size;
    if (selectedCount > 0) {
        content.classList.remove('hidden');
        count.textContent = `${selectedCount} seleccionado${selectedCount > 1 ? 's' : ''}`;
        document.getElementById('bulk-move-btn').onclick = showBulkMovePrompt;
        document.getElementById('bulk-delete-btn').onclick = handleBulkDelete;
        document.getElementById('bulk-cancel-btn').onclick = () => {
            selectedCandidates.clear();
            renderCandidates();
            renderBulkActions();
        };
    } else {
        content.classList.add('hidden');
    }
}
// src/base-talentos.js
import { supabase } from './supabaseClient.js';
import { showModal, hideModal } from './utils.js';


// --- SELECTORES DEL DOM ---
const folderList = document.getElementById('folder-list');
const folderTitle = document.getElementById('folder-title');
const talentosListBody = document.getElementById('talentos-list-body');
const filtroInput = document.getElementById('filtro-candidatos');
const showAddFolderBtn = document.getElementById('show-add-folder-btn');
const addFolderForm = document.getElementById('add-folder-form');
const newFolderNameInput = document.getElementById('new-folder-name');
const cancelAddFolderBtn = document.getElementById('cancel-add-folder-btn');
const addFolderBtn = document.getElementById('add-folder-btn');
const modalContainer = document.getElementById('modal-container');
const modalTitle = document.getElementById('modal-title');
const notesHistoryContainer = document.getElementById('notes-history-container');

// --- ESTADO ---
let carpetasCache = [];
let candidatosCache = [];
let currentFolderId = 'all';
let selectedCandidates = new Set();
let draggedCandidateIds = [];

// --- INICIALIZACIÓN ---
window.addEventListener('DOMContentLoaded', async () => {
    await loadFolders();
    await loadAllCandidates();

    filtroInput.addEventListener('input', renderCandidates);
    showAddFolderBtn.addEventListener('click', () => addFolderForm.classList.remove('hidden'));
    cancelAddFolderBtn.addEventListener('click', () => addFolderForm.classList.add('hidden'));
    addFolderBtn.addEventListener('click', createNewFolder);
    modalContainer.querySelectorAll('.modal-close-btn').forEach(btn => btn.addEventListener('click', () => hideModal('modal-container')));
});

// --- LÓGICA DE CARPETAS ---

async function loadFolders() {
    // RLS se asegura de que solo obtengamos las carpetas del usuario actual.
    const { data, error } = await supabase.from('app_saas_carpetas').select('*').order('nombre');
    if (error) {
        console.error("Error al cargar carpetas:", error);
        return;
    }
    carpetasCache = data;
    renderFolders();
}

function renderFolders() {
    folderList.innerHTML = `
        <li class="p-2 rounded-md cursor-pointer font-semibold ${currentFolderId === 'all' ? 'bg-indigo-100 text-indigo-700' : 'hover:bg-gray-100'}" data-folder-id="all">
            <i class="fa-solid fa-inbox mr-2"></i> Todos los Candidatos
        </li>
        <li class="p-2 rounded-md cursor-pointer font-semibold ${currentFolderId === 'none' ? 'bg-indigo-100 text-indigo-700' : 'hover:bg-gray-100'}" data-folder-id="none">
            <i class="fa-solid fa-folder-open mr-2"></i> Sin Carpeta
        </li>
    `;
    carpetasCache.forEach(folder => {
        const li = document.createElement('li');
        li.className = `p-2 rounded-md cursor-pointer ${currentFolderId == folder.id ? 'bg-indigo-100 text-indigo-700' : 'hover:bg-gray-100'}`;
        li.dataset.folderId = folder.id;
        li.innerHTML = `<i class="fa-solid fa-folder mr-2"></i> ${folder.nombre}`;
        folderList.appendChild(li);
    });

    // Añadir event listeners
    folderList.querySelectorAll('li').forEach(li => {
        li.addEventListener('click', () => {
            currentFolderId = li.dataset.folderId;
            document.querySelector('#folder-list .bg-indigo-100')?.classList.remove('bg-indigo-100', 'text-indigo-700');
            li.classList.add('bg-indigo-100', 'text-indigo-700');
            const selectedFolder = carpetasCache.find(f => f.id == currentFolderId);
            folderTitle.textContent = selectedFolder ? selectedFolder.nombre : (currentFolderId === 'none' ? 'Sin Carpeta' : 'Todos los Candidatos');
            renderCandidates();
        });
    });
}

async function createNewFolder() {
    const name = newFolderNameInput.value.trim();
    if (!name) return;

    const { error } = await supabase.from('app_saas_carpetas').insert({ nombre: name });
    if (error) {
        alert("Error al crear la carpeta.");
    } else {
        newFolderNameInput.value = '';
        addFolderForm.classList.add('hidden');
        await loadFolders();
    }
}

// --- LÓGICA DE CANDIDATOS ---

async function loadAllCandidates() {
    // RLS se asegura de que solo obtengamos los candidatos del usuario actual.
    const { data, error } = await supabase
        .from('app_saas_candidatos')
        .select(`*, carpeta:app_saas_carpetas(nombre)`)
        .order('created_at', { ascending: false });
        
    if (error) {
        console.error("Error al cargar candidatos:", error);
        talentosListBody.innerHTML = `<tr><td colspan="4" class="text-center py-10 text-red-500">Error al cargar candidatos.</td></tr>`;
        return;
    }
    candidatosCache = data;
    renderCandidates();
}

function renderCandidates() {
    let filteredCandidates = [...candidatosCache];
    const searchTerm = filtroInput.value.toLowerCase().trim();

    // 1. Filtrar por carpeta seleccionada
    if (currentFolderId !== 'all') {
        filteredCandidates = filteredCandidates.filter(c => {
            return currentFolderId === 'none' ? c.carpeta_id === null : c.carpeta_id == currentFolderId;
        });
    }

    // 2. Filtrar por término de búsqueda
    if (searchTerm) {
        filteredCandidates = filteredCandidates.filter(c => 
            (c.nombre_candidato || '').toLowerCase().includes(searchTerm) ||
            (c.email || '').toLowerCase().includes(searchTerm) ||
            (c.telefono || '').toLowerCase().includes(searchTerm)
        );
    }
    
    // 3. Renderizar la tabla
    talentosListBody.innerHTML = '';
    if (filteredCandidates.length === 0) {
        talentosListBody.innerHTML = `<tr><td colspan="4" class="text-center py-10 text-gray-500">No se encontraron candidatos.</td></tr>`;
        return;
    }

    filteredCandidates.forEach(c => {
        const row = document.createElement('tr');
        row.dataset.id = c.id;
        row.draggable = true;
        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap">
                <input type="checkbox" class="candidate-checkbox" data-id="${c.id}" ${selectedCandidates.has(c.id) ? 'checked' : ''}>
                <div class="text-sm font-semibold text-gray-900 inline-block ml-2">${c.nombre_candidato || 'N/A'}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                <div>${c.email || ''}</div>
                <div>${c.telefono || ''}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">${c.carpeta?.nombre || '<em>Sin Carpeta</em>'}</td>
            <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                <button data-action="ver-notas" data-candidate-id="${c.id}" title="Historial de Notas" class="text-gray-500 hover:text-indigo-600"><i class="fa-solid fa-note-sticky"></i></button>
                <button data-action="ver-cv" data-candidate-id="${c.id}" title="Descargar CV Original" class="text-gray-500 hover:text-indigo-600"><i class="fa-solid fa-download"></i></button>
                <button data-action="eliminar" data-candidate-id="${c.id}" title="Eliminar" class="text-red-500 hover:text-red-700"><i class="fa-solid fa-trash"></i></button>
            </td>
        `;
        // Checkbox selección
        row.querySelector('.candidate-checkbox').addEventListener('change', (e) => {
            if (e.target.checked) selectedCandidates.add(c.id);
            else selectedCandidates.delete(c.id);
            renderBulkActions();
        });
    renderBulkActions();
// --- Acciones en lote ---
function showBulkMovePrompt() {
    // Mostrar prompt simple para elegir carpeta destino
    const folderOptions = carpetasCache.map(f => `<option value="${f.id}">${f.nombre}</option>`).join('');
    const noneOption = '<option value="none">Sin Carpeta</option>';
    const selectHtml = `<select id="bulk-move-select" class="border rounded px-2 py-1">${noneOption}${folderOptions}</select>`;
    const promptDiv = document.createElement('div');
    promptDiv.innerHTML = `<div class="fixed inset-0 bg-black bg-opacity-30 z-50 flex items-center justify-center"><div class="bg-white p-6 rounded shadow"><h2 class="font-bold mb-2">Mover seleccionados a carpeta</h2>${selectHtml}<div class="mt-4 flex gap-2 justify-end"><button id="bulk-move-cancel" class="px-3 py-1 rounded bg-gray-200">Cancelar</button><button id="bulk-move-confirm" class="px-3 py-1 rounded bg-indigo-600 text-white">Mover</button></div></div></div>`;
    document.body.appendChild(promptDiv);
    document.getElementById('bulk-move-cancel').onclick = () => promptDiv.remove();
    document.getElementById('bulk-move-confirm').onclick = async () => {
        const folderId = document.getElementById('bulk-move-select').value;
        const newFolderId = folderId === 'none' ? null : folderId;
        const ids = Array.from(selectedCandidates);
        const { error } = await supabase.from('app_saas_candidatos').update({ carpeta_id: newFolderId }).in('id', ids);
        if (error) alert('Error al mover.');
        else {
            await loadAllCandidates();
            selectedCandidates.clear();
            renderBulkActions();
        }
        promptDiv.remove();
    };
}

async function handleBulkDelete() {
    if (!confirm(`¿Eliminar ${selectedCandidates.size} candidato(s)? Esta acción es irreversible.`)) return;
    const ids = Array.from(selectedCandidates);
    const { error } = await supabase.from('app_saas_candidatos').delete().in('id', ids);
    if (error) alert('Error al eliminar.');
    else {
        await loadAllCandidates();
        selectedCandidates.clear();
        renderBulkActions();
    }
}
        // Drag & drop
        row.addEventListener('dragstart', (e) => {
            draggedCandidateIds = selectedCandidates.size > 0 && selectedCandidates.has(c.id) ? Array.from(selectedCandidates) : [c.id];
            e.dataTransfer.setData('text/plain', draggedCandidateIds.join(','));
            row.classList.add('dragging');
        });
        row.addEventListener('dragend', () => {
            row.classList.remove('dragging');
        });
        talentosListBody.appendChild(row);
    });

    // Acciones de botones
    talentosListBody.querySelectorAll('button[data-action]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const action = e.currentTarget.dataset.action;
            const candidateId = e.currentTarget.dataset.candidateId;
            if (action === 'ver-notas') abrirModalNotas(candidateId);
            if (action === 'ver-cv') descargarCV(candidateId);
            if (action === 'eliminar') eliminarCandidato(candidateId);
        });
    });
}
// Drag & drop sobre carpetas
folderList.addEventListener('dragover', (e) => {
    e.preventDefault();
    const li = e.target.closest('li[data-folder-id]');
    if (li) li.classList.add('bg-indigo-200');
});
folderList.addEventListener('dragleave', (e) => {
    const li = e.target.closest('li[data-folder-id]');
    if (li) li.classList.remove('bg-indigo-200');
});
folderList.addEventListener('drop', async (e) => {
    e.preventDefault();
    const li = e.target.closest('li[data-folder-id]');
    if (!li) return;
    li.classList.remove('bg-indigo-200');
    const folderId = li.dataset.folderId;
    if (!draggedCandidateIds.length) return;
    const newFolderId = folderId === 'none' ? null : folderId;
    const { error } = await supabase.from('app_saas_candidatos').update({ carpeta_id: newFolderId }).in('id', draggedCandidateIds);
    if (error) alert('Error al mover candidatos.');
    else {
        await loadAllCandidates();
        selectedCandidates.clear();
    }
    draggedCandidateIds = [];
});

// Eliminar candidato
async function eliminarCandidato(id) {
    if (!confirm('¿Eliminar este candidato? Esta acción es irreversible.')) return;
    const { error } = await supabase.from('app_saas_candidatos').delete().eq('id', id);
    if (error) alert('Error al eliminar.');
    else await loadAllCandidates();
}

// --- ACCIONES (MODAL DE NOTAS Y DESCARGA) ---

async function abrirModalNotas(candidatoId) {
    const candidato = candidatosCache.find(c => c.id == candidatoId);
    modalTitle.textContent = `Historial de Notas de ${candidato.nombre_candidato}`;
    notesHistoryContainer.innerHTML = '<p>Cargando historial...</p>';
    showModal('modal-container');

    const { data: notas, error } = await supabase
        .from('app_saas_notas')
        .select('*, postulacion:app_saas_postulaciones(aviso:app_saas_avisos(titulo))')
        .eq('candidato_id', candidatoId)
        .order('created_at', { ascending: false });

    if (error) {
        notesHistoryContainer.innerHTML = '<p class="text-red-500">Error al cargar el historial.</p>';
        return;
    }

    if (notas.length === 0) {
        notesHistoryContainer.innerHTML = '<p class="text-gray-500">Este candidato aún no tiene notas.</p>';
    } else {
        notesHistoryContainer.innerHTML = notas.map(n => `
            <div class="bg-gray-50 p-3 rounded-md border">
                <p class="text-gray-800">${n.nota}</p>
                <p class="text-xs text-gray-500 mt-2">
                    ${new Date(n.created_at).toLocaleString()} 
                    ${n.postulacion ? `(En la búsqueda: <strong>${n.postulacion.aviso.titulo}</strong>)` : '(Nota general)'}
                </p>
            </div>
        `).join('');
    }
}

async function descargarCV(candidatoId) {
    const { data, error } = await supabase
        .from('app_saas_candidatos')
        .select('base64_general, nombre_archivo_general')
        .eq('id', candidatoId)
        .single();
    
    if (error || !data.base64_general) {
        alert("No se pudo obtener el CV de este candidato.");
        return;
    }

    const link = document.createElement('a');
    link.href = data.base64_general;
    link.download = data.nombre_archivo_general || 'cv.pdf';
    link.click();
}