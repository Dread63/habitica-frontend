/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** `<your-habitica-user-id>-<appname>` — required on every Habitica API request. */
  readonly VITE_HABITICA_CLIENT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
