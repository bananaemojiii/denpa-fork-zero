/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DENPA_WEB?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
