// src/dbClient.ts (continued)
export class DBClient {
    // ... previous code
  
    async saveTransaction(parsedTx: ParsedTransaction) {
      await this.prisma.$transaction(async (tx) => {
        // 1. Save main post
        const post = await tx.post.upsert({
          where: { postId: parsedTx.postId },
          update: {
            type: parsedTx.vote ? 'vote' : 'content',
            content: this.transformContent(parsedTx),
            timestamp: parsedTx.timestamp,
            sequence: parsedTx.sequence,
  parentSequence: parsedTx.parentSequence,
          },
          create: {
            postId: parsedTx.postId,
            type: parsedTx.vote ? 'vote' : 'content',
            content: this.transformContent(parsedTx),
            timestamp: parsedTx.timestamp,
            sequence: parsedTx.sequence,
            parentSequence: parsedTx.parentSequence,
          }
        });
  
        // 2. Process vote data if exists
        if (parsedTx.vote) {
          await tx.voteQuestion.upsert({
            where: { postId: post.postId },
            update: {
              question: this.extractQuestion(parsedTx),
              totalOptions: parsedTx.vote.totalOptions,
              optionsHash: parsedTx.vote.optionsHash,
              protocol: 'MAP'
            },
            create: {
              postId: post.postId,
              question: this.extractQuestion(parsedTx),
              totalOptions: parsedTx.vote.totalOptions,
              optionsHash: parsedTx.vote.optionsHash,
              protocol: 'MAP',
              post: { connect: { postId: post.postId } }
            }
          });
  
          // 3. Process vote options
          for (const option of parsedTx.vote.options) {
            const voteOption = await tx.voteOption.upsert({
              where: { 
                postId_index: {
                  postId: post.postId,
                  index: option.index
                }
              },
              update: {
                content: this.findOptionContent(option.index, parsedTx),
                lockLikes: {
                  create: this.createLockLike(option, parsedTx)
                }
              },
              create: {
                postId: post.postId,
                index: option.index,
                content: this.findOptionContent(option.index, parsedTx),
                voteQuestion: { connect: { postId: post.postId } },
                lockLikes: {
                  create: this.createLockLike(option, parsedTx)
                }
              }
            });
          }
        }
  
        // 4. Process lock likes for non-vote content
        if (!parsedTx.vote && parsedTx.contents.some(c => c.type === 'lock')) {
          await tx.lockLike.create({
            data: {
              txid: parsedTx.txid,
              amount: this.getLockAmount(parsedTx),
              lockPeriod: this.getLockDuration(parsedTx),
              post: { connect: { postId: post.postId } }
            }
          });
        }
      });
    }
  
    private transformContent(parsedTx: ParsedTransaction): any {
      return {
        text: parsedTx.contents.find(c => c.type === 'text/plain')?.data,
        media: parsedTx.contents
          .filter(c => c.type.startsWith('image/'))
          .map(img => ({
            type: img.type,
            data: img.data,
            encoding: img.encoding,
            filename: img.filename
          })),
        metadata: parsedTx.contents
          .filter(c => c.type === 'application/json')
          .map(json => JSON.parse(json.data as string)),
        tags: parsedTx.tags
      };
    }
  
    private extractQuestion(parsedTx: ParsedTransaction): string {
      return parsedTx.contents.find(c => c.type === 'text/plain')?.data as string || '';
    }
  
    private findOptionContent(index: number, parsedTx: ParsedTransaction): string {
      return parsedTx.contents
        .find(c => c.type === 'application/json' && (JSON.parse(c.data as string)).optionIndex === index)
        ?.data as string || '';
    }
  
    private createLockLike(option: any, parsedTx: ParsedTransaction) {
      return {
        txid: `${parsedTx.txid}-opt${option.index}`,
        amount: option.lockAmount,
        lockPeriod: option.lockDuration,
        createdAt: parsedTx.timestamp
      };
    }
  
    private getLockAmount(parsedTx: ParsedTransaction): number {
      return parsedTx.contents
        .find(c => c.type === 'lock')?.data
        ?.match(/lockAmount=(\d+)/)?.[1] || 0;
    }
  
    private getLockDuration(parsedTx: ParsedTransaction): number {
      return parsedTx.contents
        .find(c => c.type === 'lock')?.data
        ?.match(/lockDuration=(\d+)/)?.[1] || 0;
    }
  
    async disconnect() {
      await this.prisma.$disconnect();
    }
  }