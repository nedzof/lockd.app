import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

async function runCommand(command: string, description: string): Promise<string> {
  console.log(`${colors.blue}Running:${colors.reset} ${description}`);
  try {
    const { stdout, stderr } = await execAsync(command);
    if (stderr) {
      console.warn(`${colors.yellow}Warning:${colors.reset} ${stderr}`);
    }
    return stdout.trim();
  } catch (error: any) {
    console.error(`${colors.red}Error:${colors.reset} ${error.message}`);
    throw error;
  }
}

async function syncPrismaSchema() {
  console.log(`${colors.cyan}=== Prisma Schema Sync Tool ===${colors.reset}`);
  console.log(`${colors.cyan}Ensuring Prisma schema is synchronized with Supabase database${colors.reset}`);
  
  try {
    // Step 1: Generate Prisma client
    console.log(`\n${colors.cyan}Step 1: Generating Prisma client${colors.reset}`);
    await runCommand('npx prisma generate', 'Generating Prisma client from schema');
    console.log(`${colors.green}✓ Prisma client generated successfully${colors.reset}`);
    
    // Step 2: Check if schema needs to be pushed to database
    console.log(`\n${colors.cyan}Step 2: Checking if schema needs to be pushed to database${colors.reset}`);
    try {
      const diffOutput = await runCommand('npx prisma db pull --print', 'Checking for schema differences');
      
      if (diffOutput.includes('The schema is up to date')) {
        console.log(`${colors.green}✓ Schema is already in sync with the database${colors.reset}`);
      } else {
        console.log(`${colors.yellow}! Schema differences detected${colors.reset}`);
        
        // Ask for confirmation before pushing schema
        console.log(`\n${colors.yellow}Would you like to push the schema to the database? (y/n)${colors.reset}`);
        console.log(`${colors.yellow}This will update the database schema to match your Prisma schema.${colors.reset}`);
        console.log(`${colors.yellow}Type 'y' and press Enter to continue, or 'n' to abort.${colors.reset}`);
        
        // Note: In a script, we'd typically wait for user input here
        // For now, we'll just show the command to run manually
        console.log(`\n${colors.blue}To push schema changes, run:${colors.reset}`);
        console.log(`npx prisma db push`);
      }
    } catch (error) {
      console.log(`${colors.yellow}! Unable to check schema differences${colors.reset}`);
      console.log(`${colors.yellow}! This may happen if the database is not accessible${colors.reset}`);
    }
    
    // Step 3: Validate schema
    console.log(`\n${colors.cyan}Step 3: Validating Prisma schema${colors.reset}`);
    await runCommand('npx prisma validate', 'Validating Prisma schema');
    console.log(`${colors.green}✓ Prisma schema is valid${colors.reset}`);
    
    // Step 4: Check database connection
    console.log(`\n${colors.cyan}Step 4: Testing database connection${colors.reset}`);
    try {
      await runCommand('npx tsx src/check-prisma.ts', 'Testing database connection with Prisma');
      console.log(`${colors.green}✓ Database connection successful${colors.reset}`);
    } catch (error) {
      console.log(`${colors.yellow}! Database connection test failed${colors.reset}`);
      console.log(`${colors.yellow}! Check your DATABASE_URL and DIRECT_URL in .env file${colors.reset}`);
    }
    
    console.log(`\n${colors.green}=== Prisma Schema Sync Complete ===${colors.reset}`);
    console.log(`${colors.green}Your Prisma schema has been validated and the client has been generated.${colors.reset}`);
    console.log(`${colors.green}If you need to push schema changes to the database, run: npx prisma db push${colors.reset}`);
    
  } catch (error: any) {
    console.error(`\n${colors.red}=== Prisma Schema Sync Failed ===${colors.reset}`);
    console.error(`${colors.red}Error: ${error.message}${colors.reset}`);
    process.exit(1);
  }
}

// Run the sync function
syncPrismaSchema();
