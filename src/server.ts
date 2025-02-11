import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import postsRouter from './api/posts.js';
import lockLikesRouter from './api/lockLikes.js';
import tagsRouter from './api/tags.js';
import statsRouter from './api/stats.js';
import votesRouter from './api/votes.js';
import { startVoteSubscription } from './services/scanner/votes/voteSubscription.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = 3001; // Fixed port for API server

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/posts', postsRouter);
app.use('/api/lockLikes', lockLikesRouter);
app.use('/api/tags', tagsRouter);
app.use('/api/stats', statsRouter);
app.use('/api/votes', votesRouter);

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something broke!' });
});

async function startServer() {
    try {
        // Start vote subscription
        console.log('Starting vote subscription...');
        await startVoteSubscription();
        console.log('Vote subscription started successfully');
        
        // Start the Express server
        app.listen(port, () => {
            console.log(`API server is running on port ${port}`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Start server
startServer(); 