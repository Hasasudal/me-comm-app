declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    ADMIN_JOIN_CODE_HASH?: string;
    ADMIN_JOIN_CODE_SALT?: string;
    FIREBASE_API_KEY?: string;
    FIREBASE_AUTH_DOMAIN?: string;
    FIREBASE_PROJECT_ID?: string;
    FIREBASE_APP_ID?: string;
    BUCKET?: R2Bucket;
  }
}
