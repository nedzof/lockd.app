const { createClient } = require('@supabase/supabase-js')
const dotenv = require('dotenv')
const path = require('path')

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase credentials')
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  db: { schema: 'public' }
})

async function cleanupSchema() {
  try {
    console.log('Starting schema cleanup...\n')

    // Drop the posts table
    const { error: dropError } = await supabase
      .rpc('exec_sql', {
        sql: 'DROP TABLE IF EXISTS posts CASCADE;'
      })

    if (dropError) {
      console.error('Error dropping posts table:', dropError)
    } else {
      console.log('✓ Dropped posts table')
    }

    // Verify remaining tables
    const tables = ['Bitcoiner', 'user_preferences', 'LockLike', 'Post']
    for (const table of tables) {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .limit(1)

      if (error) {
        console.error(`Error checking ${table} table:`, error)
      } else {
        console.log(`✓ Table '${table}' exists`)
        if (data && data.length > 0) {
          console.log(`  Columns: ${Object.keys(data[0]).join(', ')}`)
        }
      }
    }

    // Check all foreign key relationships
    const { data: allFkData, error: fkError } = await supabase
      .rpc('exec_sql', {
        sql: `
          SELECT 
            tc.table_name as table_name,
            kcu.column_name as column_name,
            ccu.table_name AS foreign_table_name,
            ccu.column_name AS foreign_column_name
          FROM information_schema.table_constraints AS tc
          JOIN information_schema.key_column_usage AS kcu
            ON tc.constraint_name = kcu.constraint_name
          JOIN information_schema.constraint_column_usage AS ccu
            ON ccu.constraint_name = tc.constraint_name
          WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = 'public'
          ORDER BY tc.table_name;
        `
      })

    if (fkError) {
      console.error('\nError checking foreign key relationships:', fkError)
    } else if (allFkData) {
      console.log('\nAll foreign key relationships:')
      console.log(allFkData)
    }

    // Check indexes
    const { data: indexData, error: indexError } = await supabase
      .rpc('exec_sql', {
        sql: `
          SELECT 
            tablename as table_name,
            indexname as index_name,
            indexdef as index_definition
          FROM pg_indexes
          WHERE schemaname = 'public'
          ORDER BY tablename, indexname;
        `
      })

    if (indexError) {
      console.error('\nError checking indexes:', indexError)
    } else if (indexData) {
      console.log('\nAll indexes:')
      console.log(indexData)
    }

    console.log('\nSchema cleanup completed')
  } catch (error) {
    console.error('Error during cleanup:', error)
  }
}

cleanupSchema() 