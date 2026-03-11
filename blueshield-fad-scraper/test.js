import "dotenv/config";
import { Stagehand } from "@browserbasehq/stagehand";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
    console.log("🚀 Launching browser...");
    const stagehand = new Stagehand({
        env: "LOCAL",
        headless: false,
        enableCaching: false,
        model: "google/gemini-2.5-flash",
        localBrowserLaunchOptions: {
            executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            userDataDir: join(__dirname, "user_data"),
            args: [
                "--window-size=1440,900",
                "--window-position=0,0",
                "--disable-blink-features=AutomationControlled",
                "--disable-infobars",
                "--no-restore-last-session",
                "--disable-session-crashed-bubble",
                "--no-sandbox",
            ],
            viewport: { width: 1440, height: 900 },
            ignoreDefaultArgs: ["--enable-automation"],
        },
    });

    await stagehand.init();
    const page = stagehand.context.activePage();

    // Navigate to Google
    console.log("🌐 Navigating to google.com...");
    await page.goto("https://www.google.com", {
        waitUntil: "domcontentloaded",
        timeout: 30000,
    });
    await page.waitForTimeout(2000);

    // Type the search query into Google's search box via CDP (trusted input events)
    console.log('🔍 Focusing search box...');
    await page.evaluate(() => {
        const input = document.querySelector('input[name="q"], textarea[name="q"]');
        if (input) { input.focus(); input.click(); }
    });
    await page.waitForTimeout(500);

    console.log('⌨️  Typing search query...');
    await page.sendCDP('Input.insertText', { text: 'SavantCare Mental Health Clinic' });
    await page.waitForTimeout(500);

    // Press Enter to submit the search
    await page.sendCDP('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', windowsVirtualKeyCode: 13 });
    await page.sendCDP('Input.dispatchKeyEvent', { type: 'keyUp',   key: 'Enter', windowsVirtualKeyCode: 13 });
    console.log('🔎 Search submitted, waiting for results...');
    await page.waitForTimeout(3000);

    // Click the first organic search result (h3 inside an anchor)
    console.log('🖱️  Clicking first search result...');
    const clicked = await page.evaluate(() => {
        // Google results: first <a> that wraps an <h3>
        const firstResult = document.querySelector('#search a:has(h3), #rso a:has(h3)');
        if (firstResult) {
            firstResult.click();
            return firstResult.href || firstResult.textContent?.trim().substring(0, 80);
        }
        return null;
    });

    if (clicked) {
        console.log(`✅ Clicked result: ${clicked}`);
    } else {
        console.log('⚠️  DOM click failed, trying Stagehand act()...');
        await stagehand.act('Click on the first search result link');
    }

    await page.waitForTimeout(4000);
    console.log('✅ Done. Current URL:', await page.evaluate(() => location.href));

    await stagehand.close();
}

main().catch((err) => {
    console.error("❌ Fatal error:", err.message);
    process.exit(1);
});
