const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    navigator.geolocation.watchPosition = (ok) => { window.__cb = ok; return 1; };
    window.__fix = (lat, lon, t) => window.__cb && window.__cb({ coords: { latitude: lat, longitude: lon, accuracy: 4, speed: 2.2 }, timestamp: t });
  });
  await page.goto('file:///home/claude/izsayaci/index.html');
  const out = '/home/claude/shots/';
  const lat0 = 39, lon0 = 35, k = 111320, kl = k * Math.cos(lat0 * Math.PI / 180), W = 4;
  let t = 1e12;
  const fix = (x, y) => page.evaluate(([la, lo, tt]) => window.__fix(la, lo, tt), [lat0 + y / k, lon0 + x / kl, t += 1000]);
  await fix(0, 0); await page.waitForTimeout(1100);
  await page.screenshot({ path: out + '1_baslangic.png' });
  await page.click('#bA');
  for (let s = 0; s <= 20; s += 2.2) await fix(0, s);
  await page.waitForTimeout(1100); await page.screenshot({ path: out + '2_hat_cizimi.png' });
  const path = []; let c = 0, dir = 1;
  for (let r = 0; r < 3; r++) {
    for (let s = 0; s <= 250; s += 2.2) path.push([c, dir > 0 ? s : 250 - s]);
    for (let i = 1; i <= 30; i++) { const a = Math.PI * i / 30; path.push([c + W * (1 - Math.cos(a)) / 2, (dir > 0 ? 250 : 0) + dir * 14 * Math.sin(a)]); }
    c += W; dir = -dir;
  }
  let shotA = false, shotP = false, i = 0;
  for (const [x, y] of path.slice(9)) {
    await fix(x, y); i++;
    if (await page.$eval('#alert', e => e.classList.contains('on'))) {
      if (!shotA) { shotA = true; await page.waitForTimeout(100); await page.screenshot({ path: out + '3_iz_uyarisi.png' }); }
      await page.click('#alert');
    }
    if (!shotP && i === 60) { shotP = true; await page.screenshot({ path: out + '4_sira_ici.png' }); }
  }
  await page.waitForTimeout(1100);
  await page.click('#bSet'); await page.screenshot({ path: out + '5_ayarlar.png' });
  await b.close();
})();
