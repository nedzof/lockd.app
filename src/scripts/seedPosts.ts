import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory path of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from the root .env file
dotenv.config({ path: path.join(__dirname, '../../../.env') });

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
});

const sampleTags = ['Politics', 'Crypto', 'Sports', 'Pop Culture', 'Business', 'Tech', 'Current Events', 'Finance', 'Health', 'Memes'];
const sampleContents = [
  'What will flip BTC first?',
  'Best crypto project in 2024?',
  'Most undervalued token right now?',
  'Next big tech trend?',
  'Future of AI in 2024',
  'Market predictions for Q2',
  'Best investment strategy?',
  'Upcoming blockchain innovations',
  'DeFi vs CeFi debate',
  'Web3 adoption timeline'
];

async function generateRandomPost() {
  const randomTags = Array.from({ length: Math.floor(Math.random() * 3) + 1 }, () => 
    sampleTags[Math.floor(Math.random() * sampleTags.length)]
  );

  const now = new Date();
  const randomDaysAgo = Math.floor(Math.random() * 30);
  const randomDate = new Date(now.setDate(now.getDate() - randomDaysAgo));

  return {
    id: `post_${Math.random().toString(36).substring(2, 15)}`,
    txid: `tx_${Math.random().toString(36).substring(2, 15)}`,
    content: sampleContents[Math.floor(Math.random() * sampleContents.length)],
    author_address: `1${Math.random().toString(36).substring(2, 15)}`,
    block_height: 800000 + Math.floor(Math.random() * 1000),
    created_at: randomDate,
    tags: randomTags,
    is_locked: Math.random() > 0.5,
    lock_duration: Math.floor(Math.random() * 100) + 1,
    amount: Math.floor(Math.random() * 1000000),
    metadata: {
      app: 'lockd.app',
      type: 'vote',
      version: '1.0.0'
    }
  };
}

async function seedDatabase() {
  try {
    console.log('Starting to seed database...');
    console.log('Using database URL:', process.env.DATABASE_URL);
    
    // Test database connection
    await prisma.$connect();
    console.log('Successfully connected to database');
    
    // Generate and insert 20 random posts
    const posts = await Promise.all(
      Array.from({ length: 20 }, async () => {
        const postData = await generateRandomPost();
        return prisma.post.create({
          data: postData
        });
      })
    );

    console.log(`Successfully created ${posts.length} posts`);
  } catch (error) {
    console.error('Error seeding database:', error);
  } finally {
    await prisma.$disconnect();
  }
}

seedDatabase(); 