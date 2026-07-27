import type { QueueTask } from "./queue";

declare global {
  interface Env {
    CLOUDFLARE_ACCOUNT_ID?: string;
    CLOUDFLARE_API_TOKEN?: string;
    CLOUDFLARE_D1_DATABASE_ID?: string;
    CLOUDFLARE_R2_BUCKET_NAME?: string;
    RIN_GITHUB_CLIENT_ID?: string;
    RIN_GITHUB_CLIENT_SECRET?: string;
    RIN_GOOGLE_CLIENT_ID?: string;
    RIN_GOOGLE_CLIENT_SECRET?: string;
    CANONICAL_HOST?: string;
    TASK_QUEUE?: Queue<QueueTask>;
    R2_BUCKET?: R2Bucket;
    AI?: any;
    ARTICLE_VECTORIZE?: any;
    ARTICLE_VECTORIZE_WORKFLOW?: any;
    BROWSER?: any; // Fetcher binding for Browser Rendering
    SEO_WORKFLOW?: any; // Workflow binding
  }
}

export {};
