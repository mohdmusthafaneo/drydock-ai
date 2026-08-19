import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { sanitizeLandingHtml } from "../src/lib/sanitize-landing-html";

const htmlPath = path.join(process.cwd(), "public", "portkey.html");

async function main() {
  const before = await readFile(htmlPath, "utf8");
  const after = sanitizeLandingHtml(before);

  if (before === after) {
    console.log("portkey.html already sanitized");
    return;
  }

  await writeFile(htmlPath, after, "utf8");
  console.log(
    `Sanitized portkey.html (${before.length} -> ${after.length} bytes)`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
