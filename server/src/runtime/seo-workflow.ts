import puppeteer from "@cloudflare/puppeteer";
import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from "cloudflare:workers";
import { path_join } from "../utils/path";

type SEORenderParams = {
  feedId?: number;
  urlPath?: string;
  baseUrl: string;
  isDelete?: boolean;
};

export class SEORenderWorkflow extends WorkflowEntrypoint<Env, SEORenderParams> {
  async run(event: WorkflowEvent<SEORenderParams>, step: WorkflowStep) {
    const { feedId, urlPath, baseUrl, isDelete } = event.payload;

    if (!this.env.BROWSER || !this.env.R2_BUCKET) {
      console.warn("Missing BROWSER or R2_BUCKET binding, skipping SEO render.");
      return;
    }

    const folder = this.env.S3_CACHE_FOLDER || "cache/";

    if (isDelete && urlPath) {
      await step.do(`delete-${urlPath}`, async () => {
        let key = path_join(folder, urlPath);
        if (key.endsWith("/")) key += "index.html";
        console.log(`[SEO Workflow] Deleting ${key} from R2`);
        await this.env.R2_BUCKET!.delete(key);
      });
      // We also want to re-render the homepage, so continue to pathsToRender
    }

    // Determine paths to render
    const pathsToRender = ["/"]; // Always render homepage to keep feeds fresh
    if (!isDelete) {
      if (urlPath) {
        pathsToRender.push(urlPath);
      } else if (feedId) {
        pathsToRender.push(`/feed/${feedId}`);
      }
    }

    for (const path of pathsToRender) {
      await step.do(`render-${path}`, async () => {
        const fullUrl = `${baseUrl}${path}`;
        const folder = this.env.S3_CACHE_FOLDER || "cache/";
        let key = path_join(folder, path);
        if (key.endsWith("/")) key += "index.html";

        console.log(`[SEO Workflow] Rendering ${fullUrl} to R2 key ${key}`);

        let browser;
        try {
          browser = await puppeteer.launch(this.env.BROWSER);
          const page = await browser.newPage();
          
          // Use standard user agent
          const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36";
          await page.setUserAgent(ua);
          
          const response = await page.goto(fullUrl, { waitUntil: "networkidle2" });
          if (!response || !response.ok()) {
            console.warn(`[SEO Workflow] Failed to fetch ${fullUrl}, status: ${response?.status()}`);
            return;
          }

          const html = await page.content();
          
          await this.env.R2_BUCKET!.put(key, html, {
            httpMetadata: { contentType: "text/html" }
          });
          
          console.log(`[SEO Workflow] Successfully cached ${fullUrl}`);
        } catch (error) {
          console.error(`[SEO Workflow] Error rendering ${fullUrl}:`, error);
          throw error; // Rethrow to allow Workflow retry mechanism
        } finally {
          if (browser) {
            await browser.close();
          }
        }
      });
    }
  }
}
