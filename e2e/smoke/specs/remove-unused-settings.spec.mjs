import assert from 'node:assert/strict';

describe('Tauri settings cleanup', () => {
  it('does not show unused install or help entries', async () => {
    await browser.url('http://127.0.0.1:2333/#!/settings');

    const configPage = await browser.$('#config_page');
    await configPage.waitForDisplayed({ timeout: 30000 });

    const visibleText = await configPage.getText();
    assert.doesNotMatch(visibleText, /(?:Install Web App|安装网页应用)/);
    assert.doesNotMatch(visibleText, /Open Source Credits/);
    assert.doesNotMatch(visibleText, /Privacy Policy/);
    assert.doesNotMatch(visibleText, /(?:About|关于)/);
    assert.doesNotMatch(visibleText, /(?:Help|帮助)/);
  });
});
