import { describe, expect, it } from "bun:test";
import { generateTotp, isTotpSecret, verifyTotp } from "../totp";

const RFC_6238_SHA1_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("TOTP", () => {
  it("implements the RFC 6238 SHA-1 test vector", async () => {
    await expect(generateTotp(RFC_6238_SHA1_SECRET, 59_000, 8)).resolves.toBe("94287082");
  });

  it("accepts the current step and one adjacent step", async () => {
    const timestamp = 1_700_000_000_000;
    const current = await generateTotp("JBSWY3DPEHPK3PXP", timestamp);
    const prior = await generateTotp("JBSWY3DPEHPK3PXP", timestamp - 30_000);

    await expect(verifyTotp("JBSWY3DPEHPK3PXP", current!, timestamp)).resolves.toBe(true);
    await expect(verifyTotp("JBSWY3DPEHPK3PXP", prior!, timestamp)).resolves.toBe(true);
  });

  it("rejects malformed secrets and invalid codes", async () => {
    expect(isTotpSecret("not-a-valid-secret0")).toBe(false);
    await expect(verifyTotp("JBSWY3DPEHPK3PXP", "12345x")).resolves.toBe(false);
  });
});
