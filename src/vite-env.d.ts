/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DENPA_API?: string;
  readonly VITE_DENPA_WEB?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
