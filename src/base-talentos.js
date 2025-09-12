// src/base-talentos.js
import { supabase } from './supabaseClient.js';
import { showModal, hideModal } from './utils.js';

// --- SELECTORES DEL DOM ---
const folderList = document.getElementById('folder-list');
const folderTitle = document.getElementById('folder-title');
const talentosListBody = document.getElementById('talentos-list-body');
const filtroInput = document.getElementById('filtro-candidatos');

// Formulario de Carpetas
const showAddFolderBtn = document.getElementById('show-add-folder-btn');
const addFolderForm = document.getElementById('add-folder-form');
const newFolderNameInput = document.getElementById('new-folder-name');
const cancelAddFolderBtn = document.getElementById('cancel-add-folder-btn');
const addFolderBtn = document.getElementById('add-folder-btn');

// Modal de Notas
const modalContainer = document.getElementById('modal-container');
const modalTitle = document.getElementById('modal-title');
const notesHistoryContainer = document.getElementById('notes-history-container');

// --- ESTADO ---
let carpetasCache = [];
let candidatosCache = [];
let currentFolderId = 'all';

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
        row.innerHTML = `
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
            </td>
        `;
        talentosListBody.appendChild(row);
    });

    // Añadir event listeners a los nuevos botones
    talentosListBody.querySelectorAll('button[data-action]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const action = e.currentTarget.dataset.action;
            const candidateId = e.currentTarget.dataset.candidateId;
            if (action === 'ver-notas') abrirModalNotas(candidateId);
            if (action === 'ver-cv') descargarCV(candidateId);
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