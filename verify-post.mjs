import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyPost() {
  const { data, error } = await supabase
    .from('Post')
    .select('*')
    .eq('id', 'aba0284aae55c76270f4b2f80aac694f7afdcf4b5ef1148c8147cba6321fc187')
    .single();

  if (error) {
    console.error('Error fetching post:', error);
    process.exit(1);
  }

  console.log('Post data:', data);

  const { data: bitcoiner, error: bitcoinerError } = await supabase
    .from('Bitcoiner')
    .select('*')
    .eq('address', data.author_address)
    .single();

  if (bitcoinerError) {
    console.error('Error fetching bitcoiner:', bitcoinerError);
    process.exit(1);
  }

  console.log('Bitcoiner data:', bitcoiner);
}

verifyPost().catch(console.error); 