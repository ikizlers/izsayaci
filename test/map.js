const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(String(e))); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()) });
  await page.addInitScript(() => {
    navigator.geolocation.watchPosition = (ok) => { window.__cb = ok; return 1; };
    window.__fix = (lat, lon, t) => window.__cb && window.__cb({ coords: { latitude: lat, longitude: lon, accuracy: 4, speed: 2.2 }, timestamp: t });
  });
  await page.goto('file:///home/claude/izsayaci/index.html');
  const lat0 = 39, lon0 = 35, k = 111320, kl = k * Math.cos(lat0 * Math.PI / 180), W = 4; let t = 1e12;
  const fix = (x, y) => page.evaluate(([la, lo, tt]) => window.__fix(la, lo, tt), [lat0 + y / k, lon0 + x / kl, t += 1000]);
  await fix(0, 0); await page.click('#bA');
  const path = []; let c = 0, dir = 1;
  for (let r = 0; r < 7; r++) {
    for (let s = (r ? 0 : 2); s <= 150; s += 2.2) path.push([c, dir > 0 ? s : 150 - s]);
    for (let i = 1; i <= 30; i++) { const a = Math.PI * i / 30; path.push([c + W * (1 - Math.cos(a)) / 2, (dir > 0 ? 150 : 0) + dir * 14 * Math.sin(a)]); }
    c += W; dir = -dir;
  }
  let n = 0;
  for (const [x, y] of path) { await fix(x, y); if (await page.$eval('#alert', e => e.classList.contains('on'))) await page.click('#alert'); ++n; }
  await page.click('#bSet'); await page.evaluate(()=>{document.getElementById('sCol').value='#2e86ff';document.getElementById('sColT').value='#ff3df0'}); await page.click('#sOk');
  await page.click('#tMap'); await page.waitForTimeout(300);
  await page.screenshot({ path: '/home/claude/shots/m1_takip.png' });
  await page.click('#mFit'); await page.waitForTimeout(200);
  await page.screenshot({ path: '/home/claude/shots/m2_tum.png' });
  await page.click('#tMain'); await page.click('#fieldBtn'); await page.waitForTimeout(100);
  await page.screenshot({ path: '/home/claude/shots/m3_tarlalar.png' });
  console.log('segs', await page.evaluate(() => __izDebug.F.cur.segs.map(s => s.t + ':' + s.p.length / 2).join(' ')));
  await page.reload(); await page.waitForTimeout(300);
  console.log('reload: tarla', await page.$eval('#fieldBtn', e => e.textContent), 'segs', await page.evaluate(() => __izDebug.F.cur.segs.length), 'msg', await page.$eval('#msg', e => e.textContent));
  console.log('hatalar', errs);
  await b.close();
})();
