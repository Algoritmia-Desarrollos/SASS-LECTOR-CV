// src/lib/supabaseClient.js

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
// Corregimos la ruta para que suba un nivel (de 'lib' a 'src') antes de buscar env.js
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../env.js';

// Creamos y exportamos el cliente de Supabase para usarlo en todo el proyecto.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);