// This file is kept for type definitions only
import { Database } from './database.types';

export type Tables = Database['public']['Tables'];
export type Post = Tables['Post']['Row'];
export type LockLike = Tables['LockLike']['Row'];
export type Bitcoiner = Tables['Bitcoiner']['Row'];
