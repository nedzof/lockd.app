const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://armwtaxnwajmunysmbjr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFybXd0YXhud2FqbXVueXNtYmpyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczODkyMjUwNCwiZXhwIjoyMDU0NDk4NTA0fQ.KPNFwEEq1IbonZrwBHr9cAdLaB5PULlw6jXSGAO-eq8';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
  try {
    console.log('Testing Supabase connection...');
    console.log('URL:', supabaseUrl);
    console.log('Key length:', supabaseKey.length);
    
    const { data, error } = await supabase
      .from('Post')
      .select('*')
      .limit(1);
    
    if (error) {
      console.error('Connection error:', error);
      return;
    }
    
    console.log('Connection successful!');
    console.log('Data:', data);
  } catch (e) {
    console.error('Error:', e);
  }
}

testConnection(); 