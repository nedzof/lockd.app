import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const supabaseUrl = 'https://armwtaxnwajmunysmbjr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFybXd0YXhud2FqbXVueXNtYmpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg5MjI1MDQsImV4cCI6MjA1NDQ5ODUwNH0.RN5aElUBDafoPqdHI6xTL4EycZ72wxuOyFzWHJ0Un2g';

const supabase = createClient(supabaseUrl, supabaseKey);

async function pushSchema() {
  try {
    console.log('Reading schema file...');
    const schema = readFileSync('schema.sql', 'utf8');

    // Split the schema into individual statements
    const statements = schema
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    console.log('Executing schema statements...');
    for (const statement of statements) {
      console.log('Executing:', statement);
      try {
        const { data, error } = await supabase.rpc('execute_sql', {
          query: statement
        });

        if (error) {
          if (error.message.includes('already exists')) {
            console.log('Object already exists, continuing...');
          } else {
            console.error('Error executing statement:', error);
            throw error;
          }
        } else {
          console.log('Statement executed successfully');
        }
      } catch (error) {
        console.error('Error executing statement:', error);
        throw error;
      }
    }

    console.log('Schema successfully pushed to Supabase!');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

pushSchema(); 