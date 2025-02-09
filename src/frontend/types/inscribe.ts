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
  base64Data: string;
  mimeType: MimeTypes;
  map?: Record<string, string>;
  satoshis?: number;
}

export interface SendResponse {
  txid: string;
  rawtx: string;
} 