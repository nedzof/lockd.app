import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import postsRouter from './api/posts.js';
import lockLikesRouter from './api/lockLikes.js';
import tagsRouter from './api/tags.js';
import statsRouter from './api/stats.js';
import votesRouter from './api/votes.js';

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

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something broke!' });
});

// Start the Express server
app.listen(port, () => {
  console.log(`API server is running on port ${port}`);
}); 