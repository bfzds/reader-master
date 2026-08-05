import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

describe('Tauri TXT import smoke flow', () => {
  it('imports a temporary TXT file and opens it for reading', async () => {
    const fixturePath = process.env.TAURI_E2E_FIXTURE_PATH;
    assert.ok(fixturePath, 'E2E fixture path is required');

    await browser.url('http://127.0.0.1:2333/#!/');
    const currentUrl = await browser.getUrl();
    assert.match(currentUrl, /^http:\/\/127\.0\.0\.1:2333(?:\/|$)/);

    const listPage = await browser.$('#list_page');
    await listPage.waitForDisplayed({ timeout: 30000 });

    const fileInput = await browser.$('#file');
    await fileInput.waitForExist({ timeout: 30000 });
    const fixtureBytes = Array.from(await readFile(fixturePath));
    await browser.execute((bytes, name) => {
      const input = document.querySelector('#file');
      const transfer = new DataTransfer();
      transfer.items.add(new File([Uint8Array.from(bytes)], name, { type: 'text/plain' }));
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, fixtureBytes, 'e2e-smoke.txt');

    const book = await browser.$('#file_list .list-item-container');
    await book.waitForDisplayed({ timeout: 30000 });
    assert.match(await book.getText(), /e2e-smoke/);

    await book.click();
    assert.match(await browser.getUrl(), /http:\/\/127\.0\.0\.1:2333\/#!\/read\/\d+$/);

    const body = await browser.$('#read_page .read-body');
    await body.waitForDisplayed({ timeout: 30000 });
    assert.match(await body.getText(), /E2E TXT smoke content/);
  });
});
