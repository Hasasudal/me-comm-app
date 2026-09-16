declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    ADMIN_JOIN_CODE_HASH?: string;
    ADMIN_JOIN_CODE_SALT?: string;
    BUCKET?: R2Bucket;
  }
}
