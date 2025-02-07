import { supabase } from './src/db.js';
import { readFileSync } from 'fs';

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
      const { error } = await supabase.rpc('exec_sql', { sql: statement + ';' });
      
      if (error) {
        console.error('Error executing statement:', error);
        if (!error.message.includes('already exists')) {
          process.exit(1);
        }
      }
    }

    console.log('Schema successfully pushed to Supabase!');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

pushSchema(); 