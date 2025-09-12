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

// Modales
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
    cancelAddFolderBtn.addEventListener('click', () => {
        addFolderForm.classList.add('hidden');
        newFolderNameInput.value = '';
    });
    addFolderBtn.addEventListener('click', createNewFolder);
    modalContainer.querySelectorAll('.modal-close-btn').forEach(btn => btn.addEventListener('click', () => hideModal('modal-container')));
});


// --- LÓGICA DE CARPETAS ---

async function loadFolders() {
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
        li.className = `p-2 rounded-md cursor-pointer flex justify-between items-center ${currentFolderId == folder.id ? 'bg-indigo-100 text-indigo-700' : 'hover:bg-gray-100'}`;
        li.dataset.folderId = folder.id;
        li.innerHTML = `
            <div><i class="fa-solid fa-folder mr-2"></i> ${folder.nombre}</div>
        `;
        folderList.appendChild(li);
    });

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

    addDragAndDropToFolders();
}

async function createNewFolder() {
    const name = newFolderNameInput.value.trim();
    if (!name) return;

    addFolderBtn.disabled = true;
    addFolderBtn.textContent = 'Guardando...';

    // Obtenemos el ID del usuario actual para asociar la carpeta
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        alert("Error de autenticación. No se puede crear la carpeta.");
        addFolderBtn.disabled = false;
        addFolderBtn.textContent = 'Guardar';
        return;
    }

    const { error } = await supabase.from('app_saas_carpetas').insert({ nombre: name, user_id: user.id });
    
    addFolderBtn.disabled = false;
    addFolderBtn.textContent = 'Guardar';

    if (error) {
        alert("Error al crear la carpeta.");
        console.error("Error de Supabase:", error);
    } else {
        newFolderNameInput.value = '';
        addFolderForm.classList.add('hidden');
        await loadFolders();
    }
}


// --- LÓGICA DE CANDIDATOS ---

async function loadAllCandidates() {
    const { data, error } = await supabase
        .from('app_saas_candidatos')
        .select(`*, carpeta:app_saas_carpetas(nombre)`)
        .order('created_at', { ascending: false });
        
    if (error) {
        console.error("Error al cargar candidatos:", error);
        talentosListBody.innerHTML = `<tr><td colspan="5" class="text-center py-10 text-red-500">Error al cargar candidatos.</td></tr>`;
        return;
    }
    candidatosCache = data;
    renderCandidates();
}

function renderCandidates() {
    let filteredCandidates = [...candidatosCache];
    const searchTerm = filtroInput.value.toLowerCase().trim();

    if (currentFolderId !== 'all') {
        filteredCandidates = filteredCandidates.filter(c => {
            return currentFolderId === 'none' ? c.carpeta_id === null : c.carpeta_id == currentFolderId;
        });
    }

    if (searchTerm) {
        filteredCandidates = filteredCandidates.filter(c => 
            (c.nombre_candidato || '').toLowerCase().includes(searchTerm) ||
            (c.email || '').toLowerCase().includes(searchTerm) ||
            (c.telefono || '').toLowerCase().includes(searchTerm)
        );
    }
    
    talentosListBody.innerHTML = '';
    if (filteredCandidates.length === 0) {
        talentosListBody.innerHTML = `<tr><td colspan="5" class="text-center py-10 text-gray-500">No se encontraron candidatos.</td></tr>`;
        return;
    }

    filteredCandidates.forEach(c => {
        const row = document.createElement('tr');
        row.dataset.id = c.id;
        row.draggable = true;
        row.className = 'hover:bg-gray-50 cursor-pointer';
        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap w-10">
                <input type="checkbox" class="candidate-checkbox h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 pointer-events-none" data-id="${c.id}" ${selectedCandidates.has(c.id) ? 'checked' : ''}>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm font-semibold text-gray-900">${c.nombre_candidato || 'N/A'}</div>
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
        
        // --- NUEVO: Evento de clic en toda la fila ---
        row.addEventListener('click', (e) => {
            // Evitar que el clic en un botón o link seleccione la fila
            if (e.target.closest('button, a')) {
                return;
            }
            const checkbox = row.querySelector('.candidate-checkbox');
            checkbox.checked = !checkbox.checked;
            
            if (checkbox.checked) {
                selectedCandidates.add(c.id);
            } else {
                selectedCandidates.delete(c.id);
            }
            renderBulkActions();
        });

        row.addEventListener('dragstart', (e) => {
            draggedCandidateIds = selectedCandidates.has(c.id) ? Array.from(selectedCandidates) : [c.id];
            e.dataTransfer.setData('text/plain', draggedCandidateIds.join(','));
            row.classList.add('opacity-50');
        });
        row.addEventListener('dragend', () => row.classList.remove('opacity-50'));

        talentosListBody.appendChild(row);
    });

    talentosListBody.querySelectorAll('button[data-action]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); // Evita que el clic en el botón seleccione la fila
            const action = e.currentTarget.dataset.action;
            const candidateId = e.currentTarget.dataset.candidateId;
            if (action === 'ver-notas') abrirModalNotas(candidateId);
            if (action === 'ver-cv') descargarCV(candidateId);
            if (action === 'eliminar') eliminarCandidato(candidateId);
        });
    });

    renderBulkActions();
}

async function eliminarCandidato(id) {
    if (!confirm('¿Eliminar este candidato? Esta acción es irreversible.')) return;
    const { error } = await supabase.from('app_saas_candidatos').delete().eq('id', id);
    if (error) {
        alert('Error al eliminar.');
    } else {
        selectedCandidates.delete(id);
        await loadAllCandidates();
    }
}

// --- ACCIONES EN LOTE (MODAL INFERIOR) ---
function renderBulkActions() {
    let oldModal = document.getElementById('bulk-actions-modal');
    if (oldModal) oldModal.remove();

    if (selectedCandidates.size === 0) return;

    let modal = document.createElement('div');
    modal.id = 'bulk-actions-modal';
    modal.className = 'fixed bottom-4 left-1/2 -translate-x-1/2 w-full max-w-lg z-40';
    modal.innerHTML = `
        <div class="bg-white shadow-2xl rounded-lg mx-4 flex items-center justify-between p-4 border">
            <span class="font-semibold text-gray-800">${selectedCandidates.size} seleccionado${selectedCandidates.size > 1 ? 's' : ''}</span>
            <div class="flex gap-2">
                <button id="bulk-move-btn" class="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md font-semibold text-sm">Mover a...</button>
                <button id="bulk-delete-btn" class="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md font-semibold text-sm">Eliminar</button>
                <button id="bulk-cancel-btn" class="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-md font-semibold text-sm">Cancelar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('bulk-move-btn').onclick = showBulkMovePrompt;
    document.getElementById('bulk-delete-btn').onclick = handleBulkDelete;
    document.getElementById('bulk-cancel-btn').onclick = () => {
        selectedCandidates.clear();
        renderCandidates();
    };
}

function showBulkMovePrompt() {
    const folderOptions = carpetasCache.map(f => `<option value="${f.id}">${f.nombre}</option>`).join('');
    const selectHtml = `
        <select id="bulk-move-select" class="block w-full mt-2 rounded-md border-gray-300 shadow-sm">
            <option value="none">Sin Carpeta</option>
            ${folderOptions}
        </select>`;
    
    const promptDiv = document.createElement('div');
    promptDiv.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center';
    promptDiv.innerHTML = `
        <div class="bg-white p-6 rounded-lg shadow-xl max-w-sm w-full">
            <h2 class="font-bold text-lg mb-2">Mover seleccionados a carpeta</h2>
            ${selectHtml}
            <div class="mt-4 flex gap-2 justify-end">
                <button id="bulk-move-cancel" class="px-4 py-2 rounded bg-gray-200">Cancelar</button>
                <button id="bulk-move-confirm" class="px-4 py-2 rounded bg-indigo-600 text-white">Mover</button>
            </div>
        </div>
    `;
    document.body.appendChild(promptDiv);

    document.getElementById('bulk-move-cancel').onclick = () => promptDiv.remove();
    document.getElementById('bulk-move-confirm').onclick = async () => {
        const select = document.getElementById('bulk-move-select');
        const folderId = select.value === 'none' ? null : select.value;
        const ids = Array.from(selectedCandidates);

        const { error } = await supabase.from('app_saas_candidatos').update({ carpeta_id: folderId }).in('id', ids);
        if (error) {
            alert('Error al mover los candidatos.');
        } else {
            selectedCandidates.clear();
            await loadAllCandidates();
        }
        promptDiv.remove();
    };
}

async function handleBulkDelete() {
    if (!confirm(`¿Estás seguro de que quieres eliminar ${selectedCandidates.size} candidato(s)? Esta acción es irreversible.`)) return;
    
    const ids = Array.from(selectedCandidates);
    const { error } = await supabase.from('app_saas_candidatos').delete().in('id', ids);

    if (error) {
        alert('Error al eliminar los candidatos.');
    } else {
        selectedCandidates.clear();
        await loadAllCandidates();
    }
}

// --- DRAG & DROP ---
function addDragAndDropToFolders() {
    folderList.querySelectorAll('li[data-folder-id]').forEach(li => {
        li.addEventListener('dragover', (e) => {
            e.preventDefault();
            li.classList.add('bg-indigo-200');
        });
        li.addEventListener('dragleave', () => {
            li.classList.remove('bg-indigo-200');
        });
        li.addEventListener('drop', async (e) => {
            e.preventDefault();
            li.classList.remove('bg-indigo-200');
            const folderId = li.dataset.folderId;
            const newFolderId = folderId === 'none' ? null : (folderId === 'all' ? currentFolderId : folderId);

            if (draggedCandidateIds.length > 0 && newFolderId !== 'all') {
                const { error } = await supabase
                    .from('app_saas_candidatos')
                    .update({ carpeta_id: newFolderId })
                    .in('id', draggedCandidateIds);

                if (error) {
                    alert('Error al mover candidatos.');
                } else {
                    selectedCandidates.clear();
                    await loadAllCandidates();
                }
            }
            draggedCandidateIds = [];
        });
    });
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
            <div class="bg-gray-50 p-3 rounded-md border mb-2">
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
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}