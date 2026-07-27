import { describe, expect, it } from "vitest";
import { articlePath } from "../article-url";

describe("articlePath", () => {
  it("omits the language prefix for default English articles", () => {
    expect(articlePath(1, "lumina-tick", "en")).toBe("/lumina-tick");
    expect(articlePath(1, null, "en")).toBe("/feed/1");
  });

  it("keeps the language prefix for non-default languages", () => {
    expect(articlePath(1, "lumina-tick", "zh-CN")).toBe("/zh-CN/lumina-tick");
    expect(articlePath(1, null, "zh-CN")).toBe("/zh-CN/feed/1");
  });
});
