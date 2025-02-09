export interface Database {
  public: {
    Tables: {
      Bitcoiner: {
        Row: {
          handle: string;
          created_at: string;
          pubkey: string;
          avatar: string | null;
        };
        Insert: {
          handle: string;
          created_at?: string;
          pubkey: string;
          avatar?: string | null;
        };
        Update: {
          handle?: string;
          created_at?: string;
          pubkey?: string;
          avatar?: string | null;
        };
      };
      Post: {
        Row: {
          id: string;
          content: string;
          created_at: string;
          author_address: string;
          is_locked: boolean;
        };
        Insert: {
          content: string;
          author_address: string;
          is_locked?: boolean;
          created_at?: string;
        };
        Update: {
          content?: string;
          author_address?: string;
          is_locked?: boolean;
          created_at?: string;
        };
      };
      LockLike: {
        Row: {
          txid: string;
          amount: number;
          handle_id: string;
          locked_until: number;
          created_at: string;
          post_id: string;
        };
        Insert: {
          txid: string;
          amount: number;
          handle_id: string;
          locked_until?: number;
          created_at?: string;
          post_id: string;
        };
        Update: {
          txid?: string;
          amount?: number;
          handle_id?: string;
          locked_until?: number;
          created_at?: string;
          post_id?: string;
        };
      };
    };
  };
} 