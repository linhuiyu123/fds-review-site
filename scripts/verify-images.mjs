import { chromium } from 'playwright';
import questions from '../src/data/questions.generated.json' with { type: 'json' };

const baseUrl = process.env.APP_URL ?? 'http://127.0.0.1:5173';
const imageSources = Array.from(new Set(questions.flatMap((question) => (question.images ?? []).map((image) => image.src))));

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage();
await page.setContent(
  `<!doctype html>${imageSources
    .map((src, index) => `<img id="img-${index}" src="${new URL(src, baseUrl).toString()}" alt="">`)
    .join('')}`
);
await page.waitForFunction(() => Array.from(document.images).every((image) => image.complete), null, { timeout: 15000 });

const results = await page.evaluate(() =>
  Array.from(document.images).map((image) => ({
    src: image.getAttribute('src'),
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight
  }))
);
await browser.close();

const failed = results.filter((image) => image.naturalWidth === 0 || image.naturalHeight === 0);
if (failed.length) {
  console.error(JSON.stringify({ total: results.length, failed }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ total: results.length, failed: 0 }, null, 2));
}
