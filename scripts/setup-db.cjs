#!/usr/bin/env node
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function setupDatabase() {
  if (!process.env.VITE_SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error('Missing required environment variables: VITE_SUPABASE_URL and/or SUPABASE_SERVICE_KEY');
    process.exit(1);
  }

  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  try {
    // Read the SQL file
    const sqlFile = path.join(__dirname, 'setup-db.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');

    // Execute the SQL statements
    console.log('Executing SQL statements...');
    const { data, error } = await supabase.from('Post').select('*').limit(1);
    if (error && error.code === 'PGRST205') {
      // Tables don't exist yet, create them
      console.log('Creating tables...');
      const { error: createError } = await supabase.from('Post').insert({
        id: 'test',
        content: 'test',
        author_address: 'test',
        is_locked: false
      });
      if (createError && createError.code === 'PGRST205') {
        console.log('Tables need to be created. Please run the SQL statements in the Supabase SQL editor:');
        console.log('\n' + sql);
      } else if (createError) {
        throw createError;
      }
    } else if (error) {
      throw error;
    } else {
      console.log('Tables already exist');
    }

    console.log('Database setup completed');
  } catch (error) {
    console.error('Error setting up database:', error);
    process.exit(1);
  }
}

setupDatabase(); 