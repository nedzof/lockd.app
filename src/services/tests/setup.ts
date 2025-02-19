import { config } from 'dotenv'
import { join } from 'path'
import { PrismaClient } from '@prisma/client'

// Load test environment variables
config({
    path: join(process.cwd(), '.env.test')
})

const prisma = new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL + "?pgbouncer=true&connection_limit=1"
})

beforeEach(async () => {
    // Reset database state before each test
    await prisma.$transaction([
        prisma.lockLike.deleteMany(),
        prisma.voteOption.deleteMany(),
        prisma.voteQuestion.deleteMany(),
        prisma.post.deleteMany(),
    ])
})

afterAll(async () => {
    await prisma.$disconnect()
})

export { prisma }