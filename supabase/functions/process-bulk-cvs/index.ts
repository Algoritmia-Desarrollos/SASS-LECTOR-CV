// supabase/functions/process-bulk-cvs/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { OpenAI } from "https://deno.land/x/openai/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { file_paths, user_id, folder_id } = await req.json();
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Inicia el procesamiento en segundo plano sin esperar a que termine.
    processFilesInBackground(file_paths, user_id, folder_id, supabaseAdmin);

    return new Response(JSON.stringify({ message: "Procesamiento en segundo plano iniciado" }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});

async function processFilesInBackground(filePaths, userId, folderId, supabase) {
  for (const filePath of filePaths) {
    try {
      // 1. Descargar el archivo de Supabase Storage
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('cvs-masivos')
        .download(filePath);
      
      if (downloadError) throw new Error(`Error descargando ${filePath}: ${downloadError.message}`);
      
      const textoCV = await extractTextFromPdf(fileData); // Asumimos que la función de extracción está disponible o la importamos
      if(!textoCV) continue; // Si no hay texto, saltamos al siguiente

      // 2. Analizar con IA
      const prompt = `Extrae nombre completo, email y teléfono del CV. Responde solo con un JSON. CV: """${textoCV.substring(0, 4000)}"""`;
      const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });
      const chatCompletion = await openai.chat.completions.create({
          messages: [{ role: "user", content: prompt }],
          model: "gpt-4o-mini",
          response_format: { type: "json_object" },
      });
      const extractedData = JSON.parse(chatCompletion.choices[0].message.content);

      // 3. Guardar en la base de datos (con lógica anti-duplicados)
      const newCandidateData = {
        user_id: userId,
        nombre_candidato: extractedData.nombreCompleto || `Candidato ${filePath.split('/').pop()}`,
        email: extractedData.email || `sin-email-${Date.now()}@dominio.com`,
        telefono: extractedData.telefono,
        // base64_general: ya no es necesario guardarlo aquí si se procesa desde el archivo
        texto_cv_general: textoCV,
        nombre_archivo_general: filePath.split('/').pop(),
        carpeta_id: folderId ? parseInt(folderId) : null,
      };

      const { error: upsertError } = await supabase
        .from('app_saas_candidatos')
        .upsert(newCandidateData, { onConflict: 'user_id, nombre_archivo_general' });

      if(upsertError) console.error(`Error guardando ${filePath}:`, upsertError);

      // 4. (Opcional) Eliminar el archivo de Storage para ahorrar espacio
      await supabase.storage.from('cvs-masivos').remove([filePath]);

    } catch (error) {
      console.error(`Fallo total en el procesamiento de ${filePath}:`, error.message);
    }
  }
}

// Lógica de extracción de PDF (debe ser compatible con Deno)
// Esta es una versión simplificada. Para OCR, se requeriría un enfoque más complejo en el servidor.
async function extractTextFromPdf(fileData) {
    // Aquí se necesitaría una librería de Deno para parsear PDFs.
    // Por simplicidad, este ejemplo asume que el texto puede ser extraído de alguna manera.
    // En un caso real, se usaría una librería como pdf-parse portada a Deno o una API externa.
    // De momento, retornamos un placeholder.
    return "Texto extraído del PDF (implementación pendiente en Deno)";
}