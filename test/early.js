const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.addInitScript(() => {
    navigator.geolocation.watchPosition = (ok) => { window.__cb = ok; return 1; };
    window.__fix = (lat, lon, t) => window.__cb && window.__cb({ coords: { latitude: lat, longitude: lon, accuracy: 4, speed: 3.3 }, timestamp: t });
  });
  await page.goto('file:///home/claude/izsayaci/index.html');
  const lat0 = 39, lon0 = 35, k = 111320, kl = k * Math.cos(lat0 * Math.PI / 180), W = 4; let t = 1e12;
  const fix = (x, y) => page.evaluate(([la, lo, tt]) => window.__fix(la, lo, tt), [lat0 + y / k, lon0 + x / kl, t += 1000]);
  await fix(0, 0); await page.click('#bA');
  const path = []; let c = 0, dir = 1;
  for (let r = 0; r < 4; r++) {
    for (let s = (r ? 0 : 3.3); s <= 250; s += 3.3) path.push([c, dir > 0 ? s : 250 - s, r]);
    for (let i = 1; i <= 16; i++) { const a = Math.PI * i / 16; path.push([c + W * (1 - Math.cos(a)) / 2, (dir > 0 ? 250 : 0) + dir * 14 * Math.sin(a), r + 0.5]); }
    c += W; dir = -dir;
  }
  let badgeSeen = false, alertAt = null, shot = false;
  for (const [x, y, tag] of path) {
    await fix(x, y);
    const badge = await page.$eval('#nextBadge', e => e.classList.contains('on'));
    if (badge && !badgeSeen) { badgeSeen = tag; if (!shot) { shot = true; await page.screenshot({ path: '/home/claude/shots/e1_rozet.png' }); } }
    if (alertAt === null && await page.$eval('#alert', e => e.classList.contains('on'))) alertAt = tag;
  }
  console.log('rozet ilk görüldüğü sıra(tag):', badgeSeen, '| büyük uyarı ilk tag:', alertAt, '(x.5 = dönüş)', errs);
  await b.close();
})();
