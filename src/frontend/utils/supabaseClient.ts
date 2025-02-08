import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../types/supabase';

// Log all environment variables (except sensitive ones)
console.log('Environment variables:', {
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL ? 'present' : 'missing',
  NODE_ENV: import.meta.env.MODE,
  DEV: import.meta.env.DEV,
});

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables:', {
    url: supabaseUrl ? 'present' : 'missing',
    key: supabaseKey ? 'present' : 'missing'
  });
  throw new Error('Missing required Supabase configuration');
}

console.log('Initializing Supabase client with URL:', supabaseUrl);

declare global {
  var supabase: ReturnType<typeof createClient<Database>> | undefined;
}

let supabaseClient: ReturnType<typeof createClient<Database>>;

try {
  supabaseClient = globalThis.supabase ?? createClient<Database>(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });

  // Test the connection
  supabaseClient.from('Post').select('count').limit(1).then(({ data, error }) => {
    if (error) {
      console.error('Failed to connect to Supabase:', error);
    } else {
      console.log('Successfully connected to Supabase');
    }
  });

  if (import.meta.env.DEV) {
    globalThis.supabase = supabaseClient;
    console.log('Supabase client initialized in development mode');
  }
} catch (error) {
  console.error('Failed to initialize Supabase client:', error);
  throw error;
}

export const supabase = supabaseClient;
