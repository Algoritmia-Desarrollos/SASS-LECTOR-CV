import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { OpenAI } from "https://deno.land/x/openai/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Función para procesar una única tarea de la cola
async function processSingleQueueItem(queueItem, supabase) {
  await supabase
    .from('app_saas_import_queue')
    .update({ status: 'processing' })
    .eq('id', queueItem.id);

  try {
    const textoCV = queueItem.texto_cv;
    if (!textoCV) throw new Error("El texto del CV está vacío.");

    const prompt = `Actúa como un experto en extracción de datos de RRHH. Analiza el texto de un CV y devuelve un objeto JSON con "nombreCompleto", "email" y "telefono". Para "nombreCompleto", busca el nombre más prominente. Si un dato no se encuentra, devuelve null. CV: """${textoCV.substring(0, 4000)}"""`;
    
    const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });
    const chatCompletion = await openai.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
    });
    const extractedData = JSON.parse(chatCompletion.choices[0].message.content);

    const candidateData = {
      user_id: queueItem.user_id,
      nombre_candidato: extractedData.nombreCompleto || `Candidato ${queueItem.original_file_name}`,
      email: extractedData.email || `sin-email-${Date.now()}@dominio.com`,
      telefono: extractedData.telefono,
      base64_general: queueItem.base64_cv,
      texto_cv_general: textoCV,
      nombre_archivo_general: queueItem.original_file_name,
      carpeta_id: queueItem.folder_id,
    };

    await supabase
      .from('app_saas_candidatos')
      .upsert(candidateData, { onConflict: 'user_id, nombre_archivo_general' });

    await supabase.rpc('increment_cv_read_count', { user_id_param: queueItem.user_id, increment_value: 1 });

    await supabase
      .from('app_saas_import_queue')
      .update({ status: 'completed' })
      .eq('id', queueItem.id);

  } catch (processError) {
    console.error(`Error procesando la tarea ${queueItem.id}:`, processError.message);
    await supabase
      .from('app_saas_import_queue')
      .update({ status: 'error', error_message: processError.message })
      .eq('id', queueItem.id);
  }
}

serve(async (_req) => {
  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Bucle principal: procesará hasta 5 tareas en cada invocación para evitar timeouts.
    for (let i = 0; i < 5; i++) {
      const { data: queueItem, error: fetchError } = await supabaseAdmin
        .from('app_saas_import_queue')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      if (fetchError || !queueItem) {
        console.log("No hay más tareas pendientes.");
        break; // Sale del bucle si no hay más tareas
      }
      
      await processSingleQueueItem(queueItem, supabaseAdmin);
    }

    return new Response(JSON.stringify({ message: "Ciclo de procesamiento completado." }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error("Error en la función principal del worker:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});