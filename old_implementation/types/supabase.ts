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
          txid: string;
          amount: number;
          handle_id: string;
          content: string;
          created_at: string;
          locked_until: number;
          media_url: string | null;
        };
        Insert: {
          txid: string;
          amount: number;
          handle_id: string;
          content?: string;
          created_at?: string;
          locked_until?: number;
          media_url?: string | null;
        };
        Update: {
          txid?: string;
          amount?: number;
          handle_id?: string;
          content?: string;
          created_at?: string;
          locked_until?: number;
          media_url?: string | null;
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