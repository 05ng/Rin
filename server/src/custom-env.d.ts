import type { QueueTask } from "./queue";

declare global {
  interface Env {
    RIN_GITHUB_CLIENT_ID?: string;
    RIN_GITHUB_CLIENT_SECRET?: string;
    RIN_GOOGLE_CLIENT_ID?: string;
    RIN_GOOGLE_CLIENT_SECRET?: string;
    TASK_QUEUE?: Queue<QueueTask>;
    R2_BUCKET?: R2Bucket;
    AI?: any;
    BROWSER?: any; // Fetcher binding for Browser Rendering
    SEO_WORKFLOW?: any; // Workflow binding
  }
}

export {};
