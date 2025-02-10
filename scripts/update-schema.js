import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Load environment variables from .env.local
dotenv.config({ path: resolve(__dirname, '../.env.local') });
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase credentials');
}
const supabase = createClient(supabaseUrl, supabaseKey, {
    db: { schema: 'public' }
});
async function updateSchema() {
    try {
        // 1. Rename creators table to Bitcoiner using raw SQL
        const { error: renameError } = await supabase
            .from('creators')
            .select('*')
            .then(async () => {
            return await supabase.rpc('exec_sql', {
                sql: 'ALTER TABLE creators RENAME TO "Bitcoiner";'
            });
        });
        if (renameError) {
            console.error('Error renaming table:', renameError);
            return;
        }
        // 2. Create user_preferences table and link to Bitcoiner
        const { error: createPrefsError } = await supabase.rpc('exec_sql', {
            sql: `
        CREATE TABLE IF NOT EXISTS user_preferences (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          bitcoiner_id UUID REFERENCES "Bitcoiner"(id) ON DELETE CASCADE,
          preferences JSONB DEFAULT '{}',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
      `
        });
        if (createPrefsError) {
            console.error('Error creating user_preferences:', createPrefsError);
            return;
        }
        // 3. Handle Post/Posts table consolidation
        const { error: postError } = await supabase.rpc('exec_sql', {
            sql: `
        DO $$ 
        BEGIN
          IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'Post') AND 
             EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'Posts') THEN
            -- Migrate data from Posts to Post if needed
            INSERT INTO "Post" 
            SELECT * FROM "Posts" 
            ON CONFLICT DO NOTHING;
            
            -- Drop the Posts table
            DROP TABLE "Posts";
          END IF;
        END $$;
      `
        });
        if (postError) {
            console.error('Error handling Post tables:', postError);
            return;
        }
        // 4. Handle locklikes/LockLike consolidation
        const { error: likesError } = await supabase.rpc('exec_sql', {
            sql: `
        DO $$ 
        BEGIN
          IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'locklikes') AND 
             EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'LockLike') THEN
            -- Migrate data from locklikes to LockLike if needed
            INSERT INTO "LockLike" 
            SELECT * FROM locklikes 
            ON CONFLICT DO NOTHING;
            
            -- Drop the locklikes table
            DROP TABLE locklikes;
          END IF;
        END $$;
      `
        });
        if (likesError) {
            console.error('Error handling like tables:', likesError);
            return;
        }
        console.log('Schema updates completed successfully');
    }
    catch (error) {
        console.error('Error updating schema:', error);
    }
}
updateSchema();
