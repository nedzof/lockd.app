import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import postsRouter from './api/posts.js';
import lockLikesRouter from './api/lockLikes.js';
import tagsRouter from './api/tags.js';
import statsRouter from './api/stats.js';
import votesRouter from './api/votes.js';
import * as net from 'net';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const DEFAULT_PORT = 3001;

// Function to find an available port
async function findAvailablePort(startPort: number): Promise<number> {
  const isPortAvailable = (port: number): Promise<boolean> => {
    return new Promise((resolve) => {
      const server = net.createServer()
        .once('error', () => resolve(false))
        .once('listening', () => {
          server.close();
          resolve(true);
        })
        .listen(port);
    });
  };

  let port = startPort;
  while (!(await isPortAvailable(port))) {
    console.log(`Port ${port} is in use, trying next port...`);
    port++;
  }
  return port;
}

// Configure CORS
const corsOptions = {
  origin: ['http://localhost:5173', 'http://localhost:3000'], // Add your frontend URLs
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' })); // Increase limit for larger payloads

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  
  // Log request
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  if (req.method === 'POST' || req.method === 'PUT') {
    console.log('Request body:', JSON.stringify(req.body, null, 2));
  }
  if (Object.keys(req.query).length > 0) {
    console.log('Query params:', req.query);
  }

  // Log response
  const oldJson = res.json;
  res.json = function(body) {
    const duration = Date.now() - start;
    console.log(`Response (${duration}ms):`, JSON.stringify(body, null, 2));
    return oldJson.call(this, body);
  };

  next();
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error occurred:', err);
  res.status(500).json({
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Routes
app.use('/api/posts', postsRouter);
app.use('/api/lockLikes', lockLikesRouter);
app.use('/api/tags', tagsRouter);
app.use('/api/stats', statsRouter);
app.use('/api/votes', votesRouter);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start the server
async function startServer() {
  try {
    const port = await findAvailablePort(DEFAULT_PORT);
    
    // Log the port that will be used
    console.log(`Starting server on port ${port}...`);
    
    app.listen(port, () => {
      console.log(`
🚀 Server is running!
📝 API Documentation:
   - Health check: http://localhost:${port}/api/health
   - Posts API: http://localhost:${port}/api/posts
   - Tags API: http://localhost:${port}/api/tags
   - Stats API: http://localhost:${port}/api/stats
   - Votes API: http://localhost:${port}/api/votes
      `);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully...');
  process.exit(0);
});

startServer(); 