// src/crear-aviso.js
import { supabase } from './supabaseClient.js';

// --- SELECTORES DEL FORMULARIO ---
const avisoForm = document.getElementById('aviso-form');
const puestoInput = document.getElementById('puesto-trabajo');
const descripcionTextarea = document.getElementById('descripcion-trabajo');
const maxCvSelect = document.getElementById('max-cv');
const validoHastaInput = document.getElementById('valido-hasta');
const submitBtn = document.getElementById('submit-btn');

// --- SELECTORES DE CONDICIONES ---
const necesariaInput = document.getElementById('necesaria-input');
const deseableInput = document.getElementById('deseable-input');
const addNecesariaBtn = document.getElementById('add-necesaria-btn');
const addDeseableBtn = document.getElementById('add-deseable-btn');
const necesariasList = document.getElementById('necesarias-list');
const deseablesList = document.getElementById('deseables-list');

// --- SELECTORES DE MENSAJES Y BOTÓN IA ---
const generarDescripcionBtn = document.getElementById('generar-descripcion-btn');
const generarBtnText = document.getElementById('generar-btn-text');
const successMessage = document.getElementById('success-message');
const errorMessage = document.getElementById('error-message');

// --- ESTADO LOCAL ---
let condicionesNecesarias = [];
let condicionesDeseables = [];

// --- MANEJO DINÁMICO DE CONDICIONES ---

// Función genérica para renderizar las etiquetas de condiciones
function renderizarCondiciones(listaElemento, arrayCondiciones, tipo) {
    listaElemento.innerHTML = '';
    arrayCondiciones.forEach((condicion, index) => {
        const item = document.createElement('div');
        item.className = 'flex items-center justify-between bg-gray-100 p-2 rounded-md';
        item.innerHTML = `
            <span class="text-sm text-gray-800">${condicion}</span>
            <button type="button" class="text-gray-400 hover:text-red-500" data-index="${index}" data-tipo="${tipo}">
                <i class="fa-solid fa-trash-can"></i>
            </button>
        `;
        listaElemento.appendChild(item);
    });
}

// Añadir una condición a la lista
function agregarCondicion(tipo) {
    const input = tipo === 'necesaria' ? necesariaInput : deseableInput;
    const lista = tipo === 'necesaria' ? condicionesNecesarias : condicionesDeseables;
    const listaElemento = tipo === 'necesaria' ? necesariasList : deseablesList;
    
    if (input.value.trim()) {
        lista.push(input.value.trim());
        input.value = '';
        renderizarCondiciones(listaElemento, lista, tipo);
    }
}

// Event Listeners para añadir condiciones
addNecesariaBtn.addEventListener('click', () => agregarCondicion('necesaria'));
necesariaInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        agregarCondicion('necesaria');
    }
});

addDeseableBtn.addEventListener('click', () => agregarCondicion('deseable'));
deseableInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        agregarCondicion('deseable');
    }
});

// Listener para eliminar condiciones (delegación de eventos)
document.addEventListener('click', (e) => {
    const removeBtn = e.target.closest('button[data-tipo]');
    if (!removeBtn) return;
    
    const index = parseInt(removeBtn.dataset.index, 10);
    const tipo = removeBtn.dataset.tipo;

    if (tipo === 'necesaria') {
        condicionesNecesarias.splice(index, 1);
        renderizarCondiciones(necesariasList, condicionesNecesarias, 'necesaria');
    } else if (tipo === 'deseable') {
        condicionesDeseables.splice(index, 1);
        renderizarCondiciones(deseablesList, condicionesDeseables, 'deseable');
    }
});


// --- GENERACIÓN CON IA ---
generarDescripcionBtn.addEventListener('click', async () => {
    const puesto = puestoInput.value.trim();
    if (!puesto) {
        alert("Por favor, primero escribe un título para el puesto.");
        return;
    }

    generarDescripcionBtn.disabled = true;
    generarBtnText.textContent = 'Generando...';

    const prompt = `
      Actúa como un experto en RRHH. Crea el contenido para una búsqueda laboral con el título: "${puesto}".
      Tu respuesta DEBE SER únicamente un objeto JSON con 3 claves: "descripcion" (un párrafo conciso de 80-150 palabras), "condiciones_necesarias" (un array de 4 strings realistas y clave para el puesto), y "condiciones_deseables" (un array de 3 strings que aporten valor).
    `;

    try {
        const { data, error } = await supabase.functions.invoke('openaiv2', {
            body: { query: prompt },
        });
        if (error) throw error;
        
        const iaResult = JSON.parse(data.message);
        descripcionTextarea.value = iaResult.descripcion || '';
        condicionesNecesarias = iaResult.condiciones_necesarias || [];
        condicionesDeseables = iaResult.condiciones_deseables || [];

        renderizarCondiciones(necesariasList, condicionesNecesarias, 'necesaria');
        renderizarCondiciones(deseablesList, condicionesDeseables, 'deseable');

    } catch (error) {
        console.error("Error al generar con IA:", error);
        alert("Hubo un error al contactar con la IA. Por favor, inténtalo de nuevo.");
    } finally {
        generarDescripcionBtn.disabled = false;
        generarBtnText.textContent = 'Generar con IA';
    }
});


// --- ENVÍO DEL FORMULARIO ---
avisoForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    successMessage.classList.add('hidden');
    errorMessage.classList.add('hidden');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Guardando...';

    const nuevoAviso = {
        titulo: puestoInput.value,
        descripcion: descripcionTextarea.value,
        max_cv: parseInt(maxCvSelect.value, 10),
        valido_hasta: validoHastaInput.value,
        condiciones_necesarias: condicionesNecesarias,
        condiciones_deseables: condicionesDeseables,
        // El user_id se asigna automáticamente gracias a las políticas de seguridad (RLS)
        // y al valor por defecto que pusimos en la base de datos.
    };

    const { error } = await supabase.from('APP_SAAS_AVISOS').insert(nuevoAviso);

    if (error) {
        console.error('Error al guardar el aviso:', error);
        errorMessage.textContent = `Error al guardar: ${error.message}`;
        errorMessage.classList.remove('hidden');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Guardar y Publicar';
        return;
    }

    successMessage.classList.remove('hidden');
    
    setTimeout(() => {
        window.location.href = 'lista-avisos.html';
    }, 2000);
});