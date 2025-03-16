import { PrismaClient } from '@prisma/client';

async function checkPrisma() {
  try {
    const prisma = new PrismaClient();
    
    // Log all available models
    console.log('Available Prisma models:');
    console.log(Object.keys(prisma));
    
    // Try to access the processed_transaction model
    try {
      console.log('Checking processed_transaction model:');
      console.log(prisma.processed_transaction ? 'Available' : 'Not available');
    } catch (error) {
      console.error('Error accessing processed_transaction:', error);
    }
    
    // Try to access with camelCase
    try {
      console.log('Checking processedTransaction model:');
      console.log((prisma as any).processedTransaction ? 'Available' : 'Not available');
    } catch (error) {
      console.error('Error accessing processedTransaction:', error);
    }
    
    await prisma.$disconnect();
  } catch (error) {
    console.error('Error initializing Prisma:', error);
  }
}

checkPrisma();
