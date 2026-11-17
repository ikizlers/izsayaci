const { chromium } = require('playwright'); const fs = require('fs');
(async () => { try {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, acceptDownloads: true });
  var page = await ctx.newPage(); var errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  const answers = []; page.on('dialog', d => d.accept(d.type() === 'prompt' ? (answers.shift() ?? d.defaultValue()) : undefined));
  await page.addInitScript(() => {
    navigator.geolocation.watchPosition = (ok) => { window.__cb = ok; return 1; };
    window.__fix = (lat, lon, t) => window.__cb && window.__cb({ coords: { latitude: lat, longitude: lon, accuracy: 4, speed: 2.2 }, timestamp: t });
  });
  await page.goto('file:///home/claude/izsayaci/index.html');
  const lat0 = 39, lon0 = 35, k = 111320, kl = k * Math.cos(lat0 * Math.PI / 180), W = 4; let t = 1e12;
  const fix = (x, y) => page.evaluate(([la, lo, tt]) => window.__fix(la, lo, tt), [lat0 + y / k, lon0 + x / kl, t += 1000]);
  await fix(0, 0); await page.click('#bA');
  let c = 0, dir = 1; const path = [];
  for (let r = 0; r < 6; r++) {
    for (let s = (r ? 0 : 2.2); s <= 200; s += 2.2) path.push([c, dir > 0 ? s : 200 - s]);
    for (let i = 1; i <= 30; i++) { const a = Math.PI * i / 30; path.push([c + W * (1 - Math.cos(a)) / 2, (dir > 0 ? 200 : 0) + dir * 14 * Math.sin(a)]); }
    c += W; dir = -dir;
  }
  for (const [x, y] of path) { await fix(x, y); if (await page.$eval('#alert', e => e.classList.contains('on'))) await page.click('#alert'); }

  // tarla bilgisi
  await page.click('#fieldBtn'); await page.click('.fl button:text("Bilgi")');
  await page.fill('#bUrun', 'Buğday'); await page.fill('#bTohum', '18'); await page.fill('#bTarih', '2026-11-17'); await page.click('#bSave');
  await page.click('#bRep'); await page.waitForTimeout(200);
  console.log('RAPOR:', (await page.$eval('#rep', e => e.innerText)).replace(/\n/g, ' | '));
  await page.screenshot({ path: '/home/claude/shots/f1_rapor.png' });
  // GPX / CSV
  let [dl] = await Promise.all([page.waitForEvent('download'), page.click('#bGpx')]); let p = await dl.path(); let g = fs.readFileSync(p, 'utf8');
  console.log('GPX', dl.suggestedFilename(), 'trk:', (g.match(/<trk>/g) || []).length, 'trkseg:', (g.match(/<trkseg>/g) || []).length, 'trkpt:', (g.match(/<trkpt/g) || []).length, g.slice(0, 60).replace(/\n/g, ' '));
  [dl] = await Promise.all([page.waitForEvent('download'), page.click('#bCsv')]); const csv = fs.readFileSync(await dl.path(), 'utf8');
  console.log('CSV', dl.suggestedFilename(), csv.split('\n').slice(0, 3));
  // sentetik çakışma/boşluk
  const syn = await page.evaluate(() => {
    const mk = sp => { const segs = []; for (let i = 0; i < 8; i++) { const p = []; for (let y = 0; y <= 200; y += 2) p.push(i * sp, i % 2 ? 200 - y : y); segs.push({ t: 0, w: 4, p }); } return { fo: { lat: 39, lon: 35 }, segs, state: null }; };
    const f = r => r ? { over: r.overPct.toFixed(1), gap: r.gapPct.toFixed(1), da: r.uniqueDa.toFixed(1) } : null;
    return { tam: f(__izDebug.computeReport(mk(4))), cakisma: f(__izDebug.computeReport(mk(3))), bosluk: f(__izDebug.computeReport(mk(5))) };
  });
  console.log('SENTETİK (4 m alet): tam sıralama / 3 m aralık(%25 çakışma bekl.) / 5 m aralık(%20 boşluk bekl.)', JSON.stringify(syn));
  // alet
  await page.click('#bCloseB'); await page.click('#fClose'); await page.click('#bSet'); await page.click('#sImpBtn');
  answers.push('Püskürtme', '12', '0'); await page.click('#iAdd');
  await page.screenshot({ path: '/home/claude/shots/f2_aletler.png' });
  await page.click('#iList .fl:nth-child(1) .nm'); await page.waitForTimeout(100); // ekim aleti zaten seçili
  await page.click('#iList .fl:nth-child(2) .nm'); await page.waitForTimeout(100);
  console.log('Alet sonrası genişlik:', await page.evaluate(() => __izDebug.S.width), 'aralık:', await page.evaluate(() => __izDebug.S.interval), 'faz:', await page.evaluate(() => __izDebug.T.snapshot().phase));
  await page.click('#iList .fl:nth-child(1) .nm'); await page.click('#iClose');
  await page.click('#bSet'); await page.fill('#sSpr', '12'); await page.click('#sOk');
  console.log('Püskürtme 12 m / ekim', await page.evaluate(() => __izDebug.S.width), '→ aralık', await page.evaluate(() => __izDebug.S.interval));
  // yedek
  await page.click('#fieldBtn'); [dl] = await Promise.all([page.waitForEvent('download'), page.click('#fBackup')]);
  const bk = fs.readFileSync(await dl.path(), 'utf8'); const bj = JSON.parse(bk);
  console.log('YEDEK', dl.suggestedFilename(), 'tarla:', bj.fields.length, 'seg:', bj.fields[0].data.segs.length, 'ürün:', bj.fields[0].info.urun);
  await page.click('#fRestore'); 
  await page.setInputFiles('#fFile', await dl.path()); await page.waitForTimeout(800);
  console.log('Yükleme sonrası ürün:', await page.evaluate(() => JSON.parse(localStorage.getItem('iz_fields'))[0].urun));
  console.log('hatalar', errs); await b.close(); } catch (e) { console.log('HATA', String(e).slice(0,200)); }
})();
