import { describe, expect, it } from "vitest";
import { getBarcodeValue, parseIsbn } from "../isbn";

describe("parseIsbn", () => {
  it("accepts a valid ISBN-10 and derives its EAN-13 Bookland value", () => {
    const isbn = parseIsbn("0-306-40615-2");

    expect(isbn).toEqual({ normalized: "0306406152", isbn13: "9780306406157" });
    expect(getBarcodeValue(isbn as NonNullable<typeof isbn>, "EAN13")).toBe("9780306406157");
  });

  it("accepts a valid ISBN-13 and keeps it as the EAN-13 value", () => {
    expect(parseIsbn("978-0-306-40615-7")).toEqual({ normalized: "9780306406157", isbn13: "9780306406157" });
  });

  it("rejects ISBNs with invalid check digits or unsupported characters", () => {
    expect(parseIsbn("0-306-40615-3")).toBeNull();
    expect(parseIsbn("978-0-306-40615-8")).toBeNull();
    expect(parseIsbn("ISBN 978-0-306-40615-7")).toBeNull();
  });
});
