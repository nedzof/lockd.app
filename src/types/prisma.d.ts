import { PrismaClient } from '@prisma/client';

// Extend the PrismaClient type to include our custom models
declare global {
  namespace PrismaClient {
    export interface PrismaClient {
      push_subscription: {
        findMany: (args?: any) => Promise<any[]>;
        findUnique: (args: any) => Promise<any | null>;
        create: (args: any) => Promise<any>;
        update: (args: any) => Promise<any>;
        upsert: (args: any) => Promise<any>;
        delete: (args: any) => Promise<any>;
        deleteMany: (args: any) => Promise<any>;
        updateMany: (args: any) => Promise<any>;
        groupBy: (args: any) => Promise<any[]>;
        count: (args?: any) => Promise<number>;
      };
    }
  }
}

export {}; 