import {
  chromium,
  type Browser,
  type BrowserContextOptions,
  type LaunchOptions,
  type Page,
} from '@playwright/test';
export const browserChannel =
  process.env.JALWEB_BROWSER ?? (process.platform === 'win32' ? 'msedge' : 'chromium');
export function launchBrowser(options: LaunchOptions = {}) {
  return chromium.launch({ headless: true, ...options, channel: browserChannel });
}
// Tests opt into their initial state explicitly; production defaults remain unchanged.
export async function newAppContext(
  browser: Browser,
  { theme = 'vs-dark', ...options }: BrowserContextOptions & { theme?: string | null } = {},
) {
  const context = await browser.newContext({ locale: 'ja-JP', ...options });
  if (theme !== null)
    await context.addInitScript((value) => {
      try {
        if (!localStorage.getItem('jalweb.theme')) localStorage.setItem('jalweb.theme', value);
      } catch {
        /* about:blank/file picker frames have no storage */
      }
    }, theme);
  return context;
}
export async function newAppPage(browser: Browser, options?: Parameters<typeof newAppContext>[1]) {
  return (await newAppContext(browser, options)).newPage();
}
export async function runHello(page: Page) {
  await page.locator('#run-options').click();
  await page.locator('#run-with-debugger').click();
  await page
    .locator('.debug-toolbar [data-command="debug-continue"]:visible')
    .waitFor({ timeout: 60000 })
    .catch(async (error) => {
      error.message +=
        '\nState: ' +
        (await page.locator('#state').textContent()) +
        '\nOutput: ' +
        (await page.locator('#output').textContent());
      throw error;
    });
  await page.locator('.debug-toolbar [data-command="debug-continue"]:visible').click();
  await page.waitForFunction(
    () => (document.querySelector('#output')?.textContent ?? '').trim().length > 0,
  );
}

export async function createTestProject(page: Page) {
  await page.getByRole('tab', { name: 'HelloWorld', exact: true }).waitFor();
  await page.locator('#menu-file').click();
  await page.locator('#new-project').click();
  await page.getByRole('tab', { name: 'Main', exact: true }).waitFor();
}

export async function detachAt(page: Page, rect: { x: number; y: number }) {
  // Playwright cannot release a native drag on the desktop. Exercise the same
  // dragstart/dragend handlers with an explicit outside release position.
  await page.evaluate((rect) => {
    const tab = [...document.querySelectorAll('[role=tab]')].find((node) => {
      const box = node.getBoundingClientRect();
      return Math.abs(box.x - rect.x) < 1 && Math.abs(box.y - rect.y) < 1 && box.width > 0;
    });
    if (!tab) throw new Error('Tab moved before detach');
    const data = new DataTransfer();
    Object.defineProperty(data, 'dropEffect', { value: 'none', configurable: true });
    tab.dispatchEvent(
      new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: data }),
    );
    tab.dispatchEvent(
      new DragEvent('dragend', {
        bubbles: true,
        dataTransfer: data,
        clientX: innerWidth + 20,
        clientY: 100,
      }),
    );
  }, rect);
}
