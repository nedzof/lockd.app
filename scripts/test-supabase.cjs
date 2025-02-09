const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
console.log('Loading environment variables from:', envPath);
dotenv.config({ path: envPath });

async function testSupabase() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

  console.log('Available credentials:', {
    url: supabaseUrl,
    serviceKeyPresent: !!serviceKey,
    serviceKeyLength: serviceKey?.length,
    anonKeyPresent: !!anonKey,
    anonKeyLength: anonKey?.length
  });

  // Try with service key
  console.log('\nTesting with service key:');
  const serviceClient = createClient(supabaseUrl, serviceKey);
  try {
    const { data: serviceData, error: serviceError } = await serviceClient
      .from('Post')
      .select('count');
    
    if (serviceError) {
      console.error('Error with service key:', serviceError);
    } else {
      console.log('Service key connection successful:', serviceData);
    }
  } catch (error) {
    console.error('Exception with service key:', error);
  }

  // Try with anon key
  console.log('\nTesting with anon key:');
  const anonClient = createClient(supabaseUrl, anonKey);
  try {
    const { data: anonData, error: anonError } = await anonClient
      .from('Post')
      .select('count');
    
    if (anonError) {
      console.error('Error with anon key:', anonError);
    } else {
      console.log('Anon key connection successful:', anonData);
    }
  } catch (error) {
    console.error('Exception with anon key:', error);
  }
}

testSupabase(); 