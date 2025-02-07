const fs = require('fs');
const https = require('https');

const SUPABASE_URL = 'armwtaxnwajmunysmbjr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFybXd0YXhud2FqbXVueXNtYmpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg5MjI1MDQsImV4cCI6MjA1NDQ5ODUwNH0.RN5aElUBDafoPqdHI6xTL4EycZ72wxuOyFzWHJ0Un2g';

async function executeSql(sql) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: SUPABASE_URL,
      path: '/rest/v1/rpc/execute_sql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer': 'return=minimal'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          reject(new Error(`HTTP Error: ${res.statusCode} - ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(JSON.stringify({ query: sql }));
    req.end();
  });
}

async function pushSchema() {
  try {
    console.log('Reading schema file...');
    const schema = fs.readFileSync('schema.sql', 'utf8');

    // Split the schema into individual statements
    const statements = schema
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    console.log('Executing schema statements...');
    for (const statement of statements) {
      console.log('Executing:', statement);
      try {
        await executeSql(statement);
        console.log('Statement executed successfully');
      } catch (error) {
        if (error.message.includes('already exists')) {
          console.log('Object already exists, continuing...');
        } else {
          console.error('Error executing statement:', error);
          throw error;
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