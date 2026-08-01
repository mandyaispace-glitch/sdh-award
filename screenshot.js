const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
    console.log("Launching browser...");
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
    page.on('response', response => {
        if (!response.ok()) console.log("PAGE NET ERROR:", response.status(), response.url());
    });

    // Set viewport
    await page.setViewport({ width: 1440, height: 900 });

    const localUrl = 'file://' + path.join(__dirname, 'podcast_evaluation_workflow.html') + '#awards-top10';
    console.log("Navigating to:", localUrl);
    
    await page.goto(localUrl, { waitUntil: 'networkidle0' });

    // Wait for the container to be populated
    console.log("Waiting for rendering...");
    await page.waitForFunction(() => {
        const el = document.getElementById('poc-awards-container-track-a');
        return el && el.innerHTML.length > 500; // should be ~290k
    }, { timeout: 3000 }).catch(e => console.log("Wait timeout:", e.message));

    const htmlLen = await page.evaluate(() => {
        return document.getElementById('poc-awards-container-track-a').innerHTML.length;
    });
    console.log("Track A HTML Length in real browser:", htmlLen);

    await browser.close();
})();
