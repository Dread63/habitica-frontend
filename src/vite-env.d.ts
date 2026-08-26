/// <reference types="vite/client" />

/**
 * Deliberately empty. This app has *no* build-time configuration — the one
 * variable it used to need, `VITE_HABITICA_CLIENT_ID`, is now derived from
 * the logged-in user id at request time (see lib/habitica/client.ts). That's
 * what lets one prebuilt image serve any account, so please think twice
 * before adding a `VITE_*` var back: anything added here has to be decided
 * before the bundle is built, and therefore forks the image per deployment.
 */
interface ImportMetaEnv {}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
