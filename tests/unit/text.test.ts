import { describe, expect, it } from "vitest";
import { chunkText, normalize, squash } from "@/lib/profile/text";

describe("normalize", () => {
  it("lowercases and collapses punctuation to spaces", () => {
    expect(normalize("Senior Engineer — Platform (Core)")).toBe("senior engineer platform core");
  });

  it("unifies curly quotes and unicode dashes", () => {
    expect(normalize("It’s “done” – now")).toBe("it s done now");
  });

  it("survives mixed whitespace", () => {
    expect(normalize("a\t b\n\nc")).toBe("a b c");
  });
});

describe("squash", () => {
  it("removes all separators for wrap-tolerant matching", () => {
    expect(squash("manage-\nment of pipelines")).toBe("managementofpipelines");
    expect(squash("management of pipelines")).toBe("managementofpipelines");
  });
});

describe("chunkText", () => {
  it("returns a single chunk for small documents", () => {
    expect(chunkText("short resume text")).toEqual(["short resume text"]);
  });

  it("returns no chunks for empty input", () => {
    expect(chunkText("   \n  ")).toEqual([]);
  });

  it("splits large documents at paragraph boundaries within the max size", () => {
    const paragraph = "Experience line with detail. ".repeat(40).trim(); // ~1.1k chars
    const doc = Array.from({ length: 20 }, (_, i) => `Section ${i}\n${paragraph}`).join("\n\n");
    const chunks = chunkText(doc, { targetSize: 4000, maxSize: 6000 });
    expect(chunks.length).toBeGreaterThan(2);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(6000);
    }
    // No content loss: every section header survives in some chunk.
    for (let i = 0; i < 20; i += 1) {
      expect(chunks.some((c) => c.includes(`Section ${i}`))).toBe(true);
    }
  });

  it("hard-splits a single oversized paragraph", () => {
    const giant = "x".repeat(15000);
    const chunks = chunkText(giant, { targetSize: 4000, maxSize: 6000 });
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    expect(chunks.join("")).toBe(giant);
  });
});
