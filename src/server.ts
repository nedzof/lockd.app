import express from 'express';
import cors from 'cors';
import postsRouter from './api/posts';
import lockLikesRouter from './api/lockLikes';

const app = express();
const port = process.env.PORT || 3002;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/posts', postsRouter);
app.use('/api/lockLikes', lockLikesRouter);

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something broke!' });
});

// Start server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
}); 