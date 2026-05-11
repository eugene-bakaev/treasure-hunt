import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:3000');
  
  // Enter nickname
  await page.type('#nickname', 'Puppeteer');
  
  // Click Create Match
  await Promise.all([
    page.waitForNavigation(),
    page.click('button'),
  ]);

  // Read URL
  const url = page.url();
  console.log('Created match:', url);
  
  // Read DOM to see if it says "Waiting for opponent"
  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log('Body contains "Waiting for opponent":', bodyText.includes('Waiting for opponent'));

  await browser.close();
})();
