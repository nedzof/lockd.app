import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import postsRouter from './api/posts';
import lockLikesRouter from './api/lock-likes';
import tagsRouter from './api/tags';
import statsRouter from './api/stats';
import votesRouter from './api/votes';
import vote_optionsRouter from './api/vote-options';
import bsvPriceRouter from './api/bsv-price';
import tagGenerationRouter from './routes/tagGenerationRoutes';
import postTaggingRouter from './routes/postTaggingRoutes';
import notificationRouter from './routes/notificationRoutes';
import { logger } from './utils/logger';
import { initializeTagGenerationJob } from './jobs/tagGenerationJob';
import { initializeStatsUpdateJob } from './jobs/statsUpdateJob';
import { initializeThresholdNotificationJob } from './jobs/thresholdNotificationJob';
import { processScheduledPosts } from './jobs/scheduled-posts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize scheduled posts job
function initializeScheduledPostsJob() {
  // Run the job every minute to check for posts that need to be published
  const INTERVAL = 60 * 1000; // 1 minute in milliseconds
  
  // Run the job immediately on startup
  processScheduledPosts()
    .then(result => {
      logger.info('Initial scheduled posts job completed:', result);
    })
    .catch(error => {
      logger.error('Error running initial scheduled posts job:', error);
    });
  
  // Set up interval to run the job periodically
  setInterval(() => {
    processScheduledPosts()
      .then(result => {
        if (result.processed > 0) {
          logger.info('Scheduled posts job completed:', result);
        }
      })
      .catch(error => {
        logger.error('Error running scheduled posts job:', error);
      });
  }, INTERVAL);
  
  logger.info(`Scheduled posts job initialized (running every ${INTERVAL / 1000} seconds)`);
}

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3003;

// Configure CORS
const corsOptions = {
  origin: ['http://localhost:5173', 'http://localhost:3000', 'https://lockd-app.vercel.app'], 
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
app.use('/api/vote-options', vote_optionsRouter);
app.use('/api/bsv-price', bsvPriceRouter);
app.use('/api', tagGenerationRouter);
app.use('/api', postTaggingRouter);
app.use('/api/notifications', notificationRouter);

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

// Start the server
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
    
    // Initialize the tag generation job
    initializeTagGenerationJob();
    logger.info('Tag generation job initialized');
    
    // Initialize the stats update job
    initializeStatsUpdateJob();
    logger.info('Stats update job initialized');
    
    // Initialize the threshold notification job
    initializeThresholdNotificationJob();
    
    // Initialize the scheduled posts job
    initializeScheduledPostsJob();
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
} else {
  // In production (Vercel), initialize jobs if needed
  // Note: Long-running jobs may not work well in serverless environments
  logger.info('Running in production mode (serverless)');
  
  // For serverless environments, we can trigger the scheduled posts job
  // on each request to check for posts that need to be published
  app.use((req, res, next) => {
    // Only run the job occasionally to avoid excessive processing
    if (Math.random() < 0.05) { // 5% chance to run on each request
      processScheduledPosts()
        .then(result => {
          if (result.processed > 0) {
            logger.info('Serverless scheduled posts job completed:', result);
          }
        })
        .catch(error => {
          logger.error('Error running serverless scheduled posts job:', error);
        });
    }
    next();
  });
}

// Export the Express app for Vercel
export default app;