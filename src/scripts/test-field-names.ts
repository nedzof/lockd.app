/**
 * Script to inspect Prisma model field names
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const prisma = new PrismaClient();

async function inspectSchema() {
  try {
    // Introspect the Prisma models
    const dmmf = (prisma as any)._baseDmmf;
    
    if (!dmmf) {
      console.error('Could not access Prisma DMMF');
      return;
    }
    
    console.log('Available models:');
    for (const model of dmmf.modelMap.keys()) {
      console.log(`- ${model}`);
    }
    
    console.log('\nPost model fields:');
    const postModel = dmmf.modelMap.get('post');
    
    if (postModel) {
      for (const field of postModel.fields) {
        console.log(`- ${field.name} (${field.type}, ${field.isRequired ? 'required' : 'optional'})`);
      }
    } else {
      console.log('Post model not found');
    }
    
    // Also check directly from the schema file
    console.log('\nReading schema from file:');
    const schemaContent = fs.readFileSync('prisma/schema.prisma', 'utf8');
    const postModelMatch = schemaContent.match(/model post \{[^}]+\}/s);
    
    if (postModelMatch) {
      const postModelDefinition = postModelMatch[0];
      console.log(postModelDefinition);
    } else {
      console.log('Post model definition not found in schema file');
    }
    
  } catch (error) {
    console.error('Error inspecting schema:', error);
  } finally {
    await prisma.$disconnect();
  }
}

inspectSchema().catch(console.error); 