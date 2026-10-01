/** Categories are reporting metadata: any non-empty string, matched case-insensitively. */
export const categoryKey = (name: string) => name.trim().toLowerCase();

/** Trim names and drop case-insensitive duplicates, keeping the first spelling. */
export function categoryList(values: readonly unknown[], where: string) {
  const names: string[] = [],
    keys = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string" || !value.trim())
      throw new Error(`${where}: categories must be non-empty strings`);
    const name = value.trim();
    if (keys.has(categoryKey(name))) continue;
    keys.add(categoryKey(name));
    names.push(name);
  }
  return names;
}

const CATEGORY_LINE = /^Categor(?:y|ies):[ \t]*(.*?)\r?$/i;
const HEADING = /^## Criterion: ([a-z][a-z0-9_]*)[ \t]*[—–-]/;

/** Reads the optional `Categories:` line directly below each `## Criterion:` heading.
 * The returned rubric omits those lines, so adding or changing categories never
 * changes judge input or judge fingerprints.
 */
export function rubricCategories(rubric: string) {
  const lines = rubric.split("\n"),
    kept: string[] = [],
    categories: Record<string, string[]> = {};
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    if (CATEGORY_LINE.test(line))
      throw new Error(
        "Put a Categories: line directly below its ## Criterion: heading",
      );
    kept.push(line);
    const heading = HEADING.exec(line),
      next = heading ? CATEGORY_LINE.exec(lines[index + 1] ?? "") : null;
    if (!heading || !next) continue;
    categories[heading[1]!] = categoryList(
      next[1]!.split(","),
      `Criterion ${heading[1]}`,
    );
    index++;
  }
  return { rubric: kept.join("\n"), categories };
}

/** Whether a scored criterion belongs to any of the selected category keys. */
export const inCategories = (
  part: { categories?: readonly string[] },
  keys: readonly string[],
) => !!part.categories?.some((name) => keys.includes(categoryKey(name)));
