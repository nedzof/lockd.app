import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { logger } from '../utils/logger';

// Load environment variables
dotenv.config();

async function testConnection() {
  console.log('Testing database connection...');
  console.log(`DATABASE_URL: ${process.env.DATABASE_URL?.replace(/:[^:@]*@/, ':****@')}`);
  console.log(`DIRECT_URL: ${process.env.DIRECT_URL?.replace(/:[^:@]*@/, ':****@')}`);
  
  // Try with DATABASE_URL
  try {
    console.log('\nTesting connection with DATABASE_URL...');
    const prismaWithPooling = new PrismaClient({
      datasourceUrl: process.env.DATABASE_URL,
      log: ['error', 'warn', 'info'],
      errorFormat: 'pretty',
    });
    
    // Test connection
    const result = await prismaWithPooling.$queryRaw`SELECT 1 as test`;
    console.log('Connection successful with DATABASE_URL!', result);
    await prismaWithPooling.$disconnect();
  } catch (error) {
    console.error('Failed to connect with DATABASE_URL:', error);
  }
  
  // Try with DIRECT_URL
  try {
    console.log('\nTesting connection with DIRECT_URL...');
    const prismaDirect = new PrismaClient({
      datasourceUrl: process.env.DIRECT_URL,
      log: ['error', 'warn', 'info'],
      errorFormat: 'pretty',
    });
    
    // Test connection
    const result = await prismaDirect.$queryRaw`SELECT 1 as test`;
    console.log('Connection successful with DIRECT_URL!', result);
    await prismaDirect.$disconnect();
  } catch (error) {
    console.error('Failed to connect with DIRECT_URL:', error);
  }
  
  // Try with direct connection using pg
  try {
    console.log('\nTesting connection with pg client...');
    const { Pool } = await import('pg');
    
    // Create connection pool
    const pool = new Pool({
      connectionString: process.env.DIRECT_URL,
      ssl: {
        rejectUnauthorized: false
      }
    });
    
    // Test connection
    const client = await pool.connect();
    const result = await client.query('SELECT 1 as test');
    console.log('Connection successful with pg client!', result.rows);
    client.release();
    await pool.end();
  } catch (error) {
    console.error('Failed to connect with pg client:', error);
  }
}

testConnection()
  .then(() => {
    console.log('Test completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Test failed:', error);
    process.exit(1);
  });
