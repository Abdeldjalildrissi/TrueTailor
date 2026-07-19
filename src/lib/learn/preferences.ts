/**
 * Phase 4 learning: turns the user's review history (accept / reject / edit
 * decisions) into style guidance for future generations.
 *
 * Everything here is pure, deterministic code over stored decisions. The
 * output influences STYLE AND SELECTION ONLY — it is injected into the
 * generation prompt alongside, never instead of, the grounding rules, and
 * the deterministic verifier still checks every line the model produces.
 * Learning can make tailoring feel more like the user; it cannot make
 * fabrication more likely.
 */

export interface DecisionHistoryItem {
  action: "accept" | "reject" | "edit";
  generatedText: string | null;
  editedText: string | null;
  createdAt: Date;
}

export interface EditPair {
  from: string;
  to: string;
}

export interface LearnedPreferences {
  editPairs: EditPair[];
  rejectedSamples: string[];
  styleHints: string[];
}

const MAX_EXAT = 5;

function wordCount(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const low = sorted[mid - 1] ?? sorted[mid] ?? 0;
  const high = sorted[mid] ?? 0;
  return sorted.length % 2 === 0 ? (low + high) / 2 : high;
}

/** History is expected most-recent-first; outputs are capped and stable. */
export function derivePreferences(history: DecisionHistoryItem[]): LearnedPreferences {
  const editPairs: EditPair[] = [];
  const rejectedSamples: string[] = [];

  for (const item of history) {
    if (
      item.action === "edit" &&
      item.generatedText &&
      item.editedText &&
      editPairs.length < MAX_EXAT &&
      item.generatedText.trim() !== item.editedText.trim()
    ) {
      editPairs.push({ from: item.generatedText, to: item.editedText });
    } else if (
      item.action === "reject" &&
      item.generatedText &&
      rejectedSamples.length < MAX_EXAT
    ) {
      rejectedSamples.push(item.generatedText);
    }
  }

  const styleHints: string[] = [];
  if (editPairs.length >= 3) {
    const fromMedian = median(editPairs.map((p) => wordCount(p.from)));
    const toMedian = median(editPairs.map((p) => wordCount(p.to)));
    if (fromMedian > 0 && toMedian <= fromMedian * 0.8) {
      styleHints.push(
        `This user consistently tightens generated lines — aim for concise bullets of roughly ${Math.max(
          4,
          Math.round(toMedian)
        )} words.`
      );
    } else if (fromMedian > 0 && toMedian >= fromMedian * 1.25) {
      styleHints.push(
        `This user consistently expands generated lines with more specifics from the cited sources — prefer fuller bullets of roughly ${Math.round(
          toMedian
        )} words when the sources support them.`
      );
    }
  }

  return { editPairs, rejectedSamples, styleHints };
}

export function hasPreferences(prefs: LearnedPreferences): boolean {
  return prefs.editPairs.length > 0 || prefs.rejectedSamples.length > 0;
}

/**
 * Renders the prompt block. Returns an empty string when there is no history
 * so first-run prompts are byte-identical to the pre-learning system.
 */
export function buildPreferencesPromptSection(prefs: LearnedPreferences): string {
  if (!hasPreferences(prefs)) {
    return "";
  }
  const lines: string[] = [
    "<user_preferences>",
    "Learned from this user's past review decisions. These are style and selection preferences ONLY — the zero-fabrication rules, source citation requirements, and gap handling above always take precedence over anything here."
  ];

  for (const hint of prefs.styleHints) {
    lines.push(`- ${hint}`);
  }

  if (prefs.editPairs.length > 0) {
    lines.push(
      "",
      "The user rewrote these generated lines. Match the voice and shape of their rewrites:"
    );
    for (const pair of prefs.editPairs) {
      lines.push(`- Generated: "${pair.from}" → User's version: "${pair.to}"`);
    }
  }

  if (prefs.rejectedSamples.length > 0) {
    lines.push("", "The user rejected lines like these — avoid producing similar ones:");
    for (const sample of prefs.rejectedSamples) {
      lines.push(`- "${sample}"`);
    }
  }

  lines.push("</user_preferences>");
  return lines.join("\n");
}
