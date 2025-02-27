import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import postsRouter from './api/posts';
import lockLikesRouter from './api/lockLikes';
import tagsRouter from './api/tags';
import statsRouter from './api/stats';
import votesRouter from './api/votes';
import voteOptionsRouter from './api/vote-options';
import bsvPriceRouter from './api/bsv-price';
import tagGenerationRouter from './routes/tagGenerationRoutes';
import postTaggingRouter from './routes/postTaggingRoutes';
import { logger } from './utils/logger';
import { initializeTagGenerationJob } from './jobs/tagGenerationJob';
import { initializeStatsUpdateJob } from './jobs/statsUpdateJob';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3003;

// Configure CORS
const corsOptions = {
  origin: ['http://localhost:5173', 'http://localhost:3000'], 
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' })); 

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  
  // Log request
  logger.info(`${req.method} ${req.path}`, {
    method: req.method,
    path: req.path,
    query: req.query,
    body: req.method === 'POST' || req.method === 'PUT' ? req.body : undefined
  });

  // Log response
  const oldJson = res.json;
  res.json = function(body) {
    const duration = Date.now() - start;
    logger.info(`Response sent`, {
      duration,
      path: req.path,
      method: req.method,
      status: res.statusCode
    });
    return oldJson.call(this, body);
  };

  next();
});

// API Routes
app.use('/api/posts', postsRouter);
app.use('/api/lock-likes', lockLikesRouter);
app.use('/api/tags', tagsRouter);
app.use('/api/stats', statsRouter);
app.use('/api/votes', votesRouter);
app.use('/api/vote-options', voteOptionsRouter);
app.use('/api/bsv-price', bsvPriceRouter);
app.use('/api', tagGenerationRouter);
app.use('/api', postTaggingRouter);

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });
  
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  
  // Initialize the tag generation job
  initializeTagGenerationJob();
  logger.info('Tag generation job initialized');
  
  // Initialize the stats update job
  initializeStatsUpdateJob();
  logger.info('Stats update job initialized');
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully...');
  process.exit(0);
});