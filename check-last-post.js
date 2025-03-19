import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkLastPost() {
  try {
    // Find last created post
    const post = await prisma.post.findFirst({
      orderBy: {
        created_at: 'desc'
      }
    });
    
    if (!post) {
      console.log('No posts found in database');
      return;
    }
    
    console.log('Latest post details:');
    console.log('ID:', post.id);
    console.log('Content:', post.content);
    console.log('Created at:', new Date(post.created_at).toString());
    console.log('Scheduled at:', post.scheduled_at ? new Date(post.scheduled_at).toString() : 'None');
    console.log('tx_id:', post.tx_id);
    console.log('scheduled_at type:', post.scheduled_at ? typeof post.scheduled_at : 'null');
    console.log('scheduled_at value:', post.scheduled_at);
    console.log('Metadata:', post.metadata);

    // Format the full SQL query for debugging
    console.log('\nRunning direct SQL query...');
    const formattedPost = await prisma.$queryRaw`
      SELECT 
        id, 
        content, 
        tx_id, 
        created_at, 
        scheduled_at,
        metadata,
        pg_typeof(scheduled_at) as scheduled_at_type
      FROM public.post 
      WHERE id = ${post.id}
    `;
    
    console.log('SQL Query Results:', formattedPost);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkLastPost()
  .then(() => console.log('Check completed'))
  .catch(console.error); 