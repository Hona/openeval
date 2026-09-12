/** Intrinsic dimensions reserve image space before a lazy download completes. */
export const screenshotDimensions = {
  "results.png": { width: 1440, height: 720 },
  "judgment.png": { width: 1440, height: 940 },
  "queue.png": { width: 1440, height: 940 },
} as const;

export type ScreenshotName = keyof typeof screenshotDimensions;
