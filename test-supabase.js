require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

console.log('URL:', supabaseUrl);
console.log('Key length:', supabaseKey?.length);

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
  try {
    const { data, error } = await supabase
      .from('bitcoiners')
      .select('*')
      .limit(1);
    
    if (error) throw error;
    console.log('Connection successful:', data);
  } catch (e) {
    console.error('Error:', e);
  }
}

testConnection(); 