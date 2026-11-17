(function () {
'use strict';
var $ = function (i) { return document.getElementById(i); };
var D2R = Math.PI / 180, R = 6371000;
var LS = {
  get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set: function (k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
  del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
};

// ---------- ayarlar ----------
var S = { width: 4, interval: 3, sound: true, vib: true, skip: false, col: '#3ecf6e', colT: '#ffb400', off: 0 };
try { var sv = JSON.parse(LS.get('iz_set') || '{}'); for (var k in sv) S[k] = sv[k]; } catch (e) {}
function findImp(id) { for (var i = 0; i < S.imps.length; i++) if (S.imps[i].id === id) return S.imps[i]; return null; }
if (!Array.isArray(S.imps) || !S.imps.length) S.imps = [{ id: 'i1', name: 'Ekim makinesi', w: S.width || 4, off: S.off || 0 }];
if (!S.impId || !findImp(S.impId)) S.impId = S.imps[0].id;
S.sprayW = S.sprayW || 0;
S.width = findImp(S.impId).w; S.off = findImp(S.impId).off || 0;
var T = IzCore.createTracker({ width: S.width, interval: S.interval, allowSkip: S.skip });
function recalcInterval() { if (S.sprayW > 0) S.interval = Math.max(2, Math.min(12, Math.round(S.sprayW / S.width))); }
function saveSettings() { LS.set('iz_set', JSON.stringify(S)); }
function setImp(id) {
  var im = findImp(id); if (!im) return;
  S.impId = id; S.width = im.w; S.off = im.off || 0; recalcInterval();
  T.setConfig({ width: S.width, interval: S.interval }); saveSettings();
}
var pend = [], lastAcc = null, lastFixT = 0, alertedFor = null, wake = null, audio = null, lastFix = null;

// ---------- tarlalar ----------
var F = { list: [], active: null, cur: null, curSeg: null, dirty: false };
function loadList() { try { F.list = JSON.parse(LS.get('iz_fields') || '[]'); } catch (e) { F.list = []; } }
function saveList() { LS.set('iz_fields', JSON.stringify(F.list)); LS.set('iz_active', F.active || ''); }
function fieldInfo(id) { for (var i = 0; i < F.list.length; i++) if (F.list[i].id === id) return F.list[i]; return null; }
function segLen(seg) { var d = 0, p = seg.p; for (var i = 2; i < p.length; i += 2) d += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]); return d; }
function areaHa(cur) { var a = 0; cur.segs.forEach(function (s) { a += segLen(s) * s.w; }); return a / 10000; }
function saveCur() {
  if (!F.cur || !F.active) return;
  try { F.cur.state = T.serialize(); } catch (e) {}
  var ok = LS.set('iz_f_' + F.active, JSON.stringify(F.cur));
  var inf = fieldInfo(F.active);
  if (inf) { inf.ha = Math.round(areaHa(F.cur) * 100) / 100; inf.passNo = T.snapshot().passNo; inf.t = Date.now(); saveList(); }
  F.dirty = false;
  if (!ok) { $('msg').className = 'warn'; $('msg').textContent = 'Kayıt alanı dolu! Eski tarlaları sil.'; }
}
function loadField(id) {
  var raw = LS.get('iz_f_' + id), c = null;
  try { c = JSON.parse(raw); } catch (e) {}
  F.cur = c && c.segs ? c : { fo: null, segs: [], state: null };
  F.active = id; F.curSeg = null; alertedFor = null; pend = [];
  var inf0 = fieldInfo(id);
  if (inf0) { if (inf0.imp && findImp(inf0.imp)) setImp(inf0.imp); else inf0.imp = S.impId; }
  T.reset();
  if (F.cur.state) T.restore(F.cur.state);
  $('alert').classList.remove('on');
  saveList(); updFieldBtn();
}
function switchField(id) { saveCur(); loadField(id); render(); drawMap(); }
function newField(name) {
  var id = 'f' + Date.now().toString(36);
  F.list.push({ id: id, name: name, ha: 0, passNo: 0, t: Date.now(), tarih: today(), imp: S.impId });
  saveCur(); LS.set('iz_f_' + id, JSON.stringify({ fo: null, segs: [], state: null }));
  loadField(id); render(); drawMap();
}
function today() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
function updFieldBtn() { var i = fieldInfo(F.active); $('fieldBtn').textContent = (i ? i.name : 'Tarla') + ' ▾'; }
function renderFields() {
  var box = $('fList'); box.innerHTML = '';
  F.list.forEach(function (f) {
    var row = document.createElement('div'); row.className = 'fl' + (f.id === F.active ? ' act' : '');
    var nm = document.createElement('div'); nm.className = 'nm';
    nm.innerHTML = '<b></b><small></small>'; nm.firstChild.textContent = f.name;
    var da = ((f.id === F.active && F.cur ? areaHa(F.cur) : (f.ha || 0)) * 10).toFixed(1);
    nm.lastChild.textContent = [f.urun, f.tarih, '≈ ' + da + ' dekar'].filter(Boolean).join(' · ');
    nm.onclick = function () { if (f.id !== F.active) switchField(f.id); $('fsheet').classList.remove('on'); };
    var bi = document.createElement('button'); bi.textContent = 'Bilgi'; bi.onclick = function () { openInfo(f.id); };
    var bd = document.createElement('button'); bd.textContent = 'Sil';
    bd.onclick = function () {
      if (!confirm('"' + f.name + '" tarlası tamamen silinsin mi?')) return;
      LS.del('iz_f_' + f.id); F.list = F.list.filter(function (x) { return x.id !== f.id; });
      if (f.id === F.active) { if (!F.list.length) F.list.push({ id: 'f' + Date.now().toString(36), name: 'Tarla 1', ha: 0, passNo: 0, tarih: today(), imp: S.impId }); F.cur = null; loadField(F.list[0].id); render(); drawMap(); }
      saveList(); renderFields();
    };
    row.appendChild(nm); row.appendChild(bi); row.appendChild(bd); box.appendChild(row);
  });
}
$('fieldBtn').onclick = function () { renderFields(); $('fsheet').classList.add('on'); };
$('fClose').onclick = function () { $('fsheet').classList.remove('on'); };
$('fAdd').onclick = function () {
  var n = prompt('Yeni tarla adı', 'Tarla ' + (F.list.length + 1));
  if (n && n.trim()) { newField(n.trim().slice(0, 30)); renderFields(); }
};

// ---------- ses / titreşim ----------
function beep() {
  try {
    if (!S.sound) return;
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    for (var i = 0; i < 4; i++) {
      var o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime + i * 0.35;
      o.type = 'square'; o.frequency.value = i % 2 ? 880 : 1200; g.gain.value = 0.5;
      o.connect(g); g.connect(audio.destination); o.start(t); o.stop(t + 0.25);
    }
  } catch (e) {}
}
function vibrate() { try { if (S.vib && navigator.vibrate) navigator.vibrate([400, 150, 400, 150, 400]); } catch (e) {} }
function showAlert(L) { if (alertedFor === L) return; alertedFor = L; $('alert').classList.add('on'); beep(); vibrate(); }
$('alert').onclick = function () { $('alert').classList.remove('on'); };

// ---------- boyama ----------
function toLocal(lat, lon) {
  var fo = F.cur.fo;
  return { x: (lon - fo.lon) * D2R * R * Math.cos(fo.lat * D2R), y: (lat - fo.lat) * D2R * R };
}
function r1(v) { return Math.round(v * 10) / 10; }
function paint(fix, s) {
  if (!F.cur) return;
  if (s.phase !== 'IN_PASS' || s.speed < 0.7) { F.curSeg = null; return; }
  if (!F.cur.fo) F.cur.fo = { lat: fix.lat, lon: fix.lon };
  var p = toLocal(fix.lat, fix.lon);
  if (S.off > 0) {
    var hd = (s.dir > 0 ? s.phi0 : s.phi0 + 180) * D2R;
    p.x -= Math.sin(hd) * S.off; p.y -= Math.cos(hd) * S.off;
  }
  var tram = (s.anchorR !== null && s.isTram) ? 1 : 0, seg = F.curSeg, W = S.width;
  var lastX = null, lastY = null;
  if (seg) { lastX = seg.p[seg.p.length - 2]; lastY = seg.p[seg.p.length - 1]; }
  if (seg && Math.hypot(p.x - lastX, p.y - lastY) < 2) return;
  if (!seg || seg.t !== tram || seg.w !== W || Math.hypot(p.x - lastX, p.y - lastY) > 15) {
    var np = (seg && seg.t !== tram && seg.w === W && Math.hypot(p.x - lastX, p.y - lastY) <= 15) ? [lastX, lastY] : [];
    seg = { t: tram, w: W, p: np }; F.cur.segs.push(seg); F.curSeg = seg;
  }
  seg.p.push(r1(p.x), r1(p.y)); F.dirty = true;
}

// ---------- olaylar ----------
function handle(evs) {
  evs.forEach(function (e) {
    if (e.type === 'predict' && e.isTram) showAlert(e.L);
    else if (e.type === 'turn_start' && e.nextTram) showAlert(e.nextL);
    else if (e.type === 'pass') {
      if (e.isTram) showAlert(e.L);
      else { alertedFor = null; $('alert').classList.remove('on'); }
    }
  });
  if (evs.some(function (e) { return e.type === 'pass' || e.type === 'resume' || e.type === 'ab_set'; })) saveCur();
}

// ---------- GPS ----------
function startGps() {
  if (!navigator.geolocation) { $('gtxt').textContent = 'GPS yok'; return; }
  navigator.geolocation.watchPosition(function (p) {
    var c = p.coords; lastAcc = c.accuracy; lastFixT = Date.now();
    var fix = { lat: c.latitude, lon: c.longitude, acc: c.accuracy, speed: (c.speed != null && isFinite(c.speed)) ? c.speed : null, t: p.timestamp || Date.now() };
    var r = T.addFix(fix);
    if (!r.ignored) {
      lastFix = fix;
      handle(r.events);
      var s0 = T.snapshot();
      var bf = r.events.filter(function (e) { return e.runT !== undefined; })[0];
      if (bf && s0.phase === 'IN_PASS') {
        pend.forEach(function (q) { if (q.t >= bf.runT) paint(q, s0); });
        pend = [];
      }
      if (s0.phase === 'IN_PASS') { paint(fix, s0); pend = []; }
      else { pend.push(fix); if (pend.length > 80) pend.shift(); F.curSeg = null; }
    } else handle(r.events);
    render(); if (document.body.classList.contains('map')) drawMap();
  }, function (err) { $('gtxt').textContent = err.code === 1 ? 'Konum izni verilmedi' : 'GPS hatası'; },
  { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
}
async function lockScreen() { try { if (navigator.wakeLock) wake = await navigator.wakeLock.request('screen'); } catch (e) {} }
document.addEventListener('visibilitychange', function () {
  if (document.visibilityState === 'visible') lockScreen(); else saveCur();
});
setInterval(function () { if (F.dirty) saveCur(); }, 15000);

// ---------- sayaç çizimi ----------
function render() {
  var s = T.snapshot(), age = (Date.now() - lastFixT) / 1000, d = $('gdot');
  if (!lastFixT || age > 5) { d.className = 'dot'; $('gtxt').textContent = lastFixT ? 'GPS kesildi' : 'GPS bekleniyor'; }
  else { d.className = 'dot ' + (lastAcc <= 8 ? 'ok' : 'mid'); $('gtxt').textContent = '±' + Math.round(lastAcc) + ' m · ' + (s.speed * 3.6).toFixed(1) + ' km/s'; }
  $('bB').disabled = s.phase !== 'AB_SETTING';
  $('nextBadge').classList.toggle('on', s.phase === 'IN_PASS' && s.nextTram);
  var lab = $('lab'), num = $('num'), sub = $('sub'), msg = $('msg');
  if (!/^Kayıt alanı/.test(msg.textContent)) { msg.className = ''; msg.textContent = ''; }
  if (s.phase === 'NO_AB') { lab.textContent = 'Önce A noktasını işaretle'; num.textContent = '–'; sub.textContent = 'Tarlaya gir, düz gitmeye başla'; $('bA').disabled = !lastFixT; }
  else if (s.phase === 'AB_SETTING') { lab.textContent = 'Hat çiziliyor'; num.textContent = Math.round(s.abDist || 0) + ' m'; sub.textContent = 'Düz git — ' + T.cfg.abAutoDist + ' m sonra otomatik B'; }
  else {
    lab.textContent = s.phase === 'TURNING' ? 'Dönüş — sıradaki' : 'Sıra';
    var pr = s.phase === 'TURNING' && s.predictedL !== null;
    num.textContent = ((pr ? s.predictedL : s.L) + 1);
    var tram = pr ? s.predictedTram : s.isTram;
    if (s.anchorR === null) sub.textContent = 'İz sırası: ilk dönüşten sonra belli olur (veya "Bu iz sırası")';
    else if (tram) sub.textContent = 'İZ SIRASI';
    else sub.textContent = s.toTram ? ('İze ' + s.toTram + ' sıra kaldı') : '';
    if (s.conf === 'low') { msg.className = 'warn'; msg.textContent = 'Emin değilim — doğruysa devam, değilse +/− ile düzelt'; }
  }
  var b = $('boxes'); b.innerHTML = '';
  if (s.phase === 'IN_PASS' || s.phase === 'TURNING') {
    var base = s.phase === 'TURNING' && s.predictedL !== null ? s.predictedL : s.L, dir = s.laneDir || 1;
    for (var i = -1; i <= T.cfg.interval; i++) {
      var L = base + dir * i, el = document.createElement('div');
      el.className = 'box' + (s.anchorR !== null && T.isTram(L) ? ' tram' : '') + (i === 0 ? ' cur' : ''); el.textContent = L + 1; b.appendChild(el);
    }
  }
}
setInterval(function () { render(); if (document.body.classList.contains('map')) drawMap(); }, 1000);

// ---------- harita ----------
var V = { sc: 4, north: false, fit: false, hd: 0 };
var cv = $('map'), cx = cv.getContext('2d');
function sizeCanvas() {
  var r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  if (!r.width) return false;
  if (cv.width !== Math.round(r.width * dpr)) { cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); }
  cx.setTransform(dpr, 0, 0, dpr, 0, 0); return { w: r.width, h: r.height };
}
function drawMap() {
  if (!document.body.classList.contains('map')) return;
  var z = sizeCanvas(); if (!z || !F.cur) return;
  var W = z.w, H = z.h, s = T.snapshot();
  cx.clearRect(0, 0, W, H);
  var pos = null;
  if (lastFix && F.cur.fo) pos = toLocal(lastFix.lat, lastFix.lon);
  var hd = V.hd;
  if (s.heading !== null && s.speed >= 0.7) V.hd = hd = s.heading;
  var sc = V.sc, ox, oy, rot = 0;
  if (V.fit) {
    var bb = bounds();
    if (!bb) { V.fit = false; } else {
      var bw = Math.max(bb.x1 - bb.x0, 30), bh = Math.max(bb.y1 - bb.y0, 30);
      sc = Math.min(W / bw, H / bh) * 0.85; ox = (bb.x0 + bb.x1) / 2; oy = (bb.y0 + bb.y1) / 2; rot = 0;
    }
  }
  if (!V.fit) {
    if (!pos) { cx.fillStyle = '#8b97a6'; cx.font = '15px sans-serif'; cx.textAlign = 'center'; cx.fillText('Konum / boyama bekleniyor', W / 2, H / 2); $('mInfo').textContent = ''; return; }
    ox = pos.x; oy = pos.y; rot = V.north ? 0 : hd * D2R;
  }
  var ccx = W / 2, ccy = V.fit ? H / 2 : (V.north ? H / 2 : H * 0.66), cr = Math.cos(rot), sr = Math.sin(rot);
  function X(x, y) { var dx = x - ox, dy = y - oy; return ccx + (dx * cr - dy * sr) * sc; }
  function Y(x, y) { var dx = x - ox, dy = y - oy; return ccy - (dx * sr + dy * cr) * sc; }
  // sıra çizgileri
  var fr = T.getFrame();
  if (fr && F.cur.fo) {
    var A = toLocal(fr.lat, fr.lon), p0 = fr.phi0 * D2R, ux = Math.sin(p0), uy = Math.cos(p0), nx = Math.cos(p0), ny = -Math.sin(p0), Wd = S.width;
    var span = Math.ceil(Math.max(W, H) / sc / Wd) + 2, mid = V.fit ? 0 : s.L, lo = V.fit ? -15 : mid - span, hi = V.fit ? 30 : mid + span;
    if (V.fit) { lo = -40; hi = 40; }
    for (var m = lo; m <= hi; m++) {
      var bx = A.x + nx * m * Wd, by = A.y + ny * m * Wd, isT = s.anchorR !== null && T.isTram(m);
      cx.beginPath(); cx.moveTo(X(bx - ux * 3000, by - uy * 3000), Y(bx - ux * 3000, by - uy * 3000)); cx.lineTo(X(bx + ux * 3000, by + uy * 3000), Y(bx + ux * 3000, by + uy * 3000));
      cx.lineWidth = m === s.L ? 2.5 : 1; cx.strokeStyle = m === s.L ? '#ffffff' : (isT ? S.colT : '#3a4350'); cx.globalAlpha = m === s.L ? 0.9 : (isT ? 0.8 : 0.7);
      cx.setLineDash(isT ? [10, 6] : []); cx.stroke();
    }
    cx.setLineDash([]); cx.globalAlpha = 1;
  }
  // boyama
  cx.lineJoin = 'round'; cx.lineCap = 'butt';
  F.cur.segs.forEach(function (sg) {
    var p = sg.p; if (p.length < 4) return;
    cx.beginPath(); cx.moveTo(X(p[0], p[1]), Y(p[0], p[1]));
    for (var i = 2; i < p.length; i += 2) cx.lineTo(X(p[i], p[i + 1]), Y(p[i], p[i + 1]));
    cx.lineWidth = Math.max(2, sg.w * sc); cx.strokeStyle = sg.t ? S.colT : S.col; cx.globalAlpha = 0.55; cx.stroke();
  });
  cx.globalAlpha = 1;
  // araç
  if (pos) {
    var vx = X(pos.x, pos.y), vy = Y(pos.x, pos.y), a = V.fit || V.north ? hd * D2R : 0;
    cx.save(); cx.translate(vx, vy); cx.rotate(a); cx.fillStyle = '#fff'; cx.strokeStyle = '#000'; cx.lineWidth = 2;
    cx.beginPath(); cx.moveTo(0, -14); cx.lineTo(10, 11); cx.lineTo(0, 6); cx.lineTo(-10, 11); cx.closePath(); cx.fill(); cx.stroke(); cx.restore();
  }
  var i2 = fieldInfo(F.active);
  $('mInfo').textContent = (i2 ? i2.name : '') + ' · sıra ' + (s.phase === 'IN_PASS' || s.phase === 'TURNING' ? s.L + 1 : '–') + ' · ' + (areaHa(F.cur) * 10).toFixed(1) + ' da';
}
function bounds() {
  var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, any = false;
  if (!F.cur) return null;
  F.cur.segs.forEach(function (sg) { for (var i = 0; i < sg.p.length; i += 2) { any = true; if (sg.p[i] < x0) x0 = sg.p[i]; if (sg.p[i] > x1) x1 = sg.p[i]; if (sg.p[i + 1] < y0) y0 = sg.p[i + 1]; if (sg.p[i + 1] > y1) y1 = sg.p[i + 1]; } });
  return any ? { x0: x0, y0: y0, x1: x1, y1: y1 } : null;
}
$('mZ+').onclick = function () { V.sc = Math.min(40, V.sc * 1.4); drawMap(); };
$('mZ-').onclick = function () { V.sc = Math.max(0.1, V.sc / 1.4); drawMap(); };
$('mMode').onclick = function () { V.north = !V.north; V.fit = false; $('mMode').textContent = V.north ? 'Kuzey' : 'Yön'; drawMap(); };
$('mFit').onclick = function () { V.fit = !V.fit; $('mFit').textContent = V.fit ? 'Takip' : 'Tüm'; drawMap(); };
function tab(m) {
  document.body.classList.toggle('map', m);
  $('tMain').classList.toggle('on', !m); $('tMap').classList.toggle('on', m);
  if (m) setTimeout(drawMap, 30);
}
$('tMain').onclick = function () { tab(false); };
$('tMap').onclick = function () { tab(true); };
window.addEventListener('resize', drawMap);

// ---------- butonlar ----------
$('bA').onclick = function () { T.markA(); alertedFor = null; render(); lockScreen(); try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} };
$('bB').onclick = function () { var r = T.finishAB(); if (r) { handle(r); } else { $('msg').className = 'warn'; $('msg').textContent = 'En az ' + T.cfg.abMinDist + ' m düz git'; } render(); };
$('bPlus').onclick = function () { T.adjustLane(1); saveCur(); render(); drawMap(); };
$('bMinus').onclick = function () { T.adjustLane(-1); saveCur(); render(); drawMap(); };
$('bTram').onclick = function () { T.markTramHere(); saveCur(); render(); drawMap(); };
$('bReset').onclick = function () {
  if (!confirm('Sayaç ve hat sıfırlansın mı? (Boyama silinmez)')) return;
  T.reset(); F.curSeg = null; alertedFor = null; $('alert').classList.remove('on'); if (F.cur) F.cur.state = null; saveCur(); render(); drawMap();
};

// ---------- ayarlar ----------
function impText(im) { return im.name + ' — ' + im.w + ' m' + (im.off ? ' · ' + im.off + ' m geride' : ''); }
function ratioText() {
  var spr = parseFloat($('sSpr').value) || 0;
  if (!(spr > 0)) { $('sRatio').textContent = ''; return; }
  var r = spr / S.width, n = Math.round(r);
  $('sRatio').textContent = spr + ' m ÷ ' + S.width + ' m = ' + r.toFixed(2) + ' → her ' + Math.max(2, Math.min(12, n)) + ' sırada bir iz';
  if ($('sSpr').value) $('sN').value = Math.max(2, Math.min(12, n));
}
$('sSpr').oninput = ratioText;
$('bSet').onclick = function () {
  $('sImp').textContent = impText(findImp(S.impId)); $('sSpr').value = S.sprayW || ''; $('sN').value = S.interval;
  $('sSnd').checked = S.sound; $('sVib').checked = S.vib; $('sSkip').checked = S.skip;
  $('sCol').value = S.col; $('sColT').value = S.colT; ratioText(); $('sheet').classList.add('on');
};
$('sImpBtn').onclick = function () { $('sheet').classList.remove('on'); openImps(); };
$('sTest').onclick = function () { var o = S.sound; S.sound = $('sSnd').checked; beep(); vibrate(); S.sound = o; };
$('sOk').onclick = function () {
  var n = parseInt($('sN').value, 10), spr = parseFloat($('sSpr').value) || 0;
  if (spr > 0) {
    var r = spr / S.width; n = Math.round(r);
    if (Math.abs(r - n) > 0.05 && !confirm('Püskürtme ' + spr + ' m ÷ alet ' + S.width + ' m = ' + r.toFixed(2) + ' (tam sayı değil). ' + n + ' sıra olarak kaydedilsin mi?')) return;
    if (n % 2 === 0 && !confirm('Oran çift sayı (' + n + '). İz sırasının ortası yarım sıra kayabilir; ilk geçişi yarım genişlikle başlatmak gerekebilir. Yine de kaydedilsin mi?')) return;
  }
  if (!(n >= 2 && n <= 12)) { alert('İz aralığı 2–12 olmalı'); return; }
  S.sprayW = spr; S.interval = n; S.sound = $('sSnd').checked; S.vib = $('sVib').checked; S.skip = $('sSkip').checked;
  S.col = $('sCol').value; S.colT = $('sColT').value; saveSettings();
  T.setConfig({ interval: n, allowSkip: S.skip });
  $('sheet').classList.remove('on'); F.curSeg = null; render(); drawMap();
};

// ---------- aletler ----------
function applyImpToActive(id) {
  var im = findImp(id); if (!im) return false;
  if (im.w !== S.width && T.snapshot().phase !== 'NO_AB') {
    if (!confirm('Sıra genişliği ' + S.width + ' m → ' + im.w + ' m olacak. Sayaç ve hat sıfırlanır (boyama silinmez). Devam?')) return false;
    T.reset(); F.curSeg = null; pend = []; alertedFor = null; if (F.cur) F.cur.state = null; $('alert').classList.remove('on');
  }
  setImp(id); var inf = fieldInfo(F.active); if (inf) inf.imp = id; saveList(); saveCur(); render(); drawMap(); return true;
}
function openImps() {
  var box = $('iList'); box.innerHTML = '';
  S.imps.forEach(function (im) {
    var row = document.createElement('div'); row.className = 'fl' + (im.id === S.impId ? ' act' : '');
    var nm = document.createElement('div'); nm.className = 'nm'; nm.innerHTML = '<b></b><small></small>';
    nm.firstChild.textContent = im.name; nm.lastChild.textContent = im.w + ' m' + (im.off ? ' · GPS\'ten ' + im.off + ' m geride' : '');
    nm.onclick = function () { if (applyImpToActive(im.id)) openImps(); };
    var be = document.createElement('button'); be.textContent = 'Düzenle';
    be.onclick = function () {
      var n = prompt('Alet adı', im.name); if (!n || !n.trim()) return;
      var w = parseFloat((prompt('Çalışma genişliği (m)', im.w) || '').replace(',', '.')); if (!(w >= 1 && w <= 30)) { alert('Genişlik 1–30 m olmalı'); return; }
      var of = parseFloat((prompt('Alet GPS\'ten kaç metre geride? (0 = yok)', im.off || 0) || '0').replace(',', '.')) || 0;
      if (im.id === S.impId && w !== S.width && T.snapshot().phase !== 'NO_AB') {
        if (!confirm('Sıra genişliği ' + S.width + ' m → ' + w + ' m olacak. Sayaç ve hat sıfırlanır (boyama silinmez). Devam?')) return;
        T.reset(); F.curSeg = null; pend = []; alertedFor = null; if (F.cur) F.cur.state = null; $('alert').classList.remove('on');
      }
      im.name = n.trim().slice(0, 30); im.w = w; im.off = Math.max(0, Math.min(15, of));
      if (im.id === S.impId) { setImp(im.id); saveCur(); } else saveSettings();
      openImps(); render(); drawMap();
    };
    var bd = document.createElement('button'); bd.textContent = 'Sil';
    bd.onclick = function () {
      if (S.imps.length < 2) { alert('En az bir alet kalmalı'); return; }
      if (!confirm('"' + im.name + '" silinsin mi?')) return;
      S.imps = S.imps.filter(function (x) { return x.id !== im.id; });
      F.list.forEach(function (f) { if (f.imp === im.id) f.imp = S.imps[0].id; });
      if (S.impId === im.id) applyImpToActive(S.imps[0].id); saveSettings(); saveList(); openImps();
    };
    row.appendChild(nm); row.appendChild(be); row.appendChild(bd); box.appendChild(row);
  });
  $('isheet').classList.add('on');
}
$('iClose').onclick = function () { $('isheet').classList.remove('on'); };
$('iAdd').onclick = function () {
  var n = prompt('Alet adı (örn. Mibzer, Püskürtme)'); if (!n || !n.trim()) return;
  var w = parseFloat((prompt('Çalışma genişliği (m)', '4') || '').replace(',', '.')); if (!(w >= 1 && w <= 30)) { alert('Genişlik 1–30 m olmalı'); return; }
  var of = parseFloat((prompt('Alet GPS\'ten kaç metre geride? (0 = yok)', '0') || '0').replace(',', '.')) || 0;
  S.imps.push({ id: 'i' + Date.now().toString(36), name: n.trim().slice(0, 30), w: w, off: Math.max(0, Math.min(15, of)) });
  saveSettings(); openImps();
};

// ---------- tarla bilgisi, rapor, dışa aktarma ----------
var infoId = null;
function getData(id) {
  if (id === F.active && F.cur) { try { F.cur.state = T.serialize(); } catch (e) {} return F.cur; }
  try { return JSON.parse(LS.get('iz_f_' + id)); } catch (e) { return null; }
}
function openInfo(id) {
  infoId = id; var f = fieldInfo(id); if (!f) return;
  $('bTitle').textContent = f.name; $('bName').value = f.name; $('bUrun').value = f.urun || ''; $('bTohum').value = f.tohum || '';
  $('bTarih').value = f.tarih || today(); $('bNot').value = f.not || '';
  var sel = $('bImp'); sel.innerHTML = '';
  S.imps.forEach(function (im) { var o = document.createElement('option'); o.value = im.id; o.textContent = impText(im); if (im.id === (f.imp || S.impId)) o.selected = true; sel.appendChild(o); });
  $('rep').style.display = 'none'; $('fsheet').classList.remove('on'); $('bsheet').classList.add('on');
}
$('bCloseB').onclick = function () { $('bsheet').classList.remove('on'); renderFields(); $('fsheet').classList.add('on'); };
$('bSave').onclick = function () {
  var f = fieldInfo(infoId); if (!f) return;
  var nm = $('bName').value.trim(); if (nm) f.name = nm.slice(0, 30);
  f.urun = $('bUrun').value.trim().slice(0, 40); f.tohum = parseFloat($('bTohum').value) || 0; f.tarih = $('bTarih').value; f.not = $('bNot').value.trim().slice(0, 120);
  var newImp = $('bImp').value;
  if (newImp !== f.imp) { if (infoId === F.active) { if (!applyImpToActive(newImp)) { $('bImp').value = f.imp; } } else f.imp = newImp; }
  saveList(); updFieldBtn(); $('bTitle').textContent = f.name;
};

function frameFromState(st) {
  try {
    var d = JSON.parse(st);
    if (!d || !d.o || !d.A || d.phase === 'NO_AB' || d.phase === 'AB_SETTING') return null;
    return { lat: d.o.lat + d.A.y / R / D2R, lon: d.o.lon + d.A.x / (R * D2R * d.o.cosLat), phi0: d.phi0 };
  } catch (e) { return null; }
}
function computeReport(data) {
  if (!data || !data.segs || !data.segs.length || !data.fo) return null;
  var fo = data.fo, Ax = 0, Ay = 0, phi = 0, fr = data.state ? frameFromState(data.state) : null;
  if (fr) { Ax = (fr.lon - fo.lon) * D2R * R * Math.cos(fo.lat * D2R); Ay = (fr.lat - fo.lat) * D2R * R; phi = fr.phi0 * D2R; }
  var ux = Math.sin(phi), uy = Math.cos(phi), nx = Math.cos(phi), ny = -Math.sin(phi);
  var tr = [], c0 = 1e9, c1 = -1e9, s0 = 1e9, s1 = -1e9, maxW = 0, raw = 0;
  data.segs.forEach(function (sg) {
    var q = [], p = sg.p; maxW = Math.max(maxW, sg.w);
    for (var i = 0; i < p.length; i += 2) {
      var dx = p[i] - Ax, dy = p[i + 1] - Ay, c = dx * nx + dy * ny, ss = dx * ux + dy * uy;
      q.push(c, ss); if (c < c0) c0 = c; if (c > c1) c1 = c; if (ss < s0) s0 = ss; if (ss > s1) s1 = ss;
    }
    raw += segLen(sg) * sg.w; tr.push({ w: sg.w, q: q });
  });
  var pad = maxW / 2 + 2, cell = 1, gw, gh;
  for (;;) { gw = Math.ceil((c1 - c0 + 2 * pad) / cell); gh = Math.ceil((s1 - s0 + 2 * pad) / cell); if (gw * gh <= 6e6) break; cell *= 1.4; }
  var cnt = new Uint8Array(gw * gh), last = new Uint32Array(gw * gh);
  function stamp(c, ss, r, id) {
    var gx0 = Math.max(0, Math.floor((c - r - c0 + pad) / cell)), gx1 = Math.min(gw - 1, Math.ceil((c + r - c0 + pad) / cell));
    var gy0 = Math.max(0, Math.floor((ss - r - s0 + pad) / cell)), gy1 = Math.min(gh - 1, Math.ceil((ss + r - s0 + pad) / cell));
    for (var gy = gy0; gy <= gy1; gy++) {
      var cyc = s0 - pad + (gy + 0.5) * cell, dy = cyc - ss;
      for (var gx = gx0; gx <= gx1; gx++) {
        var cxc = c0 - pad + (gx + 0.5) * cell, dx = cxc - c;
        if (dx * dx + dy * dy <= r * r) { var ix = gy * gw + gx; if (last[ix] !== id) { last[ix] = id; if (cnt[ix] < 255) cnt[ix]++; } }
      }
    }
  }
  tr.forEach(function (sg, k) {
    var id = k + 1, r = sg.w / 2, step = Math.max(cell, r / 4), q = sg.q;
    for (var i = 0; i < q.length; i += 2) {
      stamp(q[i], q[i + 1], r, id);
      if (i + 2 < q.length) {
        var dc = q[i + 2] - q[i], ds = q[i + 3] - q[i + 1], L = Math.hypot(dc, ds), m = Math.floor(L / step);
        for (var j = 1; j <= m; j++) stamp(q[i] + dc * j / L * step, q[i + 1] + ds * j / L * step, r, id);
      }
    }
  });
  var margin = Math.min(15, 0.1 * (s1 - s0)), ya = Math.ceil(margin / cell), yb = gh - Math.ceil(margin / cell) - 1 - Math.ceil(pad / cell);
  var cov = 0, over = 0, gap = 0, covAll = 0;
  for (var gy = 0; gy < gh; gy++) {
    var mn = -1, mx = -1, rc = 0, ro = 0;
    for (var gx = 0; gx < gw; gx++) { var v = cnt[gy * gw + gx]; if (v) { covAll++; if (mn < 0) mn = gx; mx = gx; rc++; if (v > 1) ro++; } }
    if (mn < 0 || gy < ya + Math.ceil(pad / cell) || gy > yb) continue;
    cov += rc; over += ro; gap += (mx - mn + 1) - rc;
  }
  var cell2 = cell * cell;
  return { uniqueDa: covAll * cell2 / 1000, rawDa: raw / 1000, evalCov: cov, over: over, gap: gap, overPct: cov ? over / cov * 100 : 0, gapPct: (cov + gap) ? gap / (cov + gap) * 100 : 0, cell: cell };
}
$('bRep').onclick = function () {
  var f = fieldInfo(infoId), d = getData(infoId), box = $('rep'); box.style.display = 'block';
  var r = null; try { r = computeReport(d); } catch (e) { r = null; }
  if (!r) { box.textContent = 'Henüz boyalı alan yok.'; return; }
  var lines = ['Benzersiz boyalı alan: ' + r.uniqueDa.toFixed(1) + ' dekar', 'Geçiş uzunluğu × genişlik: ' + r.rawDa.toFixed(1) + ' dekar',
    'Çakışma (çift ekim): %' + r.overPct.toFixed(1), 'Boşluk (atlanan şerit): %' + r.gapPct.toFixed(1)];
  if (f && f.tohum) lines.push('Tahmini tohum: ' + (f.tohum * r.uniqueDa).toFixed(0) + ' kg (' + f.tohum + ' kg/da × benzersiz alan)');
  lines.push('Not: GPS hatası (1–3 m) dahildir, rakamlar yaklaşıktır. Tarla uçları (başlıklar) hesaba katılmaz.');
  box.innerHTML = ''; lines.forEach(function (t, i) { var p = document.createElement('div'); p.textContent = t; if (i === lines.length - 1) { p.style.color = 'var(--mut)'; p.style.fontSize = '12px'; } box.appendChild(p); });
};
function download(name, text, mime) {
  try {
    var blob = new Blob([text], { type: mime }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(a.href); }, 1500);
  } catch (e) { alert('Dosya indirilemedi: ' + e); }
}
function esc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
function safeName(t) { return (t || 'tarla').replace(/[^\w\u00C0-\u024F-]+/g, '_'); }
function toLL(fo, x, y) { return { lat: fo.lat + y / R / D2R, lon: fo.lon + x / (R * D2R * Math.cos(fo.lat * D2R)) }; }
$('bGpx').onclick = function () {
  var f = fieldInfo(infoId), d = getData(infoId);
  if (!d || !d.segs || !d.segs.length) { alert('Dışa aktarılacak boyama yok'); return; }
  var out = ['<?xml version="1.0" encoding="UTF-8"?>', '<gpx version="1.1" creator="Iz Sayaci" xmlns="http://www.topografix.com/GPX/1/1">', '<metadata><name>' + esc(f.name) + '</name></metadata>'];
  [0, 1].forEach(function (t) {
    var ss = d.segs.filter(function (s) { return s.t === t; }); if (!ss.length) return;
    out.push('<trk><name>' + (t ? 'Iz siralari' : 'Normal siralar') + '</name>');
    ss.forEach(function (sg) { out.push('<trkseg>'); for (var i = 0; i < sg.p.length; i += 2) { var ll = toLL(d.fo, sg.p[i], sg.p[i + 1]); out.push('<trkpt lat="' + ll.lat.toFixed(7) + '" lon="' + ll.lon.toFixed(7) + '"/>'); } out.push('</trkseg>'); });
    out.push('</trk>');
  });
  out.push('</gpx>'); download(safeName(f.name) + '.gpx', out.join('\n'), 'application/gpx+xml');
};
$('bCsv').onclick = function () {
  var f = fieldInfo(infoId), d = getData(infoId);
  if (!d || !d.segs || !d.segs.length) { alert('Dışa aktarılacak boyama yok'); return; }
  var rows = ['tarla,urun,tarih,sira_tipi,genislik_m,enlem,boylam'];
  d.segs.forEach(function (sg) { for (var i = 0; i < sg.p.length; i += 2) { var ll = toLL(d.fo, sg.p[i], sg.p[i + 1]); rows.push([JSON.stringify(f.name), JSON.stringify(f.urun || ''), f.tarih || '', sg.t ? 'iz' : 'normal', sg.w, ll.lat.toFixed(7), ll.lon.toFixed(7)].join(',')); } });
  download(safeName(f.name) + '.csv', '\uFEFF' + rows.join('\n'), 'text/csv');
};
$('bClr').onclick = function () {
  var f = fieldInfo(infoId); if (!f || !confirm('"' + f.name + '" tarlasının boyaması ve sıra kaydı silinsin mi?')) return;
  if (f.id === F.active) { F.cur.segs = []; F.cur.state = null; F.curSeg = null; T.reset(); saveCur(); render(); drawMap(); }
  else { LS.set('iz_f_' + f.id, JSON.stringify({ fo: null, segs: [], state: null })); f.ha = 0; f.passNo = 0; saveList(); }
  $('rep').style.display = 'none';
};

// ---------- yedek ----------
$('fBackup').onclick = function () {
  saveCur();
  var all = { v: 1, t: new Date().toISOString(), settings: S, active: F.active, fields: F.list.map(function (f) { return { info: f, data: getData(f.id) }; }) };
  download('iz-sayaci-yedek-' + today() + '.json', JSON.stringify(all), 'application/json');
};
$('fRestore').onclick = function () { $('fFile').click(); };
$('fFile').onchange = function () {
  var file = this.files && this.files[0]; if (!file) return;
  var fr = new FileReader();
  fr.onload = function () {
    try {
      var all = JSON.parse(fr.result);
      if (!all || all.v !== 1 || !Array.isArray(all.fields)) throw new Error('Geçersiz yedek dosyası');
      if (!confirm('Yedek yüklenince şu anki tüm tarlalar ve ayarlar silinip yedektekilerle değişir. Devam?')) return;
      F.list.forEach(function (f) { LS.del('iz_f_' + f.id); });
      var list = [];
      all.fields.forEach(function (x) { if (x && x.info && x.info.id && x.data) { list.push(x.info); LS.set('iz_f_' + x.info.id, JSON.stringify(x.data)); } });
      LS.set('iz_fields', JSON.stringify(list)); LS.set('iz_active', all.active || (list[0] && list[0].id) || '');
      LS.set('iz_set', JSON.stringify(all.settings || {}));
      location.reload();
    } catch (e) { alert('Yedek yüklenemedi: ' + e.message); }
  };
  fr.readAsText(file); this.value = '';
};

// ---------- açılış ----------
loadList();
if (!F.list.length) { F.list.push({ id: 'f' + Date.now().toString(36), name: 'Tarla 1', ha: 0, passNo: 0, tarih: today(), imp: S.impId }); }
var act = LS.get('iz_active');
loadField(fieldInfo(act) ? act : F.list[0].id);
if (F.cur.state) $('msg').textContent = 'Önceki oturum kaldığı yerden sürüyor';
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {});
startGps(); lockScreen(); render();
window.__izDebug = { T: T, F: F, S: S, computeReport: computeReport };
})();
