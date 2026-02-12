import { defineConfig, devices } from '@playwright/test';

// https://playwright.dev/docs/test-configuration
export default defineConfig({
    testDir: './tests',
    timeout: process.env.CI ? 300000 : 0, // 5 minutes
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    reporter: 'html',

    use: {
        baseURL: 'http://localhost:4173',
        trace: 'on-first-retry',
    },

    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
        {
            name: 'firefox',
            use: { ...devices['Desktop Firefox'] },
        },
        {
            name: 'webkit',
            use: { ...devices['Desktop Safari'] },
        },
    ],

    webServer: {
        command: process.env.CI ? 'npm run preview' : 'npm run build && npm run preview',
        url: 'http://localhost:4173',
        reuseExistingServer: !process.env.CI,
    },
});
