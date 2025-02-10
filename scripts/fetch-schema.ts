import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fetchSchema() {
  try {
    // Fetch table information
    const { data: tables, error: tablesError } = await supabase
      .from('information_schema.tables')
      .select('*')
      .eq('table_schema', 'public')
      .neq('table_type', 'VIEW');

    if (tablesError) {
      throw tablesError;
    }

    console.log('Tables found:', tables);

    // Fetch column information for each table
    const tableDetails = await Promise.all(
      tables.map(async (table) => {
        const { data: columns, error: columnsError } = await supabase
          .from('information_schema.columns')
          .select('*')
          .eq('table_schema', 'public')
          .eq('table_name', table.table_name);

        if (columnsError) {
          throw columnsError;
        }

        return {
          table_name: table.table_name,
          columns
        };
      })
    );

    // Fetch constraint information
    const { data: constraints, error: constraintsError } = await supabase
      .from('information_schema.table_constraints')
      .select('*')
      .eq('table_schema', 'public')
      .in('constraint_type', ['PRIMARY KEY', 'FOREIGN KEY', 'UNIQUE']);

    if (constraintsError) {
      throw constraintsError;
    }

    // Write schema information to a file
    const schemaInfo = {
      tables: tableDetails,
      constraints,
      timestamp: new Date().toISOString()
    };

    fs.writeFileSync(
      path.join(process.cwd(), 'current-schema.json'),
      JSON.stringify(schemaInfo, null, 2)
    );

    console.log('Schema information written to current-schema.json');
  } catch (error) {
    console.error('Error fetching schema:', error);
  }
}

fetchSchema(); 