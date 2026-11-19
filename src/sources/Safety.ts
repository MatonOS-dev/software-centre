// Safety annotations and anti-features are supplied by source backends.

export type SafetySeverity = "good" | "neutral" | "warning" | "danger";
export type SafetyItem = { id: string; title: string; description: string; severity: SafetySeverity };
export type SafetyLevel = "safe" | "probably-safe" | "potentially-unsafe";
export type Safety = { level: SafetyLevel; items: SafetyItem[] };
/** Backend supplied risk annotation. */
export type AntiFeature = { id: string; title: string; description: string; reason: string };

export function safetyOf(items: SafetyItem[]): Safety {
  const level: SafetyLevel = items.some((item) => item.severity === "danger") ? "potentially-unsafe"
    : items.some((item) => item.severity === "warning") ? "probably-safe" : "safe";
  return { level, items };
}

// Age rating (OARS, as Flathub publishes it in appstream content_rating_details).
export type ContentLevel = "none" | "mild" | "moderate" | "intense";
export type AgeRatingCategory = { id: string; title: string; description: string; level: ContentLevel };
/** minimumAge 0 = all ages; label is the rating system's name for it, e.g. "Teen" (ESRB). */
export type AgeRating = { minimumAge: number; label: string; system: string; categories: AgeRatingCategory[] };

const CATEGORY_TITLES: Record<string, string> = {
  social: "Social", drugs: "Drugs", language: "Strong Language", money: "Money", sex: "Nudity", violence: "Violence",
};

type RawContentRating = {
  categories?: Array<{ id?: string; description?: string; level?: string }>;
  minimumAge?: number; minimumAgeText?: string; contentRatingSystem?: string;
};

export function ageRatingOf(details: Record<string, RawContentRating> | null | undefined): AgeRating | undefined {
  if (!details) return undefined;
  const raw = details.en_US ?? details.C ?? Object.values(details)[0];
  if (!raw || typeof raw.minimumAge !== "number") return undefined;
  const levels: ContentLevel[] = ["none", "mild", "moderate", "intense"];
  return {
    minimumAge: raw.minimumAge,
    label: raw.minimumAgeText ?? "",
    system: raw.contentRatingSystem ?? "",
    categories: (raw.categories ?? []).filter((c) => c.id).map((c) => ({
      id: c.id as string,
      title: CATEGORY_TITLES[c.id as string] ?? (c.id as string),
      description: c.description ?? "",
      level: levels.includes(c.level as ContentLevel) ? (c.level as ContentLevel) : "none",
    })),
  };
}
