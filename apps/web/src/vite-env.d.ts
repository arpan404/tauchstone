/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USE_MOCK?: '1' | '0';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
