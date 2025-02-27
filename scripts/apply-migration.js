import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';

async function applyMigration() {
  // Create a new Prisma client
  const prisma = new PrismaClient();

  try {
    // Connect to the database
    await prisma.$connect();

    // Execute the raw SQL to add the block_height column
    console.log('Adding block_height column to Post table...');
    await prisma.$executeRaw`ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "block_height" INTEGER;`;
    
    // Create an index on the block_height column
    console.log('Creating index on block_height column...');
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "Post_block_height_idx" ON "Post"("block_height");`;

    // Execute the raw SQL to add the metadata column
    console.log('Adding metadata column to Post table...');
    await prisma.$executeRaw`ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "metadata" JSONB;`;

    console.log('Migration completed successfully!');

    // Generate the Prisma client to reflect the schema changes
    console.log('Generating Prisma client...');
    execSync('npx prisma generate', { stdio: 'inherit' });

    console.log('All done! You can now use the block_height and metadata fields in your code.');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    // Disconnect from the database
    await prisma.$disconnect();
  }
}

applyMigration();
