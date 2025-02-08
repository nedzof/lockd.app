import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../types/supabase';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://armwtaxnwajmunysmbjr.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFybXd0YXhud2FqbXVueXNtYmpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg5MjI1MDQsImV4cCI6MjA1NDQ5ODUwNH0.RN5aElUBDafoPqdHI6xTL4EycZ72wxuOyFzWHJ0Un2g';

declare global {
  var supabase: ReturnType<typeof createClient<Database>> | undefined;
}

const supabaseClient = globalThis.supabase ?? createClient<Database>(supabaseUrl, supabaseKey);

if (process.env.NODE_ENV !== 'production') globalThis.supabase = supabaseClient;

export default supabaseClient; 