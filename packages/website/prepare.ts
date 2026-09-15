import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { strToU8, zipSync } from "fflate";
import { starterFiles } from "./src/examples";

const directory = fileURLToPath(new URL("./", import.meta.url));
await rm(resolve(directory, "public/demo/data"), {
  recursive: true,
  force: true,
});
await cp(
  resolve(directory, "demo/recording"),
  resolve(directory, "public/demo/data"),
  { recursive: true },
);
await mkdir(resolve(directory, "public/images"), { recursive: true });
for (const image of [
  "results.png",
  "judgment.png",
  "code-judgment.png",
  "queue.png",
])
  await cp(
    resolve(directory, "../../docs/images", image),
    resolve(directory, "public/images", image),
  );
await Bun.write(
  resolve(directory, "public/starter.zip"),
  zipSync(
    Object.fromEntries(
      Object.entries(starterFiles).map(([path, value]) => [
        `my-benchmark/${path}`,
        strToU8(value),
      ]),
    ),
    { level: 9, mtime: new Date("2026-01-01T00:00:00Z") },
  ),
);
