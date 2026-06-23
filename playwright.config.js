const { defineConfig } = require('@playwright/test');

const useDevServer = process.env.PLAYWRIGHT_DEV_SERVER === '1';

const config = {
  testDir: './e2e',
  testMatch: '**/*.e2e.js',
  timeout: 60000,
  use: {
    browserName: 'chromium',
    headless: true,
    serviceWorkers: 'block',
  },
};

if (useDevServer) {
  config.webServer = {
    command: 'PORT=19091 CLASH_API_BASE=http://192.168.100.135:9090 bun server/proxy-ui.mjs',
    url: 'http://127.0.0.1:19091',
    reuseExistingServer: true,
  };
}

module.exports = defineConfig(config);
