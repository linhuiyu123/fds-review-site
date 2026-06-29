import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto('http://127.0.0.1:5173/');
await page.getByRole('button', { name: /^F\s+F$/ }).click();
await page.getByRole('button', { name: '提交并判题' }).click();
await page.getByText('答对了').waitFor();
await page.getByText('标准答案', { exact: true }).waitFor();
await page.screenshot({ path: 'output/playwright/graded-desktop.png', fullPage: true });
await browser.close();
