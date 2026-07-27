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
        let key = urlPath === "/" ? path_join(folder, "index.html") : path_join(folder, urlPath);
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
      const stepName = path === "/" ? "render-home" : `render-${path.replace(/\//g, "-")}`;
      await step.do(stepName, async () => {
        const fullUrl = `${baseUrl}${path}`;
        const folder = this.env.S3_CACHE_FOLDER || "cache/";
        let key = path === "/" ? path_join(folder, "index.html") : path_join(folder, path);

        console.log(`[SEO Workflow] Rendering ${fullUrl} to R2 key ${key}`);

        let browser;
        try {
          browser = await puppeteer.launch(this.env.BROWSER);
          const page = await browser.newPage();
          
          // Use standard user agent
          const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36";
          await page.setUserAgent(ua);
          
          let debugLogs = "";
          page.on('console', msg => debugLogs += `[Console] ${msg.type()}: ${msg.text()}\n`);
          page.on('pageerror', error => debugLogs += `[PageError]: ${error.message}\n`);
          page.on('requestfailed', request => debugLogs += `[RequestFailed]: ${request.url()} - ${request.failure()?.errorText}\n`);
          page.on('response', response => {
            if (response.status() === 403) {
              debugLogs += `[Response 403]: ${response.url()}\n`;
            }
          });
          
          const response = await page.goto(fullUrl, { waitUntil: "networkidle2" });
          if (!response || !response.ok()) {
            console.warn(`[SEO Workflow] Failed to fetch ${fullUrl}, status: ${response?.status()}`);
            return;
          }

          try {
            // Wait for either the article content or the homepage main container to appear
            await page.waitForSelector("article, main", { timeout: 10000 });
            // Add a small delay to allow any micro-animations or subsequent state updates to settle
            await new Promise(resolve => setTimeout(resolve, 500));
          } catch (e) {
            console.warn(`[SEO Workflow] Timeout waiting for content to render on ${fullUrl}`);
          }

          const html = await page.content();
          
          await this.env.R2_BUCKET!.put(key, html, {
            httpMetadata: { contentType: "text/html" }
          });
          
          if (debugLogs) {
             await this.env.R2_BUCKET!.put(key + ".log", debugLogs, {
               httpMetadata: { contentType: "text/plain" }
             });
          }
          
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
