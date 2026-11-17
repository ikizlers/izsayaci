const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(String(e))); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()) });
  await page.addInitScript(() => {
    window.__cb = null;
    navigator.geolocation.watchPosition = (ok) => { window.__cb = ok; return 1; };
    window.__fix = (lat, lon, t) => window.__cb && window.__cb({ coords: { latitude: lat, longitude: lon, accuracy: 4, speed: 2.2 }, timestamp: t });
  });
  await page.goto('file:///home/claude/izsayaci/index.html');
  // yol: kuzeye 250 m, U dönüşü, güneye 250 m, ... 4 sıra
  const lat0 = 39, lon0 = 35, k = 111320, kl = k * Math.cos(lat0 * Math.PI / 180), W = 4;
  let t = 1e12, pts = [];
  const go = (e, n, c) => { for (let s = 0; s <= 250; s += 2.2) pts.push([c, e > 0 ? s : 250 - s]); };
  let c = 0, dir = 1;
  for (let r = 0; r < 5; r++) {
    go(dir, 0, c);
    for (let i = 1; i <= 30; i++) { const a = Math.PI * i / 30; pts.push([c + W * (1 - Math.cos(a)) / 2, (dir > 0 ? 250 : 0) + dir * 14 * Math.sin(a)]); }
    c += W; dir = -dir;
  }
  let first = true, alerts = 0, shots = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = pts[i];
    await page.evaluate(([la, lo, tt]) => window.__fix(la, lo, tt), [lat0 + y / k, lon0 + x / kl, t += 1000]);
    if (i === 3 && first) { first = false; await page.click('#bA'); }
    if (await page.$eval('#alert', e => e.classList.contains('on'))) { alerts++; if (!shots) { shots = 1; await page.screenshot({ path: 'ui_alert.png' }); } await page.click('#alert'); }
  }
  console.log('sayı:', await page.$eval('#num', e => e.textContent), '| alt:', await page.$eval('#sub', e => e.textContent), '| uyarı:', alerts);
  await page.screenshot({ path: 'ui_main.png' });
  console.log('hatalar:', errs);
  await b.close();
})();
