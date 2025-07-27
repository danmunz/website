// scripts/generate-og-images.js
import path from "path";
import fm from "front-matter";
import { sync as globSync } from "glob";
import * as fs from "fs/promises";
import { readFile, writeFile, mkdir, unlink } from "fs/promises";
import nunjucks from "nunjucks";
import puppeteer from "puppeteer";

const POSTS_GLOB = "content/blog/*.md";       // adjust if your posts live elsewhere
const TEMPLATE     = "_includes/og-image-template.html";
const OUT_DIR      = "og-images";             // will end up in _site/og-images

async function main() {
  // 1. load template
const tplSrc = await readFile(TEMPLATE, "utf-8");
  const env = nunjucks.configure({ autoescape: false });
  env.addFilter("safe", (s) => s);

  // 2. find all posts
  const files = globSync(POSTS_GLOB);
await mkdir(OUT_DIR, { recursive: true });

  // 3. launch Puppeteer once
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 630 });

  for (let file of files) {
    const raw = await fs.readFile(file, "utf-8");
    const { attributes } = fm(raw);
    const title = attributes.title || "Untitled";
    const date  = attributes.date
      ? new Date(attributes.date).toLocaleDateString("en-US", {
          year: "numeric", month: "long", day: "numeric"
        })
      : "";

    // derive slug from filename, e.g. my-post.md → my-post
    const slug = path.basename(file, path.extname(file));

    // 4. render HTML
    const html = env.renderString(tplSrc, { title, date });

    // write a temp HTML file
    const tmpFile = path.join(OUT_DIR, `${slug}.html`);
await writeFile(tmpFile, html);

    // 5. screenshot it
    await page.goto("file://" + path.resolve(tmpFile));
    const outPng = path.join(OUT_DIR, `${slug}.png`);
    await page.screenshot({ path: outPng });

    console.log(`✔️  Generated ${outPng}`);
    // clean up the tmp .html if you like:
await unlink(tmpFile);
  }

  await browser.close();
  console.log("All OG images generated.");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
