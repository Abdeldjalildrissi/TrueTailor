import type { Profile } from "@/lib/profile/schema";
import { squash } from "@/lib/profile/text";
import type { GroundedRequirement } from "./job-analysis";

/**
 * Deterministic relevance ranking and gap detection. Pure code — no model
 * involvement — so requirement coverage is reproducible and testable.
 *
 * Matching rule: a requirement keyword matches a profile entry when the
 * squashed keyword appears inside the squashed entry text (or vice versa for
 * multi-word entry names). Strength per requirement:
 *   - "full":    a keyword matches a skill entry, or keywords match two or
 *                more distinct profile entries
 *   - "partial": exactly one non-skill entry matches
 *   - "none":    no matches → an explicit gap
 */

export interface RequirementMatch {
  requirementId: string;
  requirementText: string;
  kind: "must" | "nice";
  strength: "full" | "partial" | "none";
  matchedIds: string[];
}

export interface RankedExperience {
  experienceId: string;
  score: number;
  matchedRequirementIds: string[];
}

export interface RankingResult {
  requirementMatches: RequirementMatch[];
  rankedExperience: RankedExperience[];
  matchedSkillIds: string[];
  gaps: RequirementMatch[];
}

interface IndexedText {
  id: string;
  ownerExperienceId: string | null;
  isSkill: boolean;
  squashedText: string;
}

function buildIndex(profile: Profile): IndexedText[] {
  const index: IndexedText[] = [];
  const add = (id: string, text: string, ownerExperienceId: string | null, isSkill = false) => {
    const squashed = squash(text);
    if (squashed.length > 0) {
      index.push({ id, ownerExperienceId, isSkill, squashedText: squashed });
    }
  };

  for (const experience of profile.experience) {
    add(experience.id, `${experience.title} ${experience.employer}`, experience.id);
    for (const bullet of experience.bullets) {
      add(bullet.id, bullet.text, experience.id);
    }
  }
  for (const education of profile.education) {
    add(
      education.id,
      `${education.institution} ${education.degree ?? ""} ${education.field ?? ""}`,
      null
    );
    for (const detail of education.details) {
      add(detail.id, detail.text, null);
    }
  }
  for (const skill of profile.skills) {
    add(skill.id, skill.name, null, true);
  }
  for (const certification of profile.certifications) {
    add(certification.id, `${certification.name} ${certification.issuer ?? ""}`, null);
  }
  for (const project of profile.projects) {
    add(project.id, `${project.name} ${project.description ?? ""}`, null);
    for (const bullet of project.bullets) {
      add(bullet.id, bullet.text, null);
    }
  }
  if (profile.summary) {
    add(profile.summary.id, profile.summary.text, null);
  }
  return index;
}

function keywordMatches(keyword: string, entry: IndexedText): boolean {
  const squashedKeyword = squash(keyword);
  if (squashedKeyword.length < 2) {
    return false;
  }
  if (entry.squashedText.includes(squashedKeyword)) {
    return true;
  }
  // Multi-word skill names can also contain the keyword's squashed form
  // (e.g. keyword "PostgreSQL databases" vs skill "PostgreSQL").
  return squashedKeyword.includes(entry.squashedText) && entry.squashedText.length >= 4;
}

export function rankProfile(profile: Profile, requirements: GroundedRequirement[]): RankingResult {
  const index = buildIndex(profile);
  const requirementMatches: RequirementMatch[] = [];
  const experienceScores = new Map<string, { score: number; requirementIds: Set<string> }>();
  const matchedSkillIds = new Set<string>();

  for (const requirement of requirements) {
    const matchedEntries = new Map<string, IndexedText>();
    for (const keyword of requirement.keywords) {
      for (const entry of index) {
        if (keywordMatches(keyword, entry)) {
          matchedEntries.set(entry.id, entry);
        }
      }
    }

    const matched = [...matchedEntries.values()];
    const matchedSkills = matched.filter((m) => m.isSkill);
    for (const skill of matchedSkills) {
      matchedSkillIds.add(skill.id);
    }

    let strength: RequirementMatch["strength"];
    if (matchedSkills.length > 0 || matched.length >= 2) {
      strength = "full";
    } else if (matched.length === 1) {
      strength = "partial";
    } else {
      strength = "none";
    }

    const weight = requirement.kind === "must" ? 2 : 1;
    for (const entry of matched) {
      if (entry.ownerExperienceId) {
        const current = experienceScores.get(entry.ownerExperienceId) ?? {
          score: 0,
          requirementIds: new Set<string>()
        };
        current.score += weight;
        current.requirementIds.add(requirement.id);
        experienceScores.set(entry.ownerExperienceId, current);
      }
    }

    requirementMatches.push({
      requirementId: requirement.id,
      requirementText: requirement.text,
      kind: requirement.kind,
      strength,
      matchedIds: matched.map((m) => m.id).sort()
    });
  }

  // Stable ordering: score descending, then original profile order.
  const originalOrder = new Map(profile.experience.map((e, i) => [e.id, i]));
  const rankedExperience: RankedExperience[] = profile.experience
    .map((experience) => {
      const entry = experienceScores.get(experience.id);
      return {
        experienceId: experience.id,
        score: entry?.score ?? 0,
        matchedRequirementIds: entry ? [...entry.requirementIds].sort() : []
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return (originalOrder.get(a.experienceId) ?? 0) - (originalOrder.get(b.experienceId) ?? 0);
    });

  return {
    requirementMatches,
    rankedExperience,
    matchedSkillIds: [...matchedSkillIds].sort(),
    gaps: requirementMatches.filter((m) => m.strength !== "full")
  };
}
