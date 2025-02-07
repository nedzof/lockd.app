import { supabase } from '../src/db';
import fs from 'fs';
import path from 'path';

async function pushSchema() {
  try {
    console.log('Reading schema file...');
    const schemaPath = path.join(__dirname, '..', 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    console.log('Executing schema...');
    const { error } = await supabase.from('_sql').rpc('exec', { query: schema });
    
    if (error) {
      console.error('Error executing schema:', error);
      process.exit(1);
    }

    console.log('Schema successfully pushed to Supabase!');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

pushSchema(); 