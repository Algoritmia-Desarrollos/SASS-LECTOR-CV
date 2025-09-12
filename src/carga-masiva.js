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
const qrCodeContainer = document.getElementById('qr-code-container'); // Nuevo
const openLinkBtn = document.getElementById('open-link-btn'); // Nuevo

// Drag & Drop
const dropZone = document.getElementById('drop-zone');
const fileLabelText = document.getElementById('file-label-text');

// --- ESTADO DE LA APLICACIÓN ---
let fileQueue = [];
let isProcessing = false;
let userProfile = null;

// --- INICIALIZACIÓN ---
window.addEventListener('DOMContentLoaded', async () => {
    await loadUserProfile();
    await loadFoldersIntoSelect();
    if(userProfile) setupPublicLink();
    setupEventListeners();
});

function setupEventListeners() {
    fileInput.addEventListener('change', (e) => handleFileSelection(e.target.files));
    processQueueBtn.addEventListener('click', processQueue);
    clearQueueBtn.addEventListener('click', clearFinishedItems);
    copiarLinkBtn.addEventListener('click', copyPublicLink);
    openLinkBtn.addEventListener('click', openPublicLink); // Nuevo

    // Eventos de Drag & Drop
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

    // Generar y mostrar el QR
    qrCodeContainer.innerHTML = '';
    try {
        const qr = qrcode(0, 'M');
        qr.addData(publicLink);
        qr.make();
        qrCodeContainer.innerHTML = qr.createImgTag(4, 8); // Tamaño 4, margen 8px
    } catch (error) {
        qrCodeContainer.innerHTML = '<p class="text-xs text-red-500">Error al generar QR.</p>';
    }
}

// --- GESTIÓN DE LA COLA ---
// (El resto del archivo, incluyendo handleFileSelection, renderQueue, processQueue y las demás funciones, permanece sin cambios)

function handleFileSelection(files) {
    const fileList = Array.from(files);
    let addedCount = 0;
    fileList.forEach(file => {
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
    processBtnText.textContent = 'Procesando...';

    const itemsToProcess = fileQueue.filter(item => item.status === 'pendiente');

    for (const item of itemsToProcess) {
        if (userProfile.subscription_plan === 'free' && userProfile.cv_read_count >= 100) {
            const errorMsg = "Límite del plan gratuito (100 CVs) alcanzado.";
            updateQueueItemStatus(item.id, 'error', errorMsg);
            alert(errorMsg + " Serás redirigido para actualizar tu plan.");
            window.location.href = '/planes.html';
            isProcessing = false;
            renderQueue();
            return; 
        }

        updateQueueItemStatus(item.id, 'procesando');
        try {
            const textoCV = await extractTextFromPdf(item.file);
            const base64 = await fileToBase64(item.file);

            const { data: iaData, error: iaError } = await supabase.functions.invoke('openaiv2', {
                body: { query: `Extrae nombre, email y teléfono del CV. Responde solo con JSON. CV: """${textoCV.substring(0, 4000)}"""` },
            });
            if (iaError) throw new Error('Error de análisis IA');
            const extractedData = JSON.parse(iaData.message);

            await procesarCandidato(extractedData, base64, textoCV, item.file.name);

            await supabase.rpc('increment_cv_read_count', { user_id_param: userProfile.id, increment_value: 1 });
            userProfile.cv_read_count++;

            updateQueueItemStatus(item.id, 'exito');

        } catch (error) {
            console.error(`Fallo en ${item.file.name}:`, error);
            updateQueueItemStatus(item.id, 'error', error.message);
        }
    }

    isProcessing = false;
    processBtnText.textContent = 'Iniciar Carga';
    renderQueue();
}

async function procesarCandidato(iaData, base64, textoCV, nombreArchivo) {
    const { data: { session } } = await supabase.auth.getSession();
    const { error } = await supabase
        .from('app_saas_candidatos')
        .upsert({
            user_id: session.user.id,
            nombre_candidato: iaData.nombreCompleto || `Candidato ${Date.now()}`,
            email: iaData.email || `sin-email-${Date.now()}@dominio.com`,
            telefono: iaData.telefono,
            base64_general: base64,
            texto_cv_general: textoCV,
            nombre_archivo_general: nombreArchivo,
            carpeta_id: folderSelect.value ? parseInt(folderSelect.value, 10) : null,
        }, { onConflict: 'user_id, email' });

    if (error) throw new Error(`Error en BD: ${error.message}`);
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

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

async function extractTextFromPdf(file) {
    const pdfjsLib = window['pdfjs-dist/build/pdf'];
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
    const fileArrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument(fileArrayBuffer).promise;
    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        text += textContent.items.map(item => item.str).join(' ');
    }
    return text.trim();
}