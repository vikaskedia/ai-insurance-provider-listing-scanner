/**
 * Stagehand connection helper.
 *
 * Connects a Stagehand instance to an already-running
 * Chrome browser via its CDP WebSocket endpoint.
 */

import { Stagehand } from "@browserbasehq/stagehand";

/**
 * @param {string} wsEndpoint – Chrome DevTools WebSocket URL
 * @param {string} [model]    – AI model identifier
 * @returns {Promise<{ stagehand: Stagehand, page: import("puppeteer").Page }>}
 */
export async function connectStagehand(
    wsEndpoint,
    model = "google/gemini-2.5-flash",
) {
    const stagehand = new Stagehand({
        env: "LOCAL",
        headless: false,
        enableCaching: false,
        model,
        localBrowserLaunchOptions: {
            cdpUrl: wsEndpoint,
        },
    });

    await stagehand.init();
    const page = stagehand.context.pages()[0];
    return { stagehand, page };
}
