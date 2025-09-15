// src/resumenes.js
import { supabase } from './lib/supabaseClient.js';
import { showModal, hideModal } from './utils.js';

// --- SELECTORES DEL DOM ---
const panelTitle = document.getElementById('panel-title');
const processingStatus = document.getElementById('processing-status');
const resumenesListBody = document.getElementById('resumenes-list');
const detailsLinkBtn = document.getElementById('details-link-btn');
const publicLinkBtn = document.getElementById('public-link-btn');
const postulantesCountDisplay = document.getElementById('postulantes-count-display');
const filtroInput = document.getElementById('filtro-candidatos');
const sortSelect = document.getElementById('sort-select');
const bulkUploadBtn = document.getElementById('bulk-upload-btn');

// --- SELECTORES DE MODALES ---
const modalContainer = document.getElementById('modal-container');
const modalTitle = document.getElementById('modal-title');
const modalResumenContent = document.getElementById('modal-resumen-content');
const modalNotasContent = document.getElementById('modal-notas-content');
const modalNotasTextarea = document.getElementById('modal-notas-textarea');
const modalSaveNotesBtn = document.getElementById('modal-save-notes-btn');
const notesHistoryContainer = document.getElementById('notes-history-container');
const contactModalContainer = document.getElementById('contact-modal-container');
const contactModalTitle = document.getElementById('contact-modal-title');
const contactModalBody = document.getElementById('contact-modal-body');

// --- ESTADO ---
let avisoActivo = null;
let postulacionesCache = [];
let currentCandidatoIdParaNotas = null;

// --- INICIALIZACIÓN ---
window.addEventListener('DOMContentLoaded', async () => {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

    const params = new URLSearchParams(window.location.search);
    const avisoId = params.get('avisoId');

    if (!avisoId) {
        panelTitle.textContent = "Aviso no especificado";
        return;
    }
    
    await cargarDatosDeAviso(avisoId);
    
    bulkUploadBtn.addEventListener('click', handleBulkUpload);
    filtroInput.addEventListener('input', () => applyFiltersAndSort());
    sortSelect.addEventListener('change', () => applyFiltersAndSort());
    modalContainer.querySelectorAll('.modal-close-btn').forEach(btn => btn.addEventListener('click', () => hideModal('modal-container')));
    contactModalContainer.querySelectorAll('.modal-close-btn').forEach(btn => btn.addEventListener('click', () => hideModal('contact-modal-container')));
    modalSaveNotesBtn.addEventListener('click', handleSaveNote);
});

// --- LÓGICA DE CARGA DE DATOS ---

async function cargarDatosDeAviso(avisoId) {
    const { data: aviso, error: avisoError } = await supabase
        .from('app_saas_avisos')
        .select('*')
        .eq('id', avisoId)
        .single();

    if (avisoError) {
        panelTitle.textContent = "Error al cargar el aviso";
        return;
    }
    avisoActivo = aviso;
    panelTitle.textContent = `Postulantes para: ${aviso.titulo}`;
    detailsLinkBtn.href = `detalles-aviso.html?id=${aviso.id}`;
    
    const publicLink = `${window.location.origin}/postulacion.html?avisoId=${aviso.id}`;
    publicLinkBtn.href = publicLink;

    const maxCv = aviso.max_cv || '∞';
    postulantesCountDisplay.innerHTML = `<strong>${aviso.postulaciones_count || 0} / ${maxCv}</strong> Postulantes`;

    await cargarPostulantes(avisoId);
    suscribirseACambios();
}

async function cargarPostulantes(avisoId) {
    processingStatus.textContent = "Cargando postulantes...";
    const { data, error } = await supabase
        .from('app_saas_postulaciones')
        .select(`
            id, calificacion, resumen, created_at,
            candidato:app_saas_candidatos (id, nombre_candidato, email, telefono, nombre_archivo_general, app_saas_notas(count))
        `)
        .eq('aviso_id', avisoId);

    if (error) {
        console.error("Error al cargar postulantes:", error);
        processingStatus.textContent = "Error al cargar.";
        return;
    }
    
    postulacionesCache = data || [];
    applyFiltersAndSort();
    
    const pendientes = postulacionesCache.filter(p => p.calificacion === null).length;
    if (pendientes > 0) {
        processingStatus.textContent = `Análisis en progreso para ${pendientes} CVs. Los resultados aparecerán automáticamente.`;
    } else {
        processingStatus.textContent = "";
    }
}

// --- RENDERIZADO Y FILTRADO ---

function applyFiltersAndSort() {
    let data = [...postulacionesCache];
    const searchTerm = filtroInput.value.toLowerCase().trim();

    if (searchTerm) {
        data = data.filter(p =>
            (p.candidato?.nombre_candidato || '').toLowerCase().includes(searchTerm) ||
            (p.candidato?.email || '').toLowerCase().includes(searchTerm) ||
            (p.candidato?.telefono || '').toLowerCase().includes(searchTerm)
        );
    }

    const [sortColumn, sortOrder] = sortSelect.value.split('-');
    data.sort((a, b) => {
        let valA, valB;
        if (sortColumn === 'nombre_candidato') {
            valA = a.candidato?.nombre_candidato || '';
            valB = b.candidato?.nombre_candidato || '';
            return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        if (sortColumn === 'calificacion') {
            valA = a.calificacion ?? -1;
            valB = b.calificacion ?? -1;
            return sortOrder === 'asc' ? valA - valB : valB - valA;
        }
        valA = new Date(a.created_at || 0);
        valB = new Date(b.created_at || 0);
        return sortOrder === 'asc' ? valA - valB : valB - valA;
    });

    renderizarTabla(data);
}

function renderizarTabla(postulaciones) {
    resumenesListBody.innerHTML = '';
    if (postulaciones.length === 0) {
        resumenesListBody.innerHTML = `<tr><td colspan="5" class="text-center py-10 text-gray-500">No hay postulantes para esta búsqueda.</td></tr>`;
        return;
    }
    postulaciones.forEach(p => resumenesListBody.appendChild(crearFila(p)));
}

function crearFila(postulacion) {
    const row = document.createElement('tr');
    row.dataset.postulacionId = postulacion.id;
    const candidato = postulacion.candidato;

    let calificacionHTML = '<span class="text-sm text-gray-500">Pendiente...</span>';
    if (postulacion.calificacion === -1) {
        calificacionHTML = '<strong class="text-red-600">Error</strong>';
    } else if (typeof postulacion.calificacion === 'number') {
        calificacionHTML = `<strong class="text-lg font-bold ${postulacion.calificacion >= 75 ? 'text-green-600' : 'text-gray-800'}">${postulacion.calificacion}</strong> <span class="text-sm text-gray-500">/ 100</span>`;
    }
    
    const tieneNotas = candidato.app_saas_notas && candidato.app_saas_notas.length > 0 && candidato.app_saas_notas[0].count > 0;

    row.innerHTML = `
        <td class="px-6 py-4 whitespace-nowrap">
            <div class="text-sm font-semibold text-gray-900">${candidato?.nombre_candidato || 'N/A'} ${tieneNotas ? '<i class="fa-solid fa-note-sticky text-gray-400 ml-1"></i>' : ''}</div>
            <div class="text-xs text-gray-500">${candidato?.nombre_archivo_general || ''}</div>
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
            <div>${candidato?.email || ''}</div>
            <button data-action="ver-contacto" class="text-xs text-indigo-600 hover:underline">Ver más</button>
        </td>
        <td class="px-6 py-4 whitespace-nowrap">${calificacionHTML}</td>
        <td class="px-6 py-4 whitespace-nowrap">
            <button data-action="ver-resumen" class="text-indigo-600 hover:text-indigo-900 disabled:opacity-50" ${!postulacion.resumen ? 'disabled' : ''}>Ver Análisis</button>
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
            <div class="flex items-center justify-end space-x-1">
                <button data-action="ver-notas" title="Notas" class="p-2 rounded-full hover:bg-gray-200 text-gray-500 hover:text-gray-800 transition-colors">
                    <i class="fa-solid fa-pen-to-square fa-lg"></i>
                </button>
                <button data-action="ver-cv" title="Descargar CV" class="p-2 rounded-full hover:bg-gray-200 text-gray-500 hover:text-gray-800 transition-colors">
                    <i class="fa-solid fa-download fa-lg"></i>
                </button>
            </div>
        </td>
    `;
    
    row.querySelector('[data-action="ver-resumen"]').addEventListener('click', () => abrirModalResumen(postulacion));
    row.querySelector('[data-action="ver-notas"]').addEventListener('click', () => abrirModalNotas(candidato.id));
    row.querySelector('[data-action="ver-cv"]').addEventListener('click', () => descargarCV(candidato.id));
    row.querySelector('[data-action="ver-contacto"]').addEventListener('click', () => abrirModalContacto(candidato));

    return row;
}

// --- MODALES ---

function abrirModalResumen(postulacion) {
    modalTitle.textContent = `Análisis de ${postulacion.candidato.nombre_candidato}`;
    modalResumenContent.textContent = postulacion.resumen || "No hay análisis disponible.";
    modalResumenContent.classList.remove('hidden');
    modalNotasContent.classList.add('hidden');
    modalSaveNotesBtn.classList.add('hidden');
    showModal('modal-container');
}

async function abrirModalNotas(candidatoId) {
    currentCandidatoIdParaNotas = candidatoId;
    modalTitle.textContent = `Notas del Candidato`;
    modalNotasTextarea.value = '';
    notesHistoryContainer.innerHTML = '<p>Cargando notas...</p>';
    
    modalResumenContent.classList.add('hidden');
    modalNotasContent.classList.remove('hidden');
    modalSaveNotesBtn.classList.remove('hidden');
    showModal('modal-container');

    const { data: notas, error } = await supabase
        .from('app_saas_notas')
        .select('*')
        .eq('candidato_id', candidatoId)
        .order('created_at', { ascending: false });

    if (error) {
        notesHistoryContainer.innerHTML = '<p class="text-red-500">Error al cargar notas.</p>';
        return;
    }
    
    if (notas.length === 0) {
        notesHistoryContainer.innerHTML = '<p class="text-gray-500">Aún no hay notas para este candidato.</p>';
    } else {
        notesHistoryContainer.innerHTML = notas.map(n => `
            <div class="bg-gray-50 p-3 rounded-md border border-gray-200">
                <p class="text-gray-800">${n.nota}</p>
                <p class="text-xs text-gray-500 mt-2">
                    ${new Date(n.created_at).toLocaleString()} 
                </p>
            </div>
        `).join('');
    }
}

function abrirModalContacto(candidato) {
    contactModalTitle.textContent = `Contacto de ${candidato.nombre_candidato}`;
    contactModalBody.innerHTML = `
        <div class="flex items-center gap-3">
            <i class="fa-solid fa-envelope text-gray-400 w-5 text-center"></i>
            <span class="text-gray-800">${candidato.email || 'No disponible'}</span>
        </div>
        <div class="flex items-center gap-3">
            <i class="fa-solid fa-phone text-gray-400 w-5 text-center"></i>
            <span class="text-gray-800">${candidato.telefono || 'No disponible'}</span>
        </div>
    `;
    showModal('contact-modal-container');
}

// --- LÓGICA DE ACCIONES ---

async function handleSaveNote() {
    const nota = modalNotasTextarea.value.trim();
    if (!nota || !currentCandidatoIdParaNotas) return;
    
    const { data: { session } } = await supabase.auth.getSession();

    const { error } = await supabase.from('app_saas_notas').insert({
        candidato_id: currentCandidatoIdParaNotas,
        postulacion_id: postulacionesCache.find(p => p.candidato.id === currentCandidatoIdParaNotas)?.id,
        user_id: session.user.id,
        nota: nota
    });

    if (error) {
        alert("Error al guardar la nota.");
    } else {
        abrirModalNotas(currentCandidatoIdParaNotas);
        cargarPostulantes(avisoActivo.id);
    }
}

async function descargarCV(candidatoId) {
    const { data, error } = await supabase
        .from('app_saas_candidatos')
        .select('base64_general, nombre_archivo_general')
        .eq('id', candidatoId)
        .single();
    
    if (error || !data.base64_general) {
        alert("No se pudo obtener el CV.");
        return;
    }

    const link = document.createElement('a');
    link.href = data.base64_general;
    link.download = data.nombre_archivo_general || 'cv.pdf';
    link.click();
}

// --- TIEMPO REAL Y CARGA MASIVA ---

function suscribirseACambios() {
    const changes = supabase.channel('postulaciones-changes')
      .on('postgres_changes', { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'app_saas_postulaciones',
          filter: `aviso_id=eq.${avisoActivo.id}`
      }, (payload) => {
          console.log('Cambio recibido en tiempo real:', payload.new);
          const index = postulacionesCache.findIndex(p => p.id === payload.new.id);
          if (index !== -1) {
              postulacionesCache[index].calificacion = payload.new.calificacion;
              postulacionesCache[index].resumen = payload.new.resumen;
              applyFiltersAndSort();
          }
      })
      .subscribe();
}

function handleBulkUpload() {
    if (!avisoActivo) return;

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    fileInput.multiple = true;
    
    fileInput.onchange = async (e) => {
        let files = Array.from(e.target.files);
        if (files.length === 0) return;

        bulkUploadBtn.disabled = true;
        bulkUploadBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i> Procesando...`;

        const existingFileNames = new Set(postulacionesCache.map(p => p.candidato?.nombre_archivo_general));
        const newFiles = files.filter(file => !existingFileNames.has(file.name));
        const skippedCount = files.length - newFiles.length;

        processingStatus.textContent = `Procesando ${newFiles.length} archivo(s)...`;
        
        let successCount = 0;
        const errors = [];

        for (const file of newFiles) {
            try {
                await processSingleFile(file);
                successCount++;
            } catch (error) {
                console.error(`Error con el archivo ${file.name}:`, error);
                errors.push(file.name);
            }
        }
        
        let alertMessage = `Carga completada. ${successCount} CVs procesados con éxito.`;
        if (skippedCount > 0) {
            alertMessage += ` ${skippedCount} archivo(s) se omitieron por ser duplicados.`;
        }
        if (errors.length > 0) {
            alertMessage += ` ${errors.length} fallaron.`;
        }
        alert(alertMessage);
        
        await cargarDatosDeAviso(avisoActivo.id);

        bulkUploadBtn.disabled = false;
        bulkUploadBtn.innerHTML = `<i class="fa-solid fa-upload mr-2"></i> Carga Masiva`;
    };

    fileInput.click();
}

async function processSingleFile(file) {
    const textoCV = await extractTextFromFile(file);
    if (!textoCV) throw new Error("No se pudo extraer texto.");
    
    const base64 = await fileToBase64(file);

    const { data: iaData, error: iaError } = await supabase.functions.invoke('openaiv2', {
        body: { query: `Extrae nombre completo, email y teléfono del CV. Responde solo con un JSON. CV: """${textoCV.substring(0, 4000)}"""` },
    });
    if (iaError) throw new Error('Error de análisis IA');
    const extractedData = JSON.parse(iaData.message);

    const { data: candidato, error: upsertError } = await supabase
        .from('app_saas_candidatos')
        .upsert({
            user_id: avisoActivo.user_id,
            nombre_candidato: extractedData.nombreCompleto || `Candidato ${file.name}`,
            email: extractedData.email || `sin-email-${Date.now()}@dominio.com`,
            telefono: extractedData.telefono,
            base64_general: base64,
            texto_cv_general: textoCV,
            nombre_archivo_general: file.name,
        }, { onConflict: 'user_id, email' })
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
            nombre_archivo_especifico: file.name
        });
    
    if (postulaError && postulaError.code !== '23505') throw postulaError;
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

async function extractTextFromFile(file) {
    try {
        if (file.type === 'application/pdf') {
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
                console.warn("Texto de PDF corto, intentando OCR.");
                const worker = await Tesseract.createWorker('spa');
                const { data: { text } } = await worker.recognize(file);
                await worker.terminate();
                return text;
            }

        } else if (file.type.includes('msword') || file.type.includes('wordprocessingml')) {
            const arrayBuffer = await file.arrayBuffer();
            const result = await mammoth.extractRawText({ arrayBuffer });
            return result.value;
        }
    } catch (error) {
        if (error.message.includes('Could not find main document part')) {
            alert("Error de Compatibilidad: Este archivo de Word (.doc) no es compatible. Por favor, ábrelo con un editor de texto y guárdalo como 'Documento de Word (.docx)' o 'PDF' e inténtalo de nuevo.");
            throw new Error("Archivo .doc no compatible.");
        }
        throw error;
    }

    throw new Error("Formato de archivo no soportado para extracción de texto.");
}