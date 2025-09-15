// src/postulacion.js
import { supabase } from './lib/supabaseClient.js';

// ... (mantén tus selectores del DOM)
const loadingView = document.getElementById('loading-view');
const avisoHeader = document.getElementById('aviso-header');
// ... (resto de tus selectores)
const avisoTitulo = document.getElementById('aviso-titulo');
const formView = document.getElementById('form-view');
const successView = document.getElementById('success-view');
const errorView = document.getElementById('error-view');
const errorTitle = document.getElementById('error-title');
const errorMessage = document.getElementById('error-message');
const cvForm = document.getElementById('cv-form');
const fileInput = document.getElementById('file-input');
const submitBtn = document.getElementById('submit-btn');
const submitBtnText = document.getElementById('submit-btn-text');
const dropZone = document.getElementById('drop-zone');
const fileLabelText = document.getElementById('file-label-text');
const uploadIcon = document.getElementById('upload-icon');
const uploadHint = document.getElementById('upload-hint');


// --- Nuevos límites de planes ---
const planLimits = {
    gratis: 50,
    basico: 2000,
    profesional: Infinity
};

// ... (resto del código de postulación.js sin cambios, excepto la sección de verificación)
let avisoActivo = null;
let selectedFile = null;

window.addEventListener('DOMContentLoaded', async () => {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
    const params = new URLSearchParams(window.location.search);
    const avisoId = params.get('avisoId');

    if (!avisoId) {
        return showErrorView("Link Inválido", "El enlace de postulación no es correcto.");
    }
    
    const { data: aviso, error } = await supabase
        .from('app_saas_avisos').select('*').eq('id', avisoId).single();

    if (error || !aviso) {
        return showErrorView("Búsqueda no Encontrada", "El aviso que buscas ya no existe.");
    }
    
    // --- VERIFICACIÓN DE LÍMITES ACTUALIZADA ---
    const { data: ownerProfile, error: profileError } = await supabase
        .from('app_saas_users')
        .select('subscription_plan, cv_read_count')
        .eq('id', aviso.user_id)
        .single();

    if (profileError || !ownerProfile) {
        return showErrorView("Error del Reclutador", "No se pudo verificar la cuenta del reclutador.");
    }

    const plan = ownerProfile.subscription_plan || 'gratis';
    const limit = planLimits[plan];
    
    if (ownerProfile.cv_read_count >= limit) {
        return showErrorView("Límite del Reclutador Alcanzado", "Esta empresa ha alcanzado su límite de análisis de CVs por el momento. Intenta más tarde.");
    }
    // --- FIN DE LA VERIFICACIÓN ---

    avisoActivo = aviso;
    loadingView.classList.add('hidden');
    avisoHeader.classList.remove('hidden');
    formView.classList.remove('hidden');
    avisoTitulo.textContent = `Postúlate para: ${avisoActivo.titulo}`;
});

// ... (El resto del código de `postulacion.js` permanece igual)
cvForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!selectedFile || !avisoActivo) return;

    submitBtn.disabled = true;
    submitBtnText.textContent = 'Procesando...';

    try {
        const textoCV = await extractTextFromPdf(selectedFile);
        const base64 = await fileToBase64(selectedFile);

        const { data: iaData, error: iaError } = await supabase.functions.invoke('openaiv2', {
            body: { 
                query: `Extrae nombre completo, email y teléfono del siguiente CV. Responde solo con un JSON con claves "nombreCompleto", "email", "telefono". CV: """${textoCV.substring(0, 4000)}"""`
            },
        });
        if (iaError) throw new Error('Error de análisis IA');
        const extractedData = JSON.parse(iaData.message);
        
        const { data: candidato, error: upsertError } = await supabase
            .from('app_saas_candidatos')
            .upsert({
                user_id: avisoActivo.user_id,
                nombre_candidato: extractedData.nombreCompleto || `Candidato ${Date.now()}`,
                email: extractedData.email || `sin-email-${Date.now()}@dominio.com`,
                telefono: extractedData.telefono,
                base64_general: base64,
                texto_cv_general: textoCV,
                nombre_archivo_general: selectedFile.name,
            }, {
                onConflict: 'user_id, email',
            })
            .select('id')
            .single();

        if (upsertError) throw upsertError;
        
        const { error: postulaError } = await supabase
            .from('app_saas_postulaciones')
            .insert({
                candidato_id: candidato.id,
                aviso_id: avisoActivo.id,
                base64_cv_especifico: base64,
                texto_cv_especifico: textoCV,
                nombre_archivo_especifico: selectedFile.name
            });
        
        if (postulaError && postulaError.code !== '23505') {
            throw postulaError;
        }

        await supabase.rpc('increment_cv_read_count', { user_id_param: avisoActivo.user_id, increment_value: 1 });

        formView.classList.add('hidden');
        avisoHeader.classList.add('hidden');
        successView.classList.remove('hidden');

    } catch (error) {
        console.error("Error en el proceso de carga:", error);
        showErrorView("Error al Procesar", `No se pudo procesar tu CV. Por favor, inténtalo de nuevo. (${error.message})`);
        submitBtn.disabled = false;
        submitBtnText.textContent = 'Reintentar Envío';
    }
});
function handleFile(file) {
    const maxSize = 5 * 1024 * 1024;
    const allowedType = 'application/pdf';

    if (file && file.type === allowedType && file.size <= maxSize) {
        selectedFile = file;
        dropZone.classList.add('border-green-500', 'bg-green-50');
        uploadIcon.className = 'fa-solid fa-file-pdf text-4xl text-green-600';
        fileLabelText.textContent = selectedFile.name;
        uploadHint.textContent = '¡Archivo listo para enviar!';
        submitBtn.disabled = false;
    } else {
        selectedFile = null;
        submitBtn.disabled = true;
        dropZone.classList.remove('border-green-500', 'bg-green-50');
        uploadIcon.className = 'fa-solid fa-cloud-arrow-up text-4xl text-gray-400';
        fileLabelText.textContent = 'Arrastra y suelta tu CV aquí';
        uploadHint.textContent = 'Solo PDF, máx: 5MB';
        if (file) {
            alert("Por favor, selecciona un archivo PDF de menos de 5MB.");
        }
    }
}
function showErrorView(title, message) {
    loadingView.classList.add('hidden');
    formView.classList.add('hidden');
    avisoHeader.classList.add('hidden');
    errorView.classList.remove('hidden');
    errorTitle.textContent = title;
    errorMessage.textContent = message;
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
    let textoFinal = '';
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        textoFinal += textContent.items.map(item => item.str).join(' ');
    }
    if (textoFinal.trim().length > 100) {
        return textoFinal.trim().replace(/\x00/g, '');
    } else {
        const worker = await Tesseract.createWorker('spa');
        const { data: { text } } = await worker.recognize(file);
        await worker.terminate();
        return text;
    }
}
fileInput.addEventListener('change', (e) => handleFile(e.target.files[0]));
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('border-indigo-500'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('border-indigo-500'));
dropZone.addEventListener('drop', (e) => { e.preventDefault(); dropZone.classList.remove('border-indigo-500'); handleFile(e.dataTransfer.files[0]); });