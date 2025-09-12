// src/carga-masiva.js
import { supabase } from './supabaseClient.js';

// --- SELECTORES DEL DOM ---
const fileInput = document.getElementById('file-input-masivo');
const folderSelect = document.getElementById('folder-select-masivo');
const queueList = document.getElementById('upload-queue-list');
const processQueueBtn = document.getElementById('process-queue-btn');
const processBtnText = document.getElementById('process-btn-text');
const clearQueueBtn = document.getElementById('clear-queue-btn');
const linkPublicoInput = document.getElementById('link-publico');
const copiarLinkBtn = document.getElementById('copiar-link-btn');
const copyIconPublic = document.getElementById('copy-icon-public');
const qrCodeContainer = document.getElementById('qr-code-container');
const openLinkBtn = document.getElementById('open-link-btn');
const dropZone = document.getElementById('drop-zone');
const fileLabelText = document.getElementById('file-label-text');
const uploadHint = document.getElementById('upload-hint');

// --- ESTADO DE LA APLICACIÓN ---
let fileQueue = [];
let isProcessing = false;
let userProfile = null;

// --- INICIALIZACIÓN ---
window.addEventListener('DOMContentLoaded', async () => {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
    await loadUserProfile();
    await loadFoldersIntoSelect();
    if (userProfile) setupPublicLink();
    setupEventListeners();
});

function setupEventListeners() {
    fileInput.addEventListener('change', (e) => handleFileSelection(e.target.files));
    processQueueBtn.addEventListener('click', processQueue);
    clearQueueBtn.addEventListener('click', clearFinishedItems);
    copiarLinkBtn.addEventListener('click', copyPublicLink);
    openLinkBtn.addEventListener('click', openPublicLink);

    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('border-indigo-500'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('border-indigo-500'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('border-indigo-500');
        handleFileSelection(e.dataTransfer.files);
    });
}

// --- LÓGICA PRINCIPAL ---

async function loadUserProfile() {
    const { data: { session } } = await supabase.auth.getSession();
    const { data, error } = await supabase
        .from('app_saas_users')
        .select('id, subscription_plan, cv_read_count')
        .eq('id', session.user.id)
        .single();
    if (error) {
        console.error("Error cargando perfil:", error);
        alert("No se pudo cargar tu perfil de usuario.");
    } else {
        userProfile = data;
    }
}

async function loadFoldersIntoSelect() {
    const { data, error } = await supabase.from('app_saas_carpetas').select('id, nombre').order('nombre');
    if (error) return;
    folderSelect.innerHTML = '<option value="">Sin carpeta</option>';
    data.forEach(folder => {
        folderSelect.innerHTML += `<option value="${folder.id}">${folder.nombre}</option>`;
    });
}

function setupPublicLink() {
    const publicLink = `${window.location.origin}/carga-publica.html?user=${userProfile.id}`;
    linkPublicoInput.value = publicLink;

    qrCodeContainer.innerHTML = '';
    try {
        const qr = qrcode(0, 'M');
        qr.addData(publicLink);
        qr.make();
        qrCodeContainer.innerHTML = qr.createImgTag(4, 8);
    } catch (error) {
        qrCodeContainer.innerHTML = '<p class="text-xs text-red-500">Error al generar QR.</p>';
    }
}

// --- GESTIÓN DE LA COLA ---

function handleFileSelection(files) {
    const fileList = Array.from(files);
    let addedCount = 0;

    fileList.forEach(file => {
        // Lógica simplificada para aceptar solo PDF
        if (file.type === 'application/pdf' && !fileQueue.some(item => item.file.name === file.name)) {
            fileQueue.push({
                id: `file-${Date.now()}-${Math.random()}`,
                file: file,
                status: 'pendiente',
                error: null
            });
            addedCount++;
        }
    });

    if (addedCount > 0) {
        fileLabelText.textContent = `${addedCount} archivo(s) añadido(s) a la cola.`;
        uploadHint.textContent = 'Archivos listos para procesar.';
    }
    renderQueue();
}

function renderQueue() {
    if (fileQueue.length === 0) {
        queueList.innerHTML = '<li class="p-4 text-center text-sm text-gray-500">La cola de carga está vacía.</li>';
    } else {
        queueList.innerHTML = fileQueue.map(item => {
            const statusInfo = getStatusInfo(item.status);
            return `
                <li class="p-3 flex items-center space-x-3 ${statusInfo.bgColor}" data-id="${item.id}">
                    <i class="fa-solid ${statusInfo.icon} ${statusInfo.textColor} w-5 text-center"></i>
                    <div class="flex-grow min-w-0">
                        <p class="text-sm font-medium text-gray-800 truncate">${item.file.name}</p>
                        ${item.error ? `<p class="text-xs text-red-600">${item.error}</p>` : ''}
                    </div>
                    <span class="text-xs font-bold uppercase px-2 py-1 rounded-full ${statusInfo.badgeBg} ${statusInfo.badgeText}">${statusInfo.text}</span>
                </li>
            `;
        }).join('');
    }
    const hasPending = fileQueue.some(item => item.status === 'pendiente');
    processQueueBtn.disabled = !hasPending || isProcessing;
}

async function processQueue() {
    isProcessing = true;
    renderQueue();
    processBtnText.textContent = 'Subiendo archivos...';

    const itemsToProcess = fileQueue.filter(item => item.status === 'pendiente');
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session.user.id;
    const filePaths = [];

    for (const item of itemsToProcess) {
        updateQueueItemStatus(item.id, 'procesando', 'Subiendo...');
        const filePath = `${userId}/${Date.now()}-${item.file.name}`;
        
        const { error: uploadError } = await supabase.storage
            .from('cvs-masivos')
            .upload(filePath, item.file);
        
        if (uploadError) {
            updateQueueItemStatus(item.id, 'error', 'Error de subida');
            console.error(`Fallo en la subida de ${item.file.name}:`, uploadError);
        } else {
            updateQueueItemStatus(item.id, 'exito', 'Subido');
            filePaths.push(filePath);
        }
    }

    if (filePaths.length > 0) {
        processBtnText.textContent = 'Iniciando análisis...';
        const { error: functionError } = await supabase.functions.invoke('process-bulk-cvs', {
            body: { 
                file_paths: filePaths,
                user_id: userId,
                folder_id: folderSelect.value || null
            },
        });

        if (functionError) {
            alert("Error al iniciar el procesamiento en segundo plano.");
        } else {
            alert(`Se han enviado ${filePaths.length} CVs para su procesamiento en segundo plano. Los candidatos aparecerán en tu base de talentos en unos minutos.`);
            fileQueue = fileQueue.filter(item => item.status !== 'exito');
        }
    } else {
        alert("No se subieron nuevos archivos para procesar.");
    }
    
    isProcessing = false;
    processBtnText.textContent = 'Iniciar Carga';
    renderQueue();
}


function updateQueueItemStatus(id, status, errorMsg = null) {
    const item = fileQueue.find(i => i.id === id);
    if (item) {
        item.status = status;
        item.error = errorMsg;
    }
    renderQueue();
}

function clearFinishedItems() {
    fileQueue = fileQueue.filter(item => item.status === 'pendiente' || item.status === 'procesando');
    renderQueue();
}

function getStatusInfo(status) {
    switch (status) {
        case 'pendiente': return { icon: 'fa-clock', text: 'Pendiente', textColor: 'text-gray-400', badgeBg: 'bg-gray-100', badgeText: 'text-gray-600', bgColor: 'bg-white' };
        case 'procesando': return { icon: 'fa-spinner fa-spin', text: 'Procesando', textColor: 'text-indigo-500', badgeBg: 'bg-indigo-100', badgeText: 'text-indigo-700', bgColor: 'bg-white' };
        case 'exito': return { icon: 'fa-check-circle', text: 'Éxito', textColor: 'text-green-500', badgeBg: 'bg-green-100', badgeText: 'text-green-700', bgColor: 'bg-green-50' };
        case 'error': return { icon: 'fa-times-circle', text: 'Error', textColor: 'text-red-500', badgeBg: 'bg-red-100', badgeText: 'text-red-700', bgColor: 'bg-red-50' };
        default: return { icon: 'fa-question-circle', text: 'Desconocido', textColor: 'text-gray-400', badgeBg: 'bg-gray-100', badgeText: 'text-gray-600', bgColor: 'bg-white' };
    }
}

function copyPublicLink() {
    navigator.clipboard.writeText(linkPublicoInput.value).then(() => {
        copyIconPublic.className = 'fa-solid fa-check text-green-500';
        setTimeout(() => { copyIconPublic.className = 'fa-solid fa-copy'; }, 2000);
    });
}

function openPublicLink() {
    if(linkPublicoInput.value) {
        window.open(linkPublicoInput.value, '_blank');
    }
}