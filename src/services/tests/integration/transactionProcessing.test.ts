// tests/integration/transactionProcessing.test.ts
import { JungleBusClient } from "@gorillapool/js-junglebus";
import { TransactionParser } from "../../src/parser";
import { DBClient } from "../../src/dbClient";
import { PrismaClient } from "@prisma/client";
import { ParsedTransaction } from "../../src/types";

const TEST_TXID = "a043fbcdc79628136708f88fad1e33f367037aa3d1bb0bff4bfffe818ec4b598";
const JB_ENDPOINT = "junglebus.gorillapool.io";

describe("Transaction Processing Integration Test", () => {
  let prisma: PrismaClient;
  let parser: TransactionParser;
  let dbClient: DBClient;
  let junglebus: JungleBusClient;

  beforeAll(async () => {
    prisma = new PrismaClient();
    parser = new TransactionParser();
    dbClient = new DBClient();
    junglebus = new JungleBusClient(JB_ENDPOINT, { useSSL: true });

    // Connect to test database
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await junglebus.destroy();
  });

  test("should process and store transaction correctly", async () => {
    // 1. Fetch transaction from JungleBus
    const txResponse = await junglebus.getTransaction(TEST_TXID);
    const txData = txResponse.data?.[0];
    if (!txData) throw new Error("Transaction not found");

    // 2. Parse transaction
    const parsedTx = parser.parseTransaction(txData);
    
    // Validate parsing
    expect(parsedTx).toMatchObject({
      txid: TEST_TXID,
      postId: "m73g8bip-ceeh3n0x2",
      blockHeight: expect.any(Number),
      timestamp: expect.any(Date),
      tags: ["Sports"],
      contents: expect.arrayContaining([
        expect.objectContaining({ type: "text/plain" }),
        expect.objectContaining({ type: "image/png" }),
        expect.objectContaining({ type: "application/json" })
      ])
    });

    // 3. Save to database
    await dbClient.saveTransaction(parsedTx);

    // 4. Verify database state
    const dbPost = await prisma.post.findUnique({
      where: { postId: parsedTx.postId },
      include: {
        voteQuestion: {
          include: {
            voteOptions: {
              include: {
                lockLikes: true
              }
            }
          }
        },
        lockLikes: true
      }
    });

    // Validate Post
    expect(dbPost).toMatchObject({
      postId: "m73g8bip-ceeh3n0x2",
      type: "content",
      timestamp: parsedTx.timestamp,
      sequence: 0,
      parentSequence: 0,
      content: {
        text: expect.stringContaining("wedw"),
        media: expect.arrayContaining([
          expect.objectContaining({
            type: "image/png",
            encoding: "base64"
          })
        ]),
        tags: ["Sports"]
      }
    });

    // Validate VoteQuestion
    expect(dbPost?.voteQuestion).toMatchObject({
      optionsHash: "3c7ab452367c1731644d52256207e4df3c7819e4364506b2227e1cfe969c8ce8",
      totalOptions: 2,
      protocol: "MAP"
    });

    // Validate VoteOptions
    expect(dbPost?.voteQuestion?.voteOptions).toHaveLength(2);
    expect(dbPost?.voteQuestion?.voteOptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          index: 0,
          lockLikes: expect.arrayContaining([
            expect.objectContaining({
              amount: 1000,
              lockPeriod: 1
            })
          ])
        }),
        expect.objectContaining({
          index: 1,
          lockLikes: expect.arrayContaining([
            expect.objectContaining({
              amount: 1000,
              lockPeriod: 1
            })
          ])
        })
      ])
    );

    // Validate LockLikes
    const allLockLikes = [
      ...(dbPost?.lockLikes || []),
      ...(dbPost?.voteQuestion?.voteOptions.flatMap(vo => vo.lockLikes) || [])
    ];
    expect(allLockLikes).toHaveLength(2);
    expect(allLockLikes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          amount: 1000,
          lockPeriod: 1,
          txid: expect.stringContaining(TEST_TXID)
        })
      ])
    );
  });

  afterEach(async () => {
    // Cleanup test data
    await prisma.$transaction([
      prisma.lockLike.deleteMany(),
      prisma.voteOption.deleteMany(),
      prisma.voteQuestion.deleteMany(),
      prisma.post.deleteMany(),
    ]);
  });
});