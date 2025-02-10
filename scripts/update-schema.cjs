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

async function updateUserPreferences() {
  try {
    console.log('Starting user_preferences table update...\n')

    // Add new columns to user_preferences
    const { error: updateError } = await supabase
      .rpc('exec_sql', {
        sql: `
          -- First, check if the columns already exist
          DO $$
          BEGIN
            -- Add notification settings columns if they don't exist
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_preferences' AND column_name = 'notification_settings') THEN
              ALTER TABLE user_preferences
              ADD COLUMN notification_settings JSONB DEFAULT jsonb_build_object(
                'email_notifications', true,
                'push_notifications', true,
                'notification_frequency', 'immediate',
                'notify_on_mentions', true,
                'notify_on_replies', true,
                'notify_on_likes', true,
                'notify_on_reposts', true,
                'notify_on_follows', true,
                'quiet_hours_start', '22:00',
                'quiet_hours_end', '08:00',
                'quiet_hours_enabled', false
              );
            END IF;

            -- Add content preference columns if they don't exist
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_preferences' AND column_name = 'content_preferences') THEN
              ALTER TABLE user_preferences
              ADD COLUMN content_preferences JSONB DEFAULT jsonb_build_object(
                'preferred_tags', ARRAY[]::text[],
                'excluded_tags', ARRAY[]::text[],
                'preferred_content_types', ARRAY['text', 'image', 'video', 'link']::text[],
                'language_preferences', ARRAY['en']::text[],
                'adult_content_enabled', false,
                'auto_play_videos', true,
                'default_feed_sort', 'recent',
                'default_feed_filter', 'all'
              );
            END IF;

            -- Add feed customization columns if they don't exist
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_preferences' AND column_name = 'feed_customization') THEN
              ALTER TABLE user_preferences
              ADD COLUMN feed_customization JSONB DEFAULT jsonb_build_object(
                'pinned_tags', ARRAY[]::text[],
                'muted_users', ARRAY[]::text[],
                'followed_users', ARRAY[]::text[],
                'saved_posts', ARRAY[]::text[],
                'display_density', 'comfortable',
                'theme_preference', 'system',
                'show_read_posts', true,
                'show_post_previews', true
              );
            END IF;
          END $$;

          -- Add any missing indexes
          CREATE INDEX IF NOT EXISTS idx_user_preferences_notification_settings ON user_preferences USING gin (notification_settings);
          CREATE INDEX IF NOT EXISTS idx_user_preferences_content_preferences ON user_preferences USING gin (content_preferences);
          CREATE INDEX IF NOT EXISTS idx_user_preferences_feed_customization ON user_preferences USING gin (feed_customization);
        `
      })

    if (updateError) {
      console.error('Error updating user_preferences table:', updateError)
    } else {
      console.log('✓ Updated user_preferences table structure')
    }

    // Verify the current table structure
    const { data: columnData, error: columnError } = await supabase
      .rpc('exec_sql', {
        sql: `
          SELECT column_name, data_type, column_default
          FROM information_schema.columns
          WHERE table_name = 'user_preferences'
          ORDER BY ordinal_position;
        `
      })

    if (columnError) {
      console.error('\nError checking table structure:', columnError)
    } else if (columnData) {
      console.log('\nCurrent user_preferences table structure:')
      console.log(columnData)
    }

    // Verify the indexes
    const { data: indexData, error: indexError } = await supabase
      .rpc('exec_sql', {
        sql: `
          SELECT indexname, indexdef
          FROM pg_indexes
          WHERE tablename = 'user_preferences'
          ORDER BY indexname;
        `
      })

    if (indexError) {
      console.error('\nError checking indexes:', indexError)
    } else if (indexData) {
      console.log('\nCurrent user_preferences indexes:')
      console.log(indexData)
    }

    console.log('\nTable update completed')
  } catch (error) {
    console.error('Error during update:', error)
  }
}

async function updateBitcoinerSchema() {
  try {
    console.log('Starting Bitcoiner table update...\n')

    // Update the schema
    const { error: updateError } = await supabase
      .rpc('exec_sql', {
        sql: `
          -- First, handle the Post table dependency
          DO $$
          BEGIN
            -- Drop the existing foreign key from Post to Bitcoiner
            ALTER TABLE "Post" DROP CONSTRAINT IF EXISTS Post_author_address_fkey;
            
            -- Temporarily allow NULL for author_address if needed
            ALTER TABLE "Post" ALTER COLUMN author_address DROP NOT NULL;
          END $$;

          -- Now update the Bitcoiner table
          DO $$
          BEGIN
            -- Drop existing primary key if any
            IF EXISTS (
              SELECT 1 FROM information_schema.table_constraints 
              WHERE table_name = 'Bitcoiner' 
              AND constraint_type = 'PRIMARY KEY'
            ) THEN
              ALTER TABLE "Bitcoiner" DROP CONSTRAINT IF EXISTS "Bitcoiner_pkey";
            END IF;

            -- Make address NOT NULL if it isn't already
            ALTER TABLE "Bitcoiner" ALTER COLUMN address SET NOT NULL;
            
            -- Add primary key constraint on address
            ALTER TABLE "Bitcoiner" ADD PRIMARY KEY (address);
          END $$;

          -- Recreate the Post foreign key with the new primary key
          DO $$
          BEGIN
            ALTER TABLE "Post"
            ADD CONSTRAINT Post_author_address_fkey
            FOREIGN KEY (author_address)
            REFERENCES "Bitcoiner"(address)
            ON DELETE CASCADE;

            -- Make author_address NOT NULL again if needed
            ALTER TABLE "Post" ALTER COLUMN author_address SET NOT NULL;
          END $$;

          -- Update user_preferences to reference Bitcoiner.address
          DO $$
          BEGIN
            -- Drop existing foreign key if it exists
            IF EXISTS (
              SELECT 1 FROM information_schema.table_constraints 
              WHERE table_name = 'user_preferences' 
              AND constraint_name = 'user_preferences_bitcoiner_handle_fkey'
            ) THEN
              ALTER TABLE user_preferences DROP CONSTRAINT user_preferences_bitcoiner_handle_fkey;
            END IF;

            -- Add bitcoiner_address column if it doesn't exist
            IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns 
              WHERE table_name = 'user_preferences' 
              AND column_name = 'bitcoiner_address'
            ) THEN
              ALTER TABLE user_preferences ADD COLUMN bitcoiner_address TEXT;
            END IF;

            -- Copy data from handle to address if needed
            UPDATE user_preferences up
            SET bitcoiner_address = b.address
            FROM "Bitcoiner" b
            WHERE up.bitcoiner_handle = b.handle
            AND up.bitcoiner_address IS NULL;

            -- Add foreign key constraint
            ALTER TABLE user_preferences
            ADD CONSTRAINT user_preferences_bitcoiner_address_fkey
            FOREIGN KEY (bitcoiner_address)
            REFERENCES "Bitcoiner"(address)
            ON DELETE CASCADE;

            -- Drop old handle column
            ALTER TABLE user_preferences DROP COLUMN IF EXISTS bitcoiner_handle;
          END $$;

          -- Finally, drop the handle column from Bitcoiner
          DO $$
          BEGIN
            -- Drop handle column and its index
            DROP INDEX IF EXISTS bitcoiner_handle_idx;
            ALTER TABLE "Bitcoiner" DROP COLUMN IF EXISTS handle;
          END $$;

          -- Add index on bitcoiner_address
          CREATE INDEX IF NOT EXISTS idx_user_preferences_bitcoiner_address 
          ON user_preferences(bitcoiner_address);
        `
      })

    if (updateError) {
      console.error('Error updating schema:', updateError)
    } else {
      console.log('✓ Updated Bitcoiner and user_preferences tables')
    }

    // Verify the current table structures
    const { data: bitcoinerData, error: bitcoinerError } = await supabase
      .from('Bitcoiner')
      .select('*')
      .limit(1)

    if (bitcoinerError) {
      console.error('\nError checking Bitcoiner table:', bitcoinerError)
    } else {
      console.log('\nBitcoiner table structure:')
      console.log(Object.keys(bitcoinerData[0] || {}))
    }

    const { data: prefsData, error: prefsError } = await supabase
      .from('user_preferences')
      .select('*')
      .limit(1)

    if (prefsError) {
      console.error('\nError checking user_preferences table:', prefsError)
    } else {
      console.log('\nuser_preferences table structure:')
      console.log(Object.keys(prefsData[0] || {}))
    }

    // Verify foreign key relationships
    const { data: fkData, error: fkError } = await supabase
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
          AND (tc.table_name = 'user_preferences' OR tc.table_name = 'Post');
        `
      })

    if (fkError) {
      console.error('\nError checking foreign key relationships:', fkError)
    } else if (fkData) {
      console.log('\nForeign key relationships:')
      console.log(fkData)
    }

    console.log('\nSchema update completed')
  } catch (error) {
    console.error('Error during update:', error)
  }
}

async function verifyFinalSchema() {
  try {
    console.log('Starting final schema verification...\n')

    // Verify table structures
    const { data: tableData, error: tableError } = await supabase
      .rpc('exec_sql', {
        sql: `
          SELECT 
            table_name,
            column_name,
            data_type,
            column_default,
            is_nullable
          FROM information_schema.columns
          WHERE table_schema = 'public'
          AND table_name IN ('Bitcoiner', 'user_preferences', 'Post', 'LockLike')
          ORDER BY table_name, ordinal_position;
        `
      })

    if (tableError) {
      console.error('Error checking table structures:', tableError)
    } else {
      console.log('Table structures:')
      const groupedByTable = tableData.reduce((acc, row) => {
        if (!acc[row.table_name]) acc[row.table_name] = []
        acc[row.table_name].push(row)
        return acc
      }, {})
      
      Object.entries(groupedByTable).forEach(([table, columns]) => {
        console.log(`\n${table}:`)
        columns.forEach(col => {
          console.log(`  ${col.column_name} (${col.data_type})${col.is_nullable === 'NO' ? ' NOT NULL' : ''}`)
        })
      })
    }

    // Verify foreign key relationships
    const { data: fkData, error: fkError } = await supabase
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
    } else {
      console.log('\nForeign key relationships:')
      fkData.forEach(fk => {
        console.log(`  ${fk.table_name}.${fk.column_name} -> ${fk.foreign_table_name}.${fk.foreign_column_name}`)
      })
    }

    // Verify indexes
    const { data: indexData, error: indexError } = await supabase
      .rpc('exec_sql', {
        sql: `
          SELECT 
            tablename as table_name,
            indexname as index_name,
            indexdef as index_definition
          FROM pg_indexes
          WHERE schemaname = 'public'
          AND tablename IN ('Bitcoiner', 'user_preferences', 'Post', 'LockLike')
          ORDER BY tablename, indexname;
        `
      })

    if (indexError) {
      console.error('\nError checking indexes:', indexError)
    } else {
      console.log('\nIndexes:')
      indexData.forEach(idx => {
        console.log(`  ${idx.table_name}: ${idx.index_name}`)
        console.log(`    ${idx.index_definition}`)
      })
    }

    // Verify views
    const { data: viewData, error: viewError } = await supabase
      .rpc('exec_sql', {
        sql: `
          SELECT 
            viewname,
            definition
          FROM pg_views
          WHERE schemaname = 'public'
          ORDER BY viewname;
        `
      })

    if (viewError) {
      console.error('\nError checking views:', viewError)
    } else {
      console.log('\nViews:')
      viewData.forEach(view => {
        console.log(`  ${view.viewname}:`)
        console.log(`    ${view.definition}`)
      })
    }

    console.log('\nSchema verification completed')
  } catch (error) {
    console.error('Error during verification:', error)
  }
}

cleanupSchema()
updateUserPreferences()
updateBitcoinerSchema()
verifyFinalSchema() 