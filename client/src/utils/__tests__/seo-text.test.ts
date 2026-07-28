import { describe, expect, it } from "vitest";
import { seoTextExcerpt } from "../seo-text";

describe("seoTextExcerpt", () => {
  it("preserves natural hyphenated words", () => {
    expect(seoTextExcerpt("Open-Source, Zero-Cost Cloudflare based AI Helpdesk")).toBe(
      "Open-Source, Zero-Cost Cloudflare based AI Helpdesk",
    );
  });

  it("removes markdown syntax while keeping readable text", () => {
    expect(seoTextExcerpt("# Title\n\n![image](https://example.com/a.png)\n[Cloudflare](https://cloudflare.com) **serverless** - fast")).toBe(
      "Title Cloudflare serverless - fast",
    );
  });

  it("strips unsafe HTML content", () => {
    expect(seoTextExcerpt("<p>Hello <strong>world</strong></p><script>alert(1)</script>")).toBe("Hello world");
  });

  it("truncates on a word boundary when possible", () => {
    expect(seoTextExcerpt("one two three four five", 12)).toBe("one two");
  });
});
