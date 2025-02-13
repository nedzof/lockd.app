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

// Middleware
app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
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

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error occurred:', err);
  res.status(500).json({
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start the server
async function startServer() {
  try {
    const port = await findAvailablePort(DEFAULT_PORT);
    app.listen(port, () => {
      console.log(`API server is running on port ${port}`);
      console.log(`Health check available at http://localhost:${port}/api/health`);
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