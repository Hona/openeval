import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const packageDirectory = resolve(root, "packages/openeval");
const run = async (argv: string[], cwd = root) => {
  const child = Bun.spawn(argv, { cwd, stdout: "inherit", stderr: "inherit" });
  if (await child.exited) throw new Error(`Failed: ${argv.join(" ")}`);
};
await run(["bun", "run", "build:viewer"]);
await rm(resolve(packageDirectory, "viewer"), { recursive: true, force: true });
await cp(resolve(root, "packages/viewer/dist"), resolve(packageDirectory, "viewer"), { recursive: true });
const notices = resolve(packageDirectory, "viewer/THIRD_PARTY_LICENSES.md");
await Bun.write(notices, (await Bun.file(notices).text()) + "\n## Vendored @opencode/session-ui\n\n" + await Bun.file(resolve(root, "vendor/session-ui/LICENSE")).text());
await cp(resolve(root, "LICENSE"), resolve(packageDirectory, "LICENSE"));
await Bun.write(resolve(packageDirectory, "README.md"), (await Bun.file(resolve(root, "README.md")).text())
  .replaceAll("packages/openeval/JUDGING.md", "JUDGING.md")
  .replaceAll("(docs/images/", "(https://raw.githubusercontent.com/Hona/openeval/main/docs/images/")
  .replace("(RELEASING.md)", "(https://github.com/Hona/openeval/blob/main/RELEASING.md)"));
await mkdir(resolve(root, "artifacts"), { recursive: true });
await run(["bun", "pm", "pack", "--destination", resolve(root, "artifacts")], packageDirectory);
