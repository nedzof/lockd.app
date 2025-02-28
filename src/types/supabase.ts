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
          block_height: number | null;
          tags: string[];
        };
        Insert: {
          content: string;
          author_address: string;
          is_locked?: boolean;
          created_at?: string;
          block_height?: number | null;
          tags?: string[];
        };
        Update: {
          content?: string;
          author_address?: string;
          is_locked?: boolean;
          created_at?: string;
          block_height?: number | null;
          tags?: string[];
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
      UserPreferences: {
        Row: {
          handle_id: string;
          preferred_tags: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          handle_id: string;
          preferred_tags?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          handle_id?: string;
          preferred_tags?: string[];
          created_at?: string;
          updated_at?: string;
        };
      };
    };
  };
} 