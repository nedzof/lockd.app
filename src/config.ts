// Configuration file for the application

// API URL - use environment variable or fallback to production URL
export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://lockd-public-demo.vercel.app';

// Other configuration options can be added here
export const DEFAULT_LIMIT = 10;
export const DEFAULT_RANKING_FILTER = 'top-1';
export const DEFAULT_USER_ID = 'anon'; 