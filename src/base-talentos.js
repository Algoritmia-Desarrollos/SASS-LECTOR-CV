// src/base-talentos.js
import { supabase } from './lib/supabaseClient.js';
import { showModal, hideModal } from './utils.js';

// --- SELECTORES DEL DOM ---
const folderList = document.getElementById('folder-list');
const folderTitle = document.getElementById('folder-title');
const talentosListBody = document.getElementById('talentos-list-body');
const filtroInput = document.getElementById('filtro-candidatos');
const selectAllCheckbox = document.getElementById('select-all-checkbox');
const sortSelect = document.getElementById('sort-select');
const avisoFilterSelect = document.getElementById('aviso-filter-select');

// Panel Flotante de Acciones en Lote
const bulkActionsContainer = document.getElementById('bulk-actions-container');
const bulkMoveSelect = document.getElementById('bulk-move-select');
const bulkMoveBtn = document.getElementById('bulk-move-btn');
const bulkDeleteBtn = document.getElementById('bulk-delete-btn');
const bulkDeselectBtn = document.getElementById('bulk-deselect-btn'); 

const bulkStatusSelect = document.getElementById('bulk-status-select');
const bulkStatusBtn = document.getElementById('bulk-status-btn');
const selectionCount = document.getElementById('selection-count');

// Formulario de Carpetas
const showAddFolderFormBtn = document.getElementById('show-add-folder-form-btn');
const addFolderForm = document.getElementById('add-folder-form');
const addFolderBtn = document.getElementById('add-folder-btn');
const cancelAddFolderBtn = document.getElementById('cancel-add-folder-btn');
const newFolderNameInput = document.getElementById('new-folder-name');
const parentFolderSelect = document.getElementById('parent-folder-select');

// Modales
const editModal = document.getElementById('edit-modal-container');
const textModal = document.getElementById('text-modal-container');
const notesModal = document.getElementById('notes-modal-container');
const editForm = document.getElementById('edit-form');
const editCandidateIdInput = document.getElementById('edit-candidate-id');
const editNombreInput = document.getElementById('edit-nombre');
const editEmailInput = document.getElementById('edit-email');
const editTelefonoInput = document.getElementById('edit-telefono');
const textModalTitle = document.getElementById('text-modal-title');
const textModalBody = document.getElementById('text-modal-body');
const notesForm = document.getElementById('notes-form');
const notesCandidateIdInput = document.getElementById('notes-candidate-id');
const newNoteTextarea = document.getElementById('new-note-textarea');
const notesHistoryContainer = document.getElementById('notes-history-container');


// --- ESTADO GLOBAL ---
let carpetasCache = [];
let currentFolderId = 'all';
let currentSearchTerm = '';
let currentSort = { column: 'created_at', ascending: false };
let isUnreadFilterActive = false;
let currentAvisoId = 'all';
let draggedElement = null;
let isDragging = false; // Flag para evitar conflictos de drag & drop

// --- INICIALIZACIÓN ---
window.addEventListener('DOMContentLoaded', async () => {
    let searchTimeout;
    filtroInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            currentSearchTerm = filtroInput.value;
            loadCandidates();
        }, 400);
    });

    sortSelect.addEventListener('change', () => {
        const value = sortSelect.value;
        isUnreadFilterActive = value === 'unread';
        if (!isUnreadFilterActive) {
            const [column, order] = value.split('-');
            currentSort = { column, ascending: order === 'asc' };
        }
        loadCandidates();
    });

    avisoFilterSelect.addEventListener('change', () => {
        currentAvisoId = avisoFilterSelect.value;
        loadCandidates();
    });

    selectAllCheckbox.addEventListener('change', handleSelectAll);
    bulkMoveBtn.addEventListener('click', handleBulkMove);
    bulkDeleteBtn.addEventListener('click', handleBulkDelete);
    bulkStatusBtn.addEventListener('click', handleBulkStatusChange);
    bulkDeselectBtn.addEventListener('click', () => {
        selectAllCheckbox.checked = false;
        handleSelectAll();
    });

    showAddFolderFormBtn.addEventListener('click', () => toggleAddFolderForm(true));
    cancelAddFolderBtn.addEventListener('click', () => toggleAddFolderForm(false));
    addFolderBtn.addEventListener('click', createNewFolder);

    editForm.addEventListener('submit', handleEditFormSubmit);
    notesForm.addEventListener('submit', handleNotesFormSubmit);

    editModal.querySelector('#edit-modal-close')?.addEventListener('click', () => hideModal('edit-modal-container'));
    textModal.querySelector('#text-modal-close')?.addEventListener('click', () => hideModal('text-modal-container'));
    notesModal.querySelector('#notes-modal-close')?.addEventListener('click', () => hideModal('notes-modal-container'));

    await Promise.all([loadFolders(), loadAvisos()]);
    const allCandidatesFolder = folderList.querySelector("[data-folder-id='all']");
    if (allCandidatesFolder) {
        handleFolderClick('all', 'Todos los Candidatos', allCandidatesFolder);
    }
    
    // INICIA LA SUSCRIPCIÓN EN VIVO
    suscribirseACambiosEnTalentos();
});


// --- LÓGICA DE CARPETAS ---
async function loadFolders() {
    const { data: folders, error: foldersError } = await supabase.from('app_saas_carpetas').select('*').order('nombre');
    if (foldersError) { console.error("Error al cargar carpetas:", foldersError); return; }

    const { data: allCandidates, error: candidatesError } = await supabase.from('app_saas_candidatos').select('carpeta_id');
    if(candidatesError) { console.error("Error al contar candidatos:", candidatesError); return; }
    
    const countsMap = allCandidates.reduce((acc, candidato) => {
        const folderId = candidato.carpeta_id === null ? 'none' : candidato.carpeta_id;
        acc[folderId] = (acc[folderId] || 0) + 1;
        return acc;
    }, {});
    countsMap['all'] = allCandidates.length;

    carpetasCache = folders;
    renderFoldersUI(countsMap);
    populateFolderSelects();
}

function renderFoldersUI(counts = {}) {
    folderList.innerHTML = ''; 

    const staticItems = [
        { id: 'all', name: 'Todos los Candidatos', icon: 'fa-inbox' },
        { id: 'none', name: 'Sin Carpeta', icon: 'fa-folder-open' }
    ];

    staticItems.forEach(item => {
        const count = counts[item.id] || 0;
        const li = document.createElement('li');
        const folderItem = createFolderElement(item.id, item.name, item.icon, count);
        li.appendChild(folderItem);
        folderList.appendChild(li);
    });
    
    const foldersById = new Map(carpetasCache.map(f => [f.id, { ...f, children: [] }]));
    const rootFolders = [];

    carpetasCache.forEach(f => {
        if (f.parent_id && foldersById.has(f.parent_id)) {
            foldersById.get(f.parent_id).children.push(foldersById.get(f.id));
        } else {
            rootFolders.push(foldersById.get(f.id));
        }
    });

    const createFolderTree = (folders, container) => {
        folders.forEach(folder => {
            const count = counts[folder.id] || 0;
            const hasChildren = folder.children.length > 0;
            const li = document.createElement('li');
            const folderItem = createFolderElement(folder.id, folder.nombre, 'fa-folder', count, hasChildren, false);
            li.appendChild(folderItem);

            if (hasChildren) {
                const subTree = document.createElement('ul');
                subTree.className = 'folder-subtree ml-4';
                createFolderTree(folder.children, subTree);
                li.appendChild(subTree);
            }
            container.appendChild(li);
        });
    };
    
    createFolderTree(rootFolders, folderList);
    addDragAndDropListeners();
}

function createFolderElement(id, name, icon, count, hasChildren = false) {
    const folderItem = document.createElement('div');
    folderItem.className = 'folder-item flex items-center justify-between p-2 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors';
    folderItem.dataset.folderId = id;
    
    const toggleIcon = hasChildren ? `<span class="folder-toggle w-4 text-center text-slate-400"><i class="fa-solid fa-chevron-right fa-xs transition-transform"></i></span>` : `<span class="w-4"></span>`;

    folderItem.innerHTML = `
        <div class="flex items-center gap-2 overflow-hidden">
            ${toggleIcon}
            <i class="fa-solid ${icon} text-slate-500 w-4 text-center"></i>
            <span class="text-slate-700 font-medium truncate">${name}</span>
        </div>
        <span class="text-xs font-medium bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">${count}</span>
    `;

    folderItem.addEventListener('click', (e) => {
        if (e.target.closest('.folder-toggle')) {
            e.currentTarget.parentElement.classList.toggle('open');
        } else {
            handleFolderClick(id, name, e.currentTarget);
        }
    });
    return folderItem;
}

function addDragAndDropListeners() {
    folderList.querySelectorAll('.folder-item').forEach(item => {
        item.setAttribute('draggable', 'true');
        item.addEventListener('dragstart', handleDragStart);
        item.addEventListener('dragover', handleDragOver);
        item.addEventListener('dragleave', handleDragLeave);
        item.addEventListener('drop', handleDrop);
        item.addEventListener('dragend', handleDragEnd);
    });
}

function handleDragStart(e) {
    if (isDragging) {
        e.preventDefault();
        return;
    }
    isDragging = true;
    if (e.target.closest('.folder-item')) {
        draggedElement = { type: 'folder', id: e.target.closest('.folder-item').dataset.folderId };
        e.dataTransfer.setData('text/plain', `folder:${draggedElement.id}`);
    } else if (e.target.closest('tr[data-id]')) {
        const candidateId = e.target.closest('tr[data-id]').dataset.id;
        const selectedIds = getSelectedIds();
        const idsToDrag = selectedIds.includes(candidateId) ? selectedIds : [candidateId];
        draggedElement = { type: 'candidate', ids: idsToDrag };
        e.dataTransfer.setData('text/plain', `candidate:${idsToDrag.join(',')}`);
    }
    e.dataTransfer.effectAllowed = 'move';
    e.target.classList.add('dragging');
}


function handleDragOver(e) { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }
function handleDragLeave(e) { e.currentTarget.classList.remove('drag-over'); }
function handleDragEnd(e) {
    e.currentTarget.classList.remove('dragging');
    isDragging = false;
}

async function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    const targetItem = e.currentTarget.closest('.folder-item');
    targetItem.classList.remove('drag-over');
    isDragging = false;

    const targetFolderId = targetItem.dataset.folderId;
    const data = e.dataTransfer.getData('text/plain');
    if (!data) return;

    const [type, ids] = data.split(':');
    
    if (type === 'candidate') {
        const candidateIds = ids.split(',');
        const newFolderId = targetFolderId === 'none' ? null : (targetFolderId === 'all' ? draggedElement.folderId : parseInt(targetFolderId));
        if (candidateIds.length > 0) {
            const { error } = await supabase.from('app_saas_candidatos').update({ carpeta_id: newFolderId }).in('id', candidateIds);
            if (error) { alert(`Error al mover.`); }
        }
    } else if (type === 'folder') {
        const draggedFolderId = ids;
        const newParentId = targetFolderId === 'none' || targetFolderId === 'all' ? null : parseInt(targetFolderId);
        if (draggedFolderId !== targetFolderId) {
            const { error } = await supabase.from('app_saas_carpetas').update({ parent_id: newParentId }).eq('id', draggedFolderId);
            if (error) { alert('Error al mover la carpeta.'); }
        }
    }
}


function handleFolderClick(id, name, element) {
    currentFolderId = id;
    filtroInput.value = '';
    currentSearchTerm = '';
    folderTitle.textContent = name;
    folderList.querySelectorAll('.bg-slate-200').forEach(el => el.classList.remove('bg-slate-200'));
    element.classList.add('bg-slate-200');
    loadCandidates();
}

// --- LÓGICA DE CANDIDATOS ---
async function loadCandidates() {
    talentosListBody.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-sm text-slate-500"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Cargando candidatos...</td></tr>`;
    
    let query = supabase.from('app_saas_candidatos').select(
        `id, nombre_candidato, email, telefono, estado, nombre_archivo_general, created_at, 
         carpeta:app_saas_carpetas(nombre), 
         notas:app_saas_notas(count)`, 
        { count: 'exact' }
    );

    if (currentFolderId === 'none') query = query.is('carpeta_id', null);
    else if (currentFolderId !== 'all') query = query.eq('carpeta_id', currentFolderId);
    if (currentSearchTerm) query = query.or(`nombre_candidato.ilike.%${currentSearchTerm}%,email.ilike.%${currentSearchTerm}%,telefono.ilike.%${currentSearchTerm}%`);
    if (isUnreadFilterActive) query = query.like('nombre_candidato', 'Candidato No Identificado%');
    
    query = query.order(currentSort.column, { ascending: currentSort.ascending });

    const { data, error, count } = await query;

    if (error) {
        talentosListBody.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-sm text-red-500">Error al cargar datos.</td></tr>`;
        return;
    }
    renderTable(data);
    updateBulkActionsVisibility();
}

// --- RENDERIZADO Y UI ---
function renderTable(candidatos) {
    talentosListBody.innerHTML = '';
    if (!candidatos || candidatos.length === 0) {
        talentosListBody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-sm text-slate-500">No se encontraron candidatos.</td></tr>';
        return;
    }
    candidatos.forEach(c => {
        const row = document.createElement('tr');
        row.dataset.id = c.id; row.dataset.estado = c.estado || '';
        row.className = 'group hover:bg-slate-50 cursor-pointer'; row.draggable = true;
        
        row.innerHTML = `
            <td class="pl-6 pr-3 py-2.5"><input type="checkbox" class="candidate-checkbox h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" data-id="${c.id}"></td>
            <td class="px-3 py-2.5">
                <div class="flex items-center space-x-2">
                    <div class="tooltip-container">
                        <span class="candidate-name text-sm font-medium ${getEstadoClass(c.estado)} truncate block max-w-xs">${c.nombre_candidato || 'No extraído'}</span>
                        <span class="tooltip-text">${c.nombre_candidato || 'No extraído'}</span>
                    </div>
                    ${c.notas && c.notas.length > 0 && c.notas[0].count > 0 ? '<i class="fa-solid fa-note-sticky text-slate-400 text-xs" title="Tiene notas"></i>' : ''}
                </div>
                <div class="tooltip-container"><div class="text-xs text-slate-500 truncate max-w-xs">${c.nombre_archivo_general || 'N/A'}</div><span class="tooltip-text">${c.nombre_archivo_general || 'N/A'}</span></div>
            </td>
            <td class="px-3 py-2.5 text-sm text-slate-600">${c.carpeta?.nombre || '<em class="text-slate-400">Sin Carpeta</em>'}</td>
            <td class="px-3 py-2.5 text-sm">
                <div class="tooltip-container"><div class="text-slate-700 truncate max-w-[180px]">${c.email || ''}</div><span class="tooltip-text">${c.email || ''}</span></div>
                <div class="text-slate-500 text-xs">${c.telefono || ''}</div>
            </td>
            <td class="px-6 py-2.5 text-center"><button class="btn-icon p-1.5 rounded-full hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-colors" data-action="toggle-actions"><i class="fa-solid fa-ellipsis-vertical"></i></button></td>
        `;
        addTableRowListeners(row);
        talentosListBody.appendChild(row);
    });
}

function getEstadoClass(estado) {
    return { 'bueno': 'status-bueno', 'prohibido': 'status-prohibido', 'normal': 'status-normal' }[estado] || 'text-slate-800';
}

function addTableRowListeners(row) {
    row.addEventListener('dragstart', handleDragStart);
    row.addEventListener('dragend', handleDragEnd);
    row.addEventListener('click', e => {
        if (e.target.closest('button, a, input')) return;
        const cb = row.querySelector('.candidate-checkbox');
        if (cb) { cb.checked = !cb.checked; updateBulkActionsVisibility(); }
    });
    row.querySelector('.candidate-checkbox')?.addEventListener('change', updateBulkActionsVisibility);
    row.querySelector('[data-action="toggle-actions"]')?.addEventListener('click', e => {
        e.stopPropagation();
        toggleActionRow(row);
    });
}

function toggleActionRow(row) {
    const candidateId = row.dataset.id;
    const existingActionRow = document.getElementById(`actions-${candidateId}`);
    
    document.querySelectorAll('.actions-row').forEach(r => {
        if (r.id !== `actions-${candidateId}`) r.remove();
    });

    if (existingActionRow) {
        existingActionRow.remove();
    } else {
        const candidateStatus = row.dataset.estado;
        const actionRow = document.createElement('tr');
        actionRow.id = `actions-${candidateId}`;
        actionRow.className = 'actions-row bg-slate-50';
        actionRow.innerHTML = `
            <td colspan="5" class="py-2 pl-12 pr-6">
                <div class="flex items-center flex-wrap gap-3">
                    <button class="bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium py-1.5 px-3 rounded-md text-xs flex items-center transition-colors" data-action="view-text"><i class="fa-solid fa-file-lines mr-1.5"></i> Ver Texto</button>
                    <button class="bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium py-1.5 px-3 rounded-md text-xs flex items-center transition-colors" data-action="view-cv"><i class="fa-solid fa-download mr-1.5"></i> Descargar CV</button>
                    <button class="bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium py-1.5 px-3 rounded-md text-xs flex items-center transition-colors" data-action="edit"><i class="fa-solid fa-pencil mr-1.5"></i> Editar</button>
                    <button class="bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium py-1.5 px-3 rounded-md text-xs flex items-center transition-colors" data-action="notes"><i class="fa-solid fa-note-sticky mr-1.5"></i> Notas</button>
                    <div class="status-buttons flex items-center border border-slate-200 rounded-md overflow-hidden text-xs ml-auto">
                        <button class="py-1.5 px-3 text-slate-600 hover:bg-slate-200 transition-colors ${candidateStatus === 'bueno' ? 'active' : ''}" data-action="set-status" data-status="bueno">Bueno</button>
                        <button class="py-1.5 px-3 text-slate-600 hover:bg-slate-200 transition-colors border-l border-slate-200 ${candidateStatus === 'normal' ? 'active' : ''}" data-action="set-status" data-status="normal">Normal</button>
                        <button class="py-1.5 px-3 text-slate-600 hover:bg-slate-200 transition-colors border-l border-slate-200 ${candidateStatus === 'prohibido' ? 'active' : ''}" data-action="set-status" data-status="prohibido">Prohibido</button>
                        <button class="py-1.5 px-3 text-slate-600 hover:bg-slate-200 transition-colors border-l border-slate-200 ${!candidateStatus ? 'active' : ''}" data-action="set-status" data-status="">Limpiar</button>
                    </div>
                </div>
            </td>
        `;
        row.insertAdjacentElement('afterend', actionRow);
        
        actionRow.querySelector('[data-action="view-text"]').addEventListener('click', (e) => { e.stopPropagation(); openTextModal(candidateId); });
        actionRow.querySelector('[data-action="view-cv"]').addEventListener('click', (e) => { e.stopPropagation(); descargarCV(candidateId, e.currentTarget); });
        actionRow.querySelector('[data-action="edit"]').addEventListener('click', (e) => { e.stopPropagation(); openEditModal(candidateId); });
        actionRow.querySelector('[data-action="notes"]').addEventListener('click', (e) => { e.stopPropagation(); openNotesModal(candidateId); });
        actionRow.querySelectorAll('[data-action="set-status"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                updateCandidateStatus(candidateId, e.currentTarget.dataset.status);
                toggleActionRow(row); 
            });
        });
    }
}


// --- ACCIONES EN LOTE ---
function getSelectedIds() {
    return Array.from(talentosListBody.querySelectorAll('.candidate-checkbox:checked')).map(cb => cb.dataset.id);
}

function updateBulkActionsVisibility() {
    const count = getSelectedIds().length;
    if (count > 0) {
        selectionCount.textContent = `${count} seleccionado${count > 1 ? 's' : ''}`;
        bulkActionsContainer.classList.remove('translate-y-full');
    } else {
        bulkActionsContainer.classList.add('translate-y-full');
    }
}

function handleSelectAll() {
    talentosListBody.querySelectorAll('.candidate-checkbox').forEach(cb => cb.checked = selectAllCheckbox.checked);
    updateBulkActionsVisibility();
}

async function handleBulkMove() {
    const ids = getSelectedIds();
    const folderId = bulkMoveSelect.value === 'none' ? null : parseInt(bulkMoveSelect.value);
    if (ids.length === 0 || bulkMoveSelect.value === "") return;
    const { error } = await supabase.from('app_saas_candidatos').update({ carpeta_id: folderId }).in('id', ids);
    if (error) { alert("Error al mover."); } else { selectAllCheckbox.checked = false; handleSelectAll(); }
}

async function handleBulkDelete() {
    const ids = getSelectedIds();
    if (ids.length === 0) return;
    if (confirm(`¿Eliminar ${ids.length} candidato(s)?`)) {
        const { error } = await supabase.from('app_saas_candidatos').delete().in('id', ids);
        if (error) { alert("Error al eliminar."); } else { selectAllCheckbox.checked = false; handleSelectAll(); }
    }
}

async function handleBulkStatusChange() {
    const ids = getSelectedIds();
    let status = bulkStatusSelect.value;
    if (ids.length === 0 || !status) return;
    if (status === 'limpiar') status = null;
    const { error } = await supabase.from('app_saas_candidatos').update({ estado: status }).in('id', ids);
    if (error) { alert("Error al cambiar estado."); } else { selectAllCheckbox.checked = false; handleSelectAll(); }
}

async function updateCandidateStatus(id, estado) {
    const finalEstado = estado === '' ? null : estado;
    const { error } = await supabase.from('app_saas_candidatos').update({ estado: finalEstado }).eq('id', id);
    if (error) { alert('Error al actualizar.'); } else {
        const row = talentosListBody.querySelector(`tr[data-id='${id}']`);
        if (row) {
            row.dataset.estado = estado;
            row.querySelector('.candidate-name').className = `candidate-name text-sm font-medium ${getEstadoClass(estado)} truncate block max-w-xs`;
        }
    }
}

// --- UTILIDADES Y MODALES ---
function populateFolderSelects() {
    const optionsHTML = carpetasCache.map(f => `<option value="${f.id}">${f.nombre}</option>`).join('');
    parentFolderSelect.innerHTML = '<option value="">Raíz</option>' + optionsHTML;
    bulkMoveSelect.innerHTML = '<option value="" disabled selected>Mover a...</option><option value="none">Sin Carpeta</option>' + optionsHTML;
}

async function loadAvisos() {
    const { data, error } = await supabase.from('app_saas_avisos').select('id, titulo').order('created_at', { ascending: false });
    if (error) { console.error("Error al cargar avisos:", error); return; }
    avisoFilterSelect.innerHTML = '<option value="all">Filtrar por aviso</option>';
    data.forEach(aviso => avisoFilterSelect.innerHTML += `<option value="${aviso.id}">${aviso.titulo}</option>`);
}

function toggleAddFolderForm(show) {
    addFolderForm.classList.toggle('hidden', !show);
    showAddFolderFormBtn.classList.toggle('hidden', show);
}

async function createNewFolder() {
    const name = newFolderNameInput.value.trim();
    if (!name) return;
    const parentId = parentFolderSelect.value ? parseInt(parentFolderSelect.value) : null;
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('app_saas_carpetas').insert({ nombre: name, parent_id: parentId, user_id: user.id });
    if (error) {
        alert("Error al crear la carpeta.");
    } else {
        toggleAddFolderForm(false);
        newFolderNameInput.value = '';
    }
}

async function descargarCV(id, button) {
    const originalContent = button.innerHTML;
    button.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1.5"></i>`;
    button.disabled = true;
    const { data, error } = await supabase.from('app_saas_candidatos').select('base64_general, nombre_archivo_general').eq('id', id).single();
    if (error || !data.base64_general) {
        alert("No se pudo obtener el CV.");
    } else {
        const link = document.createElement('a');
        link.href = data.base64_general;
        link.download = data.nombre_archivo_general || 'cv.pdf';
        link.click();
    }
    button.innerHTML = originalContent;
    button.disabled = false;
}

async function openTextModal(id) {
    textModalBody.innerHTML = '<p>Cargando texto...</p>';
    showModal('text-modal-container');
    const { data, error } = await supabase.from('app_saas_candidatos').select('nombre_candidato, texto_cv_general').eq('id', id).single();
    if (error) {
        textModalBody.textContent = 'Error al cargar el texto.';
    } else {
        textModalTitle.textContent = `Texto de: ${data.nombre_candidato}`;
        textModalBody.textContent = data.texto_cv_general || 'No hay texto extraído para este CV.';
    }
}

async function openEditModal(id) {
    showModal('edit-modal-container');
    const { data, error } = await supabase.from('app_saas_candidatos').select('nombre_candidato, email, telefono').eq('id', id).single();
    if (error) {
        alert('No se pudo cargar la información del candidato.');
        hideModal('edit-modal-container');
    } else {
        editCandidateIdInput.value = id;
        editNombreInput.value = data.nombre_candidato || '';
        editEmailInput.value = data.email || '';
        editTelefonoInput.value = data.telefono || '';
    }
}

async function handleEditFormSubmit(e) {
    e.preventDefault();
    const id = editCandidateIdInput.value;
    const updatedData = {
        nombre_candidato: editNombreInput.value.trim(),
        email: editEmailInput.value.trim(),
        telefono: editTelefonoInput.value.trim(),
    };
    const { error } = await supabase.from('app_saas_candidatos').update(updatedData).eq('id', id);
    if (error) { 
        alert("Error al actualizar.");
    } else { 
        hideModal('edit-modal-container');
    }
}

async function openNotesModal(id) {
    notesCandidateIdInput.value = id;
    newNoteTextarea.value = '';
    notesHistoryContainer.innerHTML = '<p>Cargando historial...</p>';
    showModal('notes-modal-container');
    const { data, error } = await supabase.from('app_saas_notas').select('nota, created_at').eq('candidato_id', id).order('created_at', { ascending: false });
    if (error) {
        notesHistoryContainer.innerHTML = '<p class="text-red-500">Error al cargar el historial.</p>';
    } else if (data.length === 0) {
        notesHistoryContainer.innerHTML = '<p class="text-slate-500">No hay notas para este candidato.</p>';
    } else {
        notesHistoryContainer.innerHTML = data.map(n => `
            <div class="border-b border-slate-100 pb-3">
                <p class="text-slate-800">${n.nota}</p>
                <p class="text-xs text-slate-400 mt-2">${new Date(n.created_at).toLocaleString()}</p>
            </div>
        `).join('');
    }
}

async function handleNotesFormSubmit(e) {
    e.preventDefault();
    const id = notesCandidateIdInput.value;
    const newNote = newNoteTextarea.value.trim();
    if (!newNote) return;
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('app_saas_notas').insert({ candidato_id: id, nota: newNote, user_id: user.id });
    if (error) {
        alert("Error al guardar la nota.");
    } else {
        openNotesModal(id);
    }
}

// --- LÓGICA DE ACTUALIZACIONES EN VIVO ---
function suscribirseACambiosEnTalentos() {
    const channel = supabase.channel('public:app_saas_candidatos')
        .on('postgres_changes', 
            { event: '*', schema: 'public', table: 'app_saas_candidatos' }, 
            (payload) => {
                console.log('Cambio detectado en la base de talentos:', payload);
                // Cuando algo cambia, recargamos las carpetas (para los contadores)
                // y la lista de candidatos (para la tabla).
                loadFolders();
                loadCandidates();
            }
        )
        .subscribe();
    
    return channel;
}