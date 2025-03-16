export type MimeTypes = 
  | "text/plain"
  | "text/markdown"
  | "image/png"
  | "image/jpeg"
  | "image/gif"
  | "image/webp"
  | "image/svg+xml"
  | "application/pdf"
  | "application/json";

export interface InscribeRequest {
  address: string;
  base64_data: string;
  mime_type: MimeTypes;
  map?: Record<string, string>;
  satoshis?: number;
}

export interface SendResponse {
  tx_id: string;
  rawtx: string;
} 