import { prisma } from '../src/dbClient';

beforeEach(async () => {
  // Reset database state before each test
  await prisma.$transaction([
    prisma.lockLike.deleteMany(),
    prisma.voteOption.deleteMany(),
    prisma.voteQuestion.deleteMany(),
    prisma.post.deleteMany(),
  ]);
});

afterAll(async () => {
  await prisma.$disconnect();
});