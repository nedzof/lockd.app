import { toast } from 'react-hot-toast';
import type { useYoursWallet } from 'yours-wallet-provider';

export interface Post {
  txid: string;
  content: string;
  author_address: string;
  created_at: string;
}

type YoursWallet = NonNullable<ReturnType<typeof useYoursWallet>>;

export const createPost = async (content: string, authorAddress: string, wallet: YoursWallet): Promise<Post> => {
  try {
    // Create a simple OP_RETURN with just the content
    const send = await wallet.sendBsv([{
      satoshis: 1,
      address: authorAddress,
      data: [content]
    }]);

    if (!send?.txid) {
      throw new Error('Failed to broadcast transaction');
    }

    const post: Post = {
      txid: send.txid,
      content,
      author_address: authorAddress,
      created_at: new Date().toISOString()
    };

    toast.success("Post created successfully!");
    return post;
  } catch (error) {
    console.error("Error creating post:", error);
    toast.error("Failed to create post: " + (error as Error).message);
    throw error;
  }
}; 