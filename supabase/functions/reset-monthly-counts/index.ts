import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (_req) => {
  try {
    // Es crucial usar las claves de Service Role para tener permisos de administrador
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    
    // Llamamos a la función de la base de datos que creamos en el paso 1
    const { error } = await supabaseAdmin.rpc('reset_monthly_cv_counts');
    if (error) throw error;

    console.log("Contadores de CV reseteados exitosamente.");
    return new Response("OK: Los contadores de CV han sido reseteados.", { status: 200 });
  } catch (e) {
    console.error("Error al resetear los contadores:", e);
    return new Response(`Error: ${e.message}`, { status: 500 });
  }
});