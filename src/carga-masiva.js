// src/carga-masiva.js
import { supabase } from './supabaseClient.js';

// --- SELECTORES DEL DOM ---
const fileInput = document.getElementById('file-input-masivo');
const folderSelect = document.getElementById('folder-select-masivo');
const queueList = document.getElementById('upload-queue-list');
const processQueueBtn = document.getElementById('process-queue-btn');
const processBtnText = document.getElementById('process-btn-text');
const clearQueueBtn = document.getElementById('clear-queue-btn');
const dropZone = document.getElementById('drop-zone');
const fileLabelText = document.getElementById('file-label-text');
const uploadHint = document.getElementById('upload-hint');

// --- ESTADO ---
let fileQueue = [];
let isProcessing = false;

// --- INICIALIZACIÓN ---
window.addEventListener('DOMContentLoaded', async () => {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
    
    await loadFoldersIntoSelect();
    await loadQueueFromDB();
    setupEventListeners();
    suscribirseACambiosEnCola();
});

function setupEventListeners() {
    fileInput.addEventListener('change', (e) => handleFileSelection(e.target.files));
    processQueueBtn.addEventListener('click', processAndEnqueueFiles);
    clearQueueBtn.addEventListener('click', clearFinishedItems);

    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('border-indigo-500'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('border-indigo-500'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('border-indigo-500');
        handleFileSelection(e.dataTransfer.files);
    });
}


// --- LÓGICA DE CARGA ---

async function loadFoldersIntoSelect() {
    const { data, error } = await supabase.from('app_saas_carpetas').select('id, nombre').order('nombre');
    if (error) { console.error("Error al cargar carpetas:", error); return; }
    folderSelect.innerHTML = '<option value="">Sin carpeta</option>';
    data.forEach(folder => {
        folderSelect.innerHTML += `<option value="${folder.id}">${folder.nombre}</option>`;
    });
}

async function loadQueueFromDB() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // --- OPTIMIZACIÓN: Seleccionar solo las columnas necesarias para la UI ---
    const { data, error } = await supabase
        .from('app_saas_import_queue')
        .select('id, original_file_name, status, error_message')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

    if (error) {
        console.error("Error al cargar la cola:", error);
        return;
    }

    fileQueue = data.map(item => ({
        id: item.id,
        file: { name: item.original_file_name },
        status: item.status,
        error: item.error_message
    }));
    renderQueue();
}

function handleFileSelection(files) {
    const fileList = Array.from(files);
    let addedCount = 0;
    
    fileList.forEach(file => {
        if (file.type === 'application/pdf' && !fileQueue.some(item => item.file.name === file.name && item.id.toString().startsWith('local-'))) {
            fileQueue.push({
                id: `local-${Date.now()}-${Math.random()}`,
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

async function processAndEnqueueFiles() {
    isProcessing = true;
    renderQueue();
    processBtnText.textContent = 'Preparando archivos...';

    const itemsToProcess = fileQueue.filter(item => item.id.toString().startsWith('local-'));
    if (itemsToProcess.length === 0) {
        isProcessing = false;
        renderQueue();
        alert("No hay nuevos archivos para agregar a la cola.");
        return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    const newQueueItems = [];

    for (const item of itemsToProcess) {
        updateQueueItemStatus(item.id, 'procesando', 'Extrayendo texto...');
        try {
            const textoCV = await extractTextFromPdf(item.file);
            const base64 = await fileToBase64(item.file);
            newQueueItems.push({
                user_id: user.id,
                original_file_name: item.file.name,
                texto_cv: textoCV,
                base64_cv: base64,
                folder_id: folderSelect.value ? parseInt(folderSelect.value) : null,
                status: 'pending'
            });
            // Marcamos como "Encolado" en lugar de "Éxito" para claridad
            updateQueueItemStatus(item.id, 'procesando', 'Encolado');
        } catch (error) {
            updateQueueItemStatus(item.id, 'error', error.message);
        }
    }

    if (newQueueItems.length > 0) {
        processBtnText.textContent = 'Enviando a la cola...';
        const { error } = await supabase.from('app_saas_import_queue').insert(newQueueItems);
        if (error) {
            alert("Error al enviar archivos a la cola de procesamiento.");
        } else {
            alert(`${newQueueItems.length} CVs han sido enviados para procesarse en segundo plano. Puedes salir de esta página.`);
            await supabase.functions.invoke('process-cv-queue');
        }
    }
    
    isProcessing = false;
    processBtnText.textContent = 'Iniciar Carga';
    // No es necesario recargar la cola aquí, la suscripción en vivo lo hará
}

function updateQueueItemStatus(id, status, message = '') {
    const item = fileQueue.find(i => i.id.toString() === id.toString());
    if (item) {
        item.status = status;
        item.error = message;
    }
    renderQueue();
}

async function clearFinishedItems() {
    const { data: { user } } = await supabase.auth.getUser();
    const itemsToClear = fileQueue
        .filter(item => item.status === 'completed' || item.status === 'error')
        .map(item => item.id);
    
    if (itemsToClear.length === 0) return;

    const { error } = await supabase
        .from('app_saas_import_queue')
        .delete()
        .eq('user_id', user.id)
        .in('id', itemsToClear);

    if (error) {
        alert("Error al limpiar la cola.");
    } else {
        // CORRECCIÓN: Actualiza la UI inmediatamente después de limpiar.
        await loadQueueFromDB();
    }
}


// --- RENDERIZADO Y UI ---

function renderQueue() {
    const queueHtml = fileQueue.map(item => {
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
    
    queueList.innerHTML = queueHtml || '<li class="p-4 text-center text-sm text-gray-500">La cola de carga está vacía.</li>';

    const hasLocalPending = fileQueue.some(item => item.id.toString().startsWith('local-'));
    processQueueBtn.disabled = !hasLocalPending || isProcessing;
}

function getStatusInfo(status) {
    switch (status) {
        case 'pendiente': return { icon: 'fa-clock', text: 'Pendiente', textColor: 'text-gray-400', badgeBg: 'bg-gray-100', badgeText: 'text-gray-600', bgColor: 'bg-white' };
        case 'processing': return { icon: 'fa-spinner fa-spin', text: 'Procesando', textColor: 'text-indigo-500', badgeBg: 'bg-indigo-100', badgeText: 'text-indigo-700', bgColor: 'bg-white' };
        case 'completed': return { icon: 'fa-check-circle', text: 'Éxito', textColor: 'text-green-500', badgeBg: 'bg-green-100', badgeText: 'text-green-700', bgColor: 'bg-green-50' };
        case 'error': return { icon: 'fa-times-circle', text: 'Error', textColor: 'text-red-500', badgeBg: 'bg-red-100', badgeText: 'text-red-700', bgColor: 'bg-red-50' };
        default: return { icon: 'fa-question-circle', text: status || 'Desconocido', textColor: 'text-gray-400', badgeBg: 'bg-gray-100', badgeText: 'text-gray-600', bgColor: 'bg-white' };
    }
}

// --- TIEMPO REAL ---
async function suscribirseACambiosEnCola() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    supabase.channel('public:app_saas_import_queue')
        .on('postgres_changes', 
            { 
                event: '*', 
                schema: 'public', 
                table: 'app_saas_import_queue',
                filter: `user_id=eq.${user.id}`
            },
            (payload) => {
                console.log('Cambio en la cola:', payload);
                loadQueueFromDB();
                
                // Si una tarea se completa, se elimina o se inserta, le decimos al servidor que busque la siguiente
                if (payload.eventType === 'INSERT' || payload.eventType === 'DELETE' || (payload.new && (payload.new.status === 'completed' || payload.new.status === 'error'))) {
                    supabase.functions.invoke('process-cv-queue');
                }
            }
        ).subscribe();
}

// --- FUNCIONES AUXILIARES ---

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

async function extractTextFromPdf(file) {
    try {
        const fileArrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument(fileArrayBuffer).promise;
        let textoFinal = '';

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            textoFinal += textContent.items.map(item => item.str).join(' ');
        }
        
        if (textoFinal.trim().length > 50) {
            return textoFinal.trim().replace(/\x00/g, '');
        } 
        
        console.warn("Texto de PDF corto o ausente, iniciando OCR...");
        const worker = await Tesseract.createWorker('spa');
        let ocrText = '';

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 2.0 });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            await page.render({ canvasContext: context, viewport: viewport }).promise;
            const { data: { text } } = await worker.recognize(canvas);
            ocrText += text + '\n';
        }

        await worker.terminate();
        return ocrText;
    } catch (error) {
        console.error("Error al extraer texto del PDF:", error);
        throw new Error("No se pudo leer el archivo PDF.");
    }
}