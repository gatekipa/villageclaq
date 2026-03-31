export interface ChangelogEntry {
  version: string;
  date: string;
  titleKey: string;
  descriptionKey: string;
  features: string[];
  category: "feature" | "improvement" | "bugfix";
}

export const changelog: ChangelogEntry[] = [
  {
    version: "1.0.0",
    date: "2026-03-30",
    titleKey: "changelog.v100_title",
    descriptionKey: "changelog.v100_description",
    features: [
      "changelog.v100_feature1",
      "changelog.v100_feature2",
      "changelog.v100_feature3",
      "changelog.v100_feature4",
      "changelog.v100_feature5",
      "changelog.v100_feature6",
    ],
    category: "feature",
  },
];

export function getLatestVersion(): string {
  return changelog[0]?.version || "0.0.0";
}
