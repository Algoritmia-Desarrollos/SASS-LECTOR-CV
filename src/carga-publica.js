// src/carga-publica.js
import { supabase } from './supabaseClient.js';

// --- SELECTORES (son casi idénticos a postulacion.js) ---
const formView = document.getElementById('form-view');
const successView = document.getElementById('success-view');
const errorView = document.getElementById('error-view');
const errorTitle = document.getElementById('error-title');
const errorMessage = document.getElementById('error-message');
const cvForm = document.getElementById('cv-form');
const fileInput = document.getElementById('file-input');
const submitBtn = document.getElementById('submit-btn');
const dropZone = document.getElementById('drop-zone');
const fileLabelText = document.getElementById('file-label-text');
const uploadIcon = document.getElementById('upload-icon');
const uploadHint = document.getElementById('upload-hint');

// --- ESTADO ---
let ownerId = null;
let selectedFile = null;

// --- INICIALIZACIÓN ---
window.addEventListener('DOMContentLoaded', async () => {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

    const params = new URLSearchParams(window.location.search);
    ownerId = params.get('user'); // Obtenemos el ID del dueño del link

    if (!ownerId) {
        showErrorView("Link Inválido", "Este enlace de carga no es correcto.");
        return;
    }
});

// --- LÓGICA DE SUBIDA (reutilizamos mucho código) ---

cvForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!selectedFile || !ownerId) return;
    submitBtn.disabled = true;

    try {
        const textoCV = await extractTextFromPdf(selectedFile);
        const base64 = await fileToBase64(selectedFile);
        
        const { data: iaData, error: iaError } = await supabase.functions.invoke('openaiv2', {
            body: { query: `Extrae nombre, email y teléfono del CV. JSON. CV: """${textoCV.substring(0, 4000)}"""` },
        });
        if (iaError) throw new Error('Error de análisis IA');
        const extractedData = JSON.parse(iaData.message);
        
        // La única diferencia es que no hay postulación, solo se crea el candidato.
        const { error: upsertError } = await supabase
            .from('app_saas_candidatos')
            .upsert({
                user_id: ownerId, // Usamos el ID de la URL
                nombre_candidato: extractedData.nombreCompleto || `Candidato ${Date.now()}`,
                email: extractedData.email || `sin-email-${Date.now()}@dominio.com`,
                telefono: extractedData.telefono,
                base64_general: base64,
                texto_cv_general: textoCV,
                nombre_archivo_general: selectedFile.name,
            }, { onConflict: 'user_id, email' });

        if (upsertError) throw upsertError;
        
        // Importante: También incrementamos el contador del dueño del link.
        await supabase.rpc('increment_cv_read_count', { user_id_param: ownerId, increment_value: 1 });

        formView.classList.add('hidden');
        successView.classList.remove('hidden');

    } catch (error) {
        showErrorView("Error al Procesar", `No se pudo procesar tu CV. (${error.message})`);
        submitBtn.disabled = false;
    }
});


// --- FUNCIONES AUXILIARES (Idénticas a las de postulacion.js) ---
function showErrorView(title, message) { /* ... */ }
function handleFile(file) { /* ... */ }
function fileToBase64(file) { /* ... */ }
async function extractTextFromPdf(file) { /* ... */ }

// (Pega aquí el código completo de las funciones auxiliares de 'postulacion.js' 
// o impórtalas desde un archivo 'utils.js' compartido para no repetir código)

// --- Pegado para completitud del ejemplo ---
function showErrorView(title, message) {
    formView.classList.add('hidden');
    successView.classList.add('hidden');
    errorView.classList.remove('hidden');
    errorTitle.textContent = title;
    errorMessage.textContent = message;
}
function handleFile(file) {
    const maxSize = 5 * 1024 * 1024;
    if (file && file.type === 'application/pdf' && file.size <= maxSize) {
        selectedFile = file;
        dropZone.classList.add('border-green-500', 'bg-green-50');
        uploadIcon.className = 'fa-solid fa-file-pdf text-4xl text-green-600';
        fileLabelText.textContent = selectedFile.name;
        uploadHint.textContent = '¡Listo para enviar!';
        submitBtn.disabled = false;
    } else { /* ... */ }
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

// Listeners de Drag & Drop (igual que en postulacion.js)
fileInput.addEventListener('change', (e) => handleFile(e.target.files[0]));
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('border-indigo-500'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('border-indigo-500'));
dropZone.addEventListener('drop', (e) => { e.preventDefault(); dropZone.classList.remove('border-indigo-500'); handleFile(e.dataTransfer.files[0]); });