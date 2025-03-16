import { VercelRequest, VercelResponse } from '@vercel/node';

// Simple health check endpoint
export default function handler(req: VercelRequest, res: VercelResponse) {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
} 