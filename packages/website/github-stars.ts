/** Capture once per build so prerendered HTML and hydration use the same count. */
export async function githubStarCount(): Promise<number> {
  try {
    const response = await fetch("https://api.github.com/repos/Hona/openeval", {
      headers: { Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(3000),
    });
    if (response.ok) {
      const { stargazers_count: count } = await response.json();
      if (Number.isSafeInteger(count) && count >= 0) return count;
    }
  } catch {
    // Keep offline and rate-limited builds usable with the last verified count.
  }
  return 65; // Verified on 2026-09-15.
}
