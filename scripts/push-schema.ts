import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase credentials');
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function updateSchema() {
  try {
    // Add new columns to Post table
    const { error: alterError } = await supabase.rpc('alter_post_table', {
      sql: `
        ALTER TABLE "Post"
        ADD COLUMN IF NOT EXISTS "media_url" text,
        ADD COLUMN IF NOT EXISTS "media_type" text,
        ADD COLUMN IF NOT EXISTS "description" text;
      `
    });

    if (alterError) {
      throw alterError;
    }

    // Create indexes
    const { error: indexError } = await supabase.rpc('create_indexes', {
      sql: `
        CREATE INDEX IF NOT EXISTS "idx_post_media" ON "Post" ("media_url");
      `
    });

    if (indexError) {
      throw indexError;
    }

    console.log('Schema updated successfully');
  } catch (error) {
    console.error('Error updating schema:', error);
    process.exit(1);
  }
}

updateSchema(); 