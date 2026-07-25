import { describe, expect, it } from "vitest";
import { normalizeWebsiteUrl } from "../qr-code";

describe("normalizeWebsiteUrl", () => {
  it("accepts complete HTTP and HTTPS website URLs", () => {
    expect(normalizeWebsiteUrl(" https://example.com/products?category=tools ")).toBe("https://example.com/products?category=tools");
    expect(normalizeWebsiteUrl("http://example.com")).toBe("http://example.com/");
  });

  it("rejects incomplete, unsupported, and credential-bearing URLs", () => {
    expect(normalizeWebsiteUrl("example.com")).toBeNull();
    expect(normalizeWebsiteUrl("ftp://example.com/file")).toBeNull();
    expect(normalizeWebsiteUrl("https://user:password@example.com")).toBeNull();
    expect(normalizeWebsiteUrl("not a URL")).toBeNull();
  });
});
