/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_YOURS_WALLET_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
} 