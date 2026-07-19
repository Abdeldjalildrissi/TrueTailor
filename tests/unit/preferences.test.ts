import { describe, expect, it } from "vitest";
import {
  buildPreferencesPromptSection,
  derivePreferences,
  hasPreferences,
  type DecisionHistoryItem
} from "@/lib/learn/preferences";

const now = new Date();

function item(
  action: "accept" | "reject" | "edit",
  generatedText: string | null,
  editedText: string | null = null
): DecisionHistoryItem {
  return { action, generatedText, editedText, createdAt: now };
}

describe("derivePreferences", () => {
  it("returns empty preferences for empty history", () => {
    const prefs = derivePreferences([]);
    expect(hasPreferences(prefs)).toBe(false);
    expect(buildPreferencesPromptSection(prefs)).toBe("");
  });

  it("collects edit pairs most-recent-first, capped at five", () => {
    const history = Array.from({ length: 8 }, (_, i) =>
      item("edit", `generated line number ${i}`, `rewritten line number ${i}`)
    );
    const prefs = derivePreferences(history);
    expect(prefs.editPairs).toHaveLength(5);
    expect(prefs.editPairs[0]?.from).toBe("generated line number 0");
  });

  it("ignores edits identical to the generated text and caps rejected samples", () => {
    const history: DecisionHistoryItem[] = [
      item("edit", "same text", "same text"),
      ...Array.from({ length: 7 }, (_, i) => item("reject", `rejected line ${i}`))
    ];
    const prefs = derivePreferences(history);
    expect(prefs.editPairs).toHaveLength(0);
    expect(prefs.rejectedSamples).toHaveLength(5);
  });

  it("derives a concision hint when the user consistently tightens lines", () => {
    const long =
      "Led the comprehensive migration of the billing platform infrastructure across three regions with significant stakeholder alignment";
    const short = "Led billing platform migration across three regions";
    const history = [
      item("edit", long, short),
      item("edit", long, short),
      item("edit", long, short)
    ];
    const prefs = derivePreferences(history);
    expect(prefs.styleHints.some((h) => h.includes("concise"))).toBe(true);
  });

  it("derives an expansion hint when the user consistently adds detail", () => {
    const short = "Built reporting tools";
    const long =
      "Built internal reporting tools in Python covering revenue analytics and operational dashboards";
    const history = [
      item("edit", short, long),
      item("edit", short, long),
      item("edit", short, long)
    ];
    const prefs = derivePreferences(history);
    expect(prefs.styleHints.some((h) => h.includes("fuller"))).toBe(true);
  });

  it("adds no style hint below three edit pairs", () => {
    const history = [item("edit", "a long generated line of many words here", "short line")];
    const prefs = derivePreferences(history);
    expect(prefs.styleHints).toHaveLength(0);
    expect(prefs.editPairs).toHaveLength(1);
  });
});

describe("buildPreferencesPromptSection", () => {
  it("renders precedence note, edit pairs, and rejections", () => {
    const prefs = derivePreferences([
      item("edit", "Generated wording", "User wording"),
      item("reject", "A line the user did not like")
    ]);
    const section = buildPreferencesPromptSection(prefs);
    expect(section).toContain("<user_preferences>");
    expect(section).toContain("always take precedence");
    expect(section).toContain('"Generated wording" → User\'s version: "User wording"');
    expect(section).toContain('"A line the user did not like"');
    expect(section).toContain("</user_preferences>");
  });
});
