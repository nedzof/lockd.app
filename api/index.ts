import { VercelRequest, VercelResponse } from '@vercel/node';
import app from '../src/server';

// This file is used by Vercel to handle API requests
export default function handler(req: VercelRequest, res: VercelResponse) {
  // Forward the request to our Express app
  return app(req, res);
} 