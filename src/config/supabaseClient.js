import { createClient } from '@supabase/supabase-js';

// .env file se keys fetch karna (Vite me import.meta.env use hota hai)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Supabase client instance create karna
export const supabase = createClient(supabaseUrl, supabaseAnonKey);