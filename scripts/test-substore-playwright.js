const { chromium } = require('playwright');

const url = process.env.SUBSTORE_URL || 'http://192.168.100.135:9001/subs';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const consoleMessages = [];
  const failedRequests = [];

  page.on('console', (message) => {
    consoleMessages.push(`${message.type()}: ${message.text()}`);
  });
  page.on('requestfailed', (request) => {
    failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText || ''}`);
  });

  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  const bodyText = await page.locator('body').innerText({ timeout: 5000 });
  const hasBackendDialog = bodyText.includes('后端连接配置');
  const hasNetworkError = bodyText.includes('Network Error') || bodyText.includes('网络错误');
  const hasConnectFailed = bodyText.includes('连接失败');

  console.log(`URL: ${url}`);
  console.log(`TITLE: ${await page.title()}`);
  console.log(`BODY_SNIPPET: ${bodyText.replace(/\s+/g, ' ').slice(0, 500)}`);
  if (consoleMessages.length) {
    console.log('CONSOLE_MESSAGES:');
    consoleMessages.forEach((line) => console.log(line));
  }
  if (failedRequests.length) {
    console.log('FAILED_REQUESTS:');
    failedRequests.forEach((line) => console.log(line));
  }

  await browser.close();

  const hitsOfficialBackend = consoleMessages.some((line) => line.includes('https://sub.store'))
    || failedRequests.some((line) => line.includes('https://sub.store'));

  if (hasBackendDialog || hasNetworkError || hasConnectFailed || hitsOfficialBackend || failedRequests.length > 0) {
    process.exit(1);
  }
})();
