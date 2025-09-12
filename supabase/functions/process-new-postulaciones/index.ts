import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Importante: Necesitas la API Key de OpenAI como un secreto
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
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    
    const { postulaciones } = await req.json();

    // Iniciar el procesamiento sin esperar a que termine para devolver una respuesta rápida.
    processPostulacionesInBackground(postulaciones, supabaseAdmin);
    
    return new Response(JSON.stringify({ message: "Procesamiento iniciado" }), {
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

async function processPostulacionesInBackground(postulacionIds, supabase) {
    for (const id of postulacionIds) {
        try {
            // 1. Obtener los datos necesarios para el análisis
            const { data: post, error: fetchError } = await supabase
                .from('app_saas_postulaciones')
                .select('texto_cv_especifico, aviso:app_saas_avisos(*)')
                .eq('id', id)
                .single();
            if (fetchError) throw fetchError;

            // 2. Preparar el prompt para la IA
            const prompt = `
              Eres un analista de RRHH experto. Analiza el CV y califícalo de 1 a 100 según los requisitos del aviso. Genera un resumen profesional.
              AVISO: Título: ${post.aviso.titulo}. Requisitos: ${post.aviso.condiciones_necesarias.join(', ')}.
              CV: """${post.texto_cv_especifico.substring(0, 12000)}"""
              Responde únicamente con un objeto JSON con claves "calificacion" (number) y "resumen" (string).
            `;
            
            // 3. Llamar a OpenAI
            const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });
            const chatCompletion = await openai.chat.completions.create({
                messages: [{ role: "user", content: prompt }],
                model: "gpt-4o-mini",
                response_format: { type: "json_object" },
            });
            const iaResult = JSON.parse(chatCompletion.choices[0].message.content);

            // 4. Actualizar la postulación con el resultado
            await supabase
                .from('app_saas_postulaciones')
                .update({ 
                    calificacion: iaResult.calificacion, 
                    resumen: iaResult.resumen 
                })
                .eq('id', id);

        } catch (error) {
            console.error(`Error procesando postulación ${id}:`, error.message);
            // Marcar como error para que el usuario sepa que algo salió mal
            await supabase
                .from('app_saas_postulaciones')
                .update({ calificacion: -1, resumen: `Error de análisis: ${error.message}` })
                .eq('id', id);
        }
    }
}