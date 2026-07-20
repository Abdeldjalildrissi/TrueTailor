import { z } from "zod";
import { PARTIAL_DATE_PATTERN } from "./schema";

/**
 * LLM-facing extraction schema: the same shape as the profile but without
 * ids (assigned server-side after merging) and with every unknown value an
 * explicit null. The model is instructed to copy text verbatim; the
 * grounding verifier then deterministically rejects anything that does not
 * appear in the source document.
 */

const str = z.string();
const nstr = z.string().nullable();

export const extractionSchema = z.object({
  basics: z.object({
    fullName: nstr,
    headline: nstr,
    email: nstr,
    phone: nstr,
    location: nstr,
    links: z.array(z.object({ label: str, url: str }))
  }),
  summary: nstr,
  experience: z.array(
    z.object({
      employer: str,
      title: str,
      location: nstr,
      startDate: nstr,
      endDate: nstr,
      isCurrent: z.boolean().nullable(),
      bullets: z.array(str)
    })
  ),
  education: z.array(
    z.object({
      institution: str,
      degree: nstr,
      field: nstr,
      startDate: nstr,
      endDate: nstr,
      details: z.array(str)
    })
  ),
  skills: z.array(z.object({ name: str, category: nstr })),
  certifications: z.array(z.object({ name: str, issuer: nstr, date: nstr })),
  projects: z.array(z.object({ name: str, description: nstr, url: nstr, bullets: z.array(str) })),
  awards: z.array(z.object({ title: str, issuer: nstr, date: nstr })),
  languages: z.array(z.object({ name: str, proficiency: nstr }))
});

export type Extraction = z.infer<typeof extractionSchema>;

export const EXTRACTION_SYSTEM_PROMPT = `You are the parsing engine of a resume platform whose defining guarantee is zero fabrication. You convert one resume document into structured data. Your output is the candidate's single source of truth: everything the platform later tailors, ranks, or exports can only draw on what you extract here. You therefore serve two duties at once — total fidelity (nothing invented) and total recall (nothing present gets dropped).

## Fidelity — the absolute rules

1. Copy text verbatim. Bullets, titles, employer names, degrees, certification names, and skill names must appear character-for-character in the document (whitespace aside). Never paraphrase, summarize, translate, embellish, or "improve". A deterministic verifier rejects any string that does not appear in the source, so altered text is simply lost.
2. Never infer or invent. If the document does not state a value, it is null. Do not deduce dates from context, employers from email domains, locations from phone prefixes, or skills implied by job titles. Do not normalize company names ("Google" stays "Google", "Google LLC" stays "Google LLC").
3. Keep the document's language. A resume written in French, Arabic, or any other language is extracted in that language. Translation is fabrication.
4. Dates: only dates the document states, formatted as YYYY or YYYY-MM. Convert month names to numbers ("March 2021" → "2021-03") — that is formatting, not inference. A date you cannot map confidently is null.
5. isCurrent is true only when the document marks the role as ongoing ("Present", "Current", "Now", or an explicit open-ended range). Otherwise null.
6. Empty sections are empty arrays; missing values are null — never "Unknown", "N/A", or a guess.

## Recall — read the document the way a careful human would

- Resume text often arrives mangled by PDF conversion: hard line wraps mid-sentence, multi-column layouts flattened, repeated headers/footers, stray page numbers. Reassemble each logical unit (one bullet, one job header) across broken lines. Joining wrapped lines is allowed; changing characters is not — if a word is split with a hyphen at a line break, keep it exactly as printed.
- Recognize sections under any conventional heading: Experience / Work History / Employment / Professional Experience; Education / Academic Background; Skills / Technical Skills / Competencies / Tools; and their equivalents in the document's language.
- One bullet = one achievement or responsibility as the document delimits it (bullet glyphs, dashes, numbered lines). Do not merge separate bullets or split one bullet into several.
- Promotions listed under one employer are separate experience entries — one per title, each with its own dates and bullets.
- Skills: extract items the document presents as skills/tools/technologies, splitting comma- or pipe-separated lists. When the document groups skills under its own labels ("Languages:", "Frameworks:"), use that verbatim label as the category. Never add a skill the document does not list, even when a bullet obviously demonstrates it.
- Route content to the right section: certifications (credential + issuer) are not skills; awards/honors are not bullets; GPA, honors, and thesis lines belong in education details. When genuinely ambiguous, keep it where the document put it.
- Links: only URLs printed in the document.
- Capture everything: every role, every bullet, every degree, every listed skill. An entry you silently drop is invisible to the candidate forever.

You respond only through the provided tool schema.`;

export function buildExtractionUserMessage(documentText: string): string {
  return `Extract the complete structured profile from the resume document below. Verbatim text only; null for anything not stated; keep the document's own language; miss nothing that is present.

<resume_document>
${documentText}
</resume_document>`;
}

/**
 * Deterministic cleanup of raw model output before merging: trims strings,
 * drops empty values, nulls malformed dates, dedupes bullets, enforces caps.
 * This is pure code — it cannot introduce content, only remove it.
 */
export function sanitizeExtraction(raw: Extraction): Extraction {
  const cleanStr = (value: string | null, max = 300): string | null => {
    if (value === null) {
      return null;
    }
    const trimmed = value.replace(/\s+/g, " ").trim().slice(0, max);
    return trimmed.length > 0 ? trimmed : null;
  };
  const cleanDate = (value: string | null): string | null => {
    const trimmed = value?.trim() ?? "";
    return PARTIAL_DATE_PATTERN.test(trimmed) ? trimmed : null;
  };
  const cleanBullets = (bullets: string[], cap: number): string[] => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const bullet of bullets) {
      const text = bullet.replace(/\s+/g, " ").trim().slice(0, 600);
      const key = text.toLowerCase();
      if (text.length > 0 && !seen.has(key)) {
        seen.add(key);
        out.push(text);
      }
      if (out.length >= cap) {
        break;
      }
    }
    return out;
  };
  const required = (value: string, max = 300): string =>
    value.replace(/\s+/g, " ").trim().slice(0, max);

  return {
    basics: {
      fullName: cleanStr(raw.basics.fullName, 120),
      headline: cleanStr(raw.basics.headline, 160),
      email: cleanStr(raw.basics.email, 254),
      phone: cleanStr(raw.basics.phone, 40),
      location: cleanStr(raw.basics.location, 120),
      links: raw.basics.links
        .map((l) => ({ label: required(l.label, 60), url: l.url.trim().slice(0, 500) }))
        .filter((l) => l.label.length > 0 && /^https?:\/\//i.test(l.url))
        .slice(0, 20)
    },
    summary: cleanStr(raw.summary, 2000),
    experience: raw.experience
      .map((e) => ({
        employer: required(e.employer, 160),
        title: required(e.title, 160),
        location: cleanStr(e.location, 120),
        startDate: cleanDate(e.startDate),
        endDate: cleanDate(e.endDate),
        isCurrent: e.isCurrent === true,
        bullets: cleanBullets(e.bullets, 40)
      }))
      .filter((e) => e.employer.length > 0 && e.title.length > 0)
      .slice(0, 60),
    education: raw.education
      .map((e) => ({
        institution: required(e.institution, 160),
        degree: cleanStr(e.degree, 160),
        field: cleanStr(e.field, 160),
        startDate: cleanDate(e.startDate),
        endDate: cleanDate(e.endDate),
        details: cleanBullets(e.details, 20)
      }))
      .filter((e) => e.institution.length > 0)
      .slice(0, 30),
    skills: raw.skills
      .map((s) => ({ name: required(s.name, 80), category: cleanStr(s.category, 80) }))
      .filter((s) => s.name.length > 0)
      .slice(0, 200),
    certifications: raw.certifications
      .map((c) => ({
        name: required(c.name, 160),
        issuer: cleanStr(c.issuer, 160),
        date: cleanDate(c.date)
      }))
      .filter((c) => c.name.length > 0)
      .slice(0, 50),
    projects: raw.projects
      .map((p) => ({
        name: required(p.name, 160),
        description: cleanStr(p.description, 1000),
        url: p.url && /^https?:\/\//i.test(p.url.trim()) ? p.url.trim().slice(0, 500) : null,
        bullets: cleanBullets(p.bullets, 30)
      }))
      .filter((p) => p.name.length > 0)
      .slice(0, 50),
    awards: raw.awards
      .map((a) => ({
        title: required(a.title, 160),
        issuer: cleanStr(a.issuer, 160),
        date: cleanDate(a.date)
      }))
      .filter((a) => a.title.length > 0)
      .slice(0, 50),
    languages: raw.languages
      .map((l) => ({ name: required(l.name, 80), proficiency: cleanStr(l.proficiency, 80) }))
      .filter((l) => l.name.length > 0)
      .slice(0, 30)
  };
}
