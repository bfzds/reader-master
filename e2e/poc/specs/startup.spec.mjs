import assert from 'node:assert/strict';

describe('Tauri WebDriver feasibility', () => {
  it('starts the app, keeps the fixed origin, and performs one stable click', async () => {
    const currentUrl = await browser.getUrl();
    assert.match(currentUrl, /^http:\/\/127\.0\.0\.1:2333(?:\/|$)/);

    const listPage = await browser.$('#list_page');
    await listPage.waitForExist({ timeout: 30000 });
    assert.equal(await listPage.isExisting(), true);

    const searchInput = await browser.$('#list_page .search-input');
    await searchInput.waitForExist({ timeout: 30000 });
    await searchInput.click();
    assert.equal(await searchInput.isFocused(), true);
  });
});
