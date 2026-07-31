import { describe, expect, it } from "vitest";

import { InvalidEmailError, normalizeEmail } from "./identity";

describe("normalizeEmail", () => {
  it("trims and lowercases a conservatively shaped address", () => {
    expect(normalizeEmail("  Person.Name+Proof@Example.COM  ")).toBe(
      "person.name+proof@example.com",
    );
  });

  it.each([
    "",
    "person",
    "@example.com",
    "person@example",
    ".person@example.com",
    "person..name@example.com",
    "person@-example.com",
    "person@example-.com",
    "person name@example.com",
    "pérson@example.com",
    `${"a".repeat(65)}@example.com`,
    `person@${"a".repeat(64)}.com`,
    `${"a".repeat(243)}@example.com`,
  ])("rejects invalid or out-of-bounds input without echoing it: %s", (input) => {
    let thrown: unknown;

    try {
      normalizeEmail(input);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(InvalidEmailError);
    expect(thrown).toMatchObject({ code: "INVALID_EMAIL" });
    if (input.length > 0) {
      expect(String(thrown)).not.toContain(input);
      expect(JSON.stringify(thrown)).not.toContain(input);
    }
  });
});
