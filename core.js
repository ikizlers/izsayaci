/*
  IZ SAYACI — ÇEKİRDEK (core.js)
  ================================================================
  AgOpenGPS'ten alınan fikir: sıra numarası "kaç dönüş yaptım" diye
  SAYILMAZ, bir AB hattına göre GEOMETRİK olarak hesaplanır.

  - A noktası + 30 m ilerleme => AB hattı (yön = A'dan şu ana).
  - Her fix (s, c) koordinatına çevrilir:  s = hat boyunca, c = hatta dik (sağ +).
  - Bir "sıra" = hatta paralel (±25°) en az 22 m kesintisiz gidiş.
  - Yeni sıra kilitlenince, önceki sıranın SON 20 m'si ile yeni sıranın İLK
    12 m'si karşılaştırılır (aynı başlık bölgesi, aralarında ~30 sn).
    Fark / çalışma genişliği = kaç sıra kaydığınız. Mutlak GPS hatası değil,
    iki ardışık geçiş arasındaki GÖRELİ fark ölçüldüğü için telefon GPS'inin
    yavaş kaymaları (drift) sayımı bozmaz.
  - Pusula/manyetometre HİÇ kullanılmaz. Yön, GPS konum farklarından çıkar.
  - Hatta dik (örn. başlık) geçişler sayılmaz, durup kalkmak sayılmaz.

  İz sırası kuralı: sıra numarası p = (L*laneDir + 1); p, aralığa (N) tam
  bölünüyorsa o sıra iz sırasıdır. İz sıraları SAHAYA SABİTTİR (hangi
  yöne gittiğinize bakmaz) — gerçek bir tramline gibi.
*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.IzCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var R_EARTH = 6371000;
  var D2R = Math.PI / 180;

  var DEFAULTS = {
    width: 4.0,        // çalışma genişliği (m): iki komşu sıra arası
    interval: 3,       // her kaç sırada bir iz
    allowSkip: false,  // sıra atlamayı (2+ kayma) algıla
    maxAccuracy: 25,   // bundan kötü GPS doğruluğu (m) yok sayılır
    minSpeed: 0.7,     // m/s altı = duruyor
    headingWindow: 10, // yön için kullanılan yol uzunluğu (m)
    alignTol: 25,      // hatta paralel sayılma toleransı (derece)
    leaveTol: 40,      // sıradan çıkış eşiği (derece)
    lockDist: 32,      // yeni sırayı kilitlemek için paralel gidiş (m)
    lockUse: 22,       // kilit anında ortalaması alınan son kısım (m)
    abAutoDist: 40,    // A'dan sonra hat otomatik kurulma mesafesi (m)
    abMinDist: 15,     // elle B için minimum mesafe (m)
    prevSkipEnd: 16,    // önceki sıranın son kaç metresi atlanır
    prevWinLen: 40,    // önceki sıranın karşılaştırma penceresi (m)
    fitLen: 120        // doğru uydurma için kullanılan uzunluk (m)
  };

  function norm360(a) { a = a % 360; return a < 0 ? a + 360 : a; }
  function angDiff(a, b) { var d = Math.abs(norm360(a) - norm360(b)); return d > 180 ? 360 - d : d; }
  function signedDiff(from, to) { return ((to - from + 540) % 360) - 180; }
  function mod(n, m) { return ((n % m) + m) % m; }
  function sign(v) { return v < 0 ? -1 : 1; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function median(arr, key) { var a = arr.map(function (p) { return p[key]; }).sort(function (x, y) { return x - y; }); var m = a.length >> 1; return a.length ? (a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2) : 0; }
  function mean(arr, key) { var s = 0; for (var i = 0; i < arr.length; i++) s += arr[i][key]; return arr.length ? s / arr.length : 0; }

  function createTracker(userCfg) {
    var cfg = {};
    var k;
    for (k in DEFAULTS) cfg[k] = DEFAULTS[k];
    if (userCfg) for (k in userCfg) if (userCfg[k] !== undefined) cfg[k] = userCfg[k];

    var o = null;            // yerel koordinat orijini
    var buf = [];            // son fix'ler {t,x,y,d}
    var pathD = 0;           // toplam yol (m)
    var events;              // addFix çağrısı başına olay listesi

    var st = {
      phase: 'NO_AB',
      A: null, phi0: 0, u: null, n: null,
      L: 0, passNo: 0, dir: 1,
      laneDir: null, anchorR: null, anchorManual: false,
      pass: [],              // geçerli sıranın noktaları {s,c,d,t,al}
      prevWin: null,         // önceki sıra penceresi {meanS, meanC, n}
      devCount: 0,
      turn: null,            // {sum,lastH,predicted}
      run: null,             // {dir, pts[], startD}
      lastH: null, lastSpeed: 0, lastFix: null,
      conf: null, restored: false, predictedL: null
    };

    // ---------- koordinat ----------
    function toXY(lat, lon) {
      return {
        x: (lon - o.lon) * D2R * R_EARTH * o.cosLat,
        y: (lat - o.lat) * D2R * R_EARTH
      };
    }
    function toSC(x, y) {
      var dx = x - st.A.x, dy = y - st.A.y;
      return { s: dx * st.u.x + dy * st.u.y, c: dx * st.n.x + dy * st.n.y };
    }
    function bearing(x1, y1, x2, y2) { return norm360(Math.atan2(x2 - x1, y2 - y1) / D2R); }
    function dist(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }

    // ---------- iz kuralı ----------
    function isTram(L) {
      if (cfg.interval <= 1) return true;
      if (st.anchorR === null) return false;
      return mod(L, cfg.interval) === st.anchorR;
    }
    function setAnchorFromLaneDir() {
      if (st.anchorManual || st.laneDir === null) return;
      st.anchorR = mod(st.laneDir * (cfg.interval - 1), cfg.interval);
    }
    function passesToTram() {
      if (st.laneDir === null) return null;
      for (var j = 1; j <= cfg.interval; j++) if (isTram(st.L + st.laneDir * j)) return j;
      return null;
    }

    // ---------- AB hattı ----------
    function setFrame(A, phi0) {
      st.A = A; st.phi0 = phi0;
      var r = phi0 * D2R;
      st.u = { x: Math.sin(r), y: Math.cos(r) };
      st.n = { x: Math.cos(r), y: -Math.sin(r) };
    }

    function finishAB(p) {
      var phi0 = bearing(st.A.x, st.A.y, p.x, p.y);
      setFrame(st.A, phi0);
      st.pass = [];
      for (var i = 0; i < buf.length; i++) {
        if (buf[i].t >= st.A.t) {
          var sc = toSC(buf[i].x, buf[i].y);
          st.pass.push({ s: sc.s, c: sc.c, d: buf[i].d, t: buf[i].t, al: true });
        }
      }
      st.L = 0; st.passNo = 1; st.dir = 1; st.laneDir = null; st.devCount = 0;
      st.phase = 'IN_PASS'; st.conf = 'ok'; st.prevWin = null;
      events.push({ type: 'ab_set', phi0: phi0, runT: 0 });
      events.push({ type: 'pass', L: 0, passNo: 1, isTram: isTram(0), k: 0, reversed: false, conf: 'ok', x: 0 });
    }

    // ---------- pencere ----------
    function windowFromPass() {
      var al = [], i;
      for (i = 0; i < st.pass.length; i++) if (st.pass[i].al) al.push(st.pass[i]);
      if (!al.length) return null;
      var end = al[al.length - 1].d;
      var win = [], fit = [];
      for (i = 0; i < al.length; i++) {
        var back = end - al[i].d;
        if (back >= cfg.prevSkipEnd && back <= cfg.prevSkipEnd + cfg.prevWinLen) win.push(al[i]);
        if (back >= cfg.prevSkipEnd && back <= cfg.prevSkipEnd + cfg.fitLen) fit.push(al[i]);
      }
      if (win.length < 3) win = al.slice(Math.max(0, al.length - 6));
      var w = { meanS: median(win, 's'), meanC: median(win, 'c'), n: win.length, a: null, b: 0 };
      // Doğru uydurma (en küçük kareler): c = a + b*s. AB yönündeki küçük hata
      // yüzünden c, s ile kayar; karşılaştırmayı AYNI s'de yapmak bunu giderir.
      if (fit.length >= 8) {
        var ms = mean(fit, 's'), mc = mean(fit, 'c'), sxx = 0, sxy = 0;
        for (i = 0; i < fit.length; i++) { var ds = fit[i].s - ms; sxx += ds * ds; sxy += ds * (fit[i].c - mc); }
        if (sxx > 400) {
          var b = sxy / sxx;
          if (Math.abs(b) <= 0.4) { w.b = b; w.a = mc - b * ms; }
        }
      }
      return w;
    }
    function prevCAt(s) { return st.prevWin.a !== null ? st.prevWin.a + st.prevWin.b * s : st.prevWin.meanC; }

    function endPass(h) {
      st.prevWin = windowFromPass();
      var dirH = st.dir > 0 ? st.phi0 : norm360(st.phi0 + 180);
      st.turn = { sum: signedDiff(dirH, h), lastH: h, predicted: false };
      st.run = null;
      st.phase = 'TURNING';
      st.predictedL = null;
      events.push({ type: 'turn_start', nextL: st.laneDir !== null ? st.L + st.laneDir : null, nextTram: st.laneDir !== null ? isTram(st.L + st.laneDir) : false });
    }

    function lockPass() {
      var pts = [], i, from = pathD - cfg.lockUse;
      for (i = 0; i < st.run.pts.length; i++) if (st.run.pts[i].d >= from) pts.push(st.run.pts[i]);
      if (pts.length < 3) pts = st.run.pts.slice(-4);
      var cm = median(pts, 'c');
      var devs = [];
      var reversed = st.run.dir !== st.dir;
      var runT = st.run.pts[0].t;
      var W = cfg.width;
      var x = 0;
      if (st.prevWin) {
        for (i = 0; i < pts.length; i++) devs.push({ v: pts[i].c - prevCAt(pts[i].s) });
        x = median(devs, 'v');
      }
      var conf = st.prevWin ? 'ok' : 'low';
      var kk;

      if (reversed) {
        var tside = (st.turn && Math.abs(st.turn.sum) >= 100) ? sign(st.turn.sum) * st.dir : 0;
        var gside = Math.abs(x) >= 0.2 * W ? sign(x) : 0;
        var side = gside !== 0 ? gside : (tside !== 0 ? tside : (x >= 0 ? 1 : -1));
        if (tside !== 0 && gside !== 0 && tside !== gside) conf = 'low';
        var mag = cfg.allowSkip ? clamp(Math.round(x * side / W), 1, 4) : 1;
        kk = side * mag;
      } else {
        var lim = cfg.allowSkip ? 4 : 1;
        kk = clamp(Math.round(x / W), -lim, lim);
      }
      if (st.prevWin && Math.abs(x - kk * W) / W > 0.5) conf = 'low';
      if (st.restored) { conf = 'low'; st.restored = false; }

      st.conf = conf;
      st.turn = null;
      st.devCount = 0;

      if (!reversed && kk === 0) {
        // Aynı sıraya geri dönüş (kısa sapma / durma): yeni sıra sayılmaz.
        st.pass = st.run.pts.map(function (p) { return { s: p.s, c: p.c, d: p.d, t: p.t, al: true }; });
        st.run = null; st.phase = 'IN_PASS';
        events.push({ type: 'resume', runT: runT });
        return;
      }

      st.L += kk;
      st.passNo += 1;
      if (st.laneDir === null && kk !== 0) { st.laneDir = sign(kk); setAnchorFromLaneDir(); }
      st.dir = st.run.dir;
      st.pass = st.run.pts.map(function (p) { return { s: p.s, c: p.c, d: p.d, t: p.t, al: true }; });
      st.run = null;
      st.phase = 'IN_PASS';
      st.predictedL = null;
      events.push({ type: 'pass', L: st.L, passNo: st.passNo, isTram: isTram(st.L), k: kk, reversed: reversed, conf: conf, x: x, runT: runT });
    }

    // ---------- ana giriş ----------
    function addFix(f) {
      events = [];
      if (f.acc != null && f.acc > cfg.maxAccuracy) return { events: events, ignored: 'acc' };

      if (!o) o = { lat: f.lat, lon: f.lon, cosLat: Math.cos(f.lat * D2R) };
      var p = toXY(f.lat, f.lon);
      var last = buf.length ? buf[buf.length - 1] : null;
      if (last) {
        var dt = (f.t - last.t) / 1000;
        if (dt <= 0) return { events: events, ignored: 'time' };
        var step = Math.sqrt(Math.pow(p.x - last.x, 2) + Math.pow(p.y - last.y, 2));
        if (step / dt > 30) return { events: events, ignored: 'jump' };
        pathD += step;
      }
      var cur = { t: f.t, x: p.x, y: p.y, d: pathD };
      buf.push(cur);
      while (buf.length > 200 || (buf.length > 2 && buf[0].t < f.t - 90000)) buf.shift();
      st.lastFix = cur;

      // hız
      var speed = (f.speed != null && isFinite(f.speed) && f.speed >= 0) ? f.speed : null;
      if (speed === null) {
        speed = 0;
        for (var q = buf.length - 2; q >= 0; q--) {
          if (f.t - buf[q].t >= 3000) { speed = dist(cur, buf[q]) / ((f.t - buf[q].t) / 1000); break; }
        }
      }
      st.lastSpeed = speed;

      // yön (GPS konum farkından; pusula YOK)
      var h = null;
      if (speed >= cfg.minSpeed) {
        for (var j = buf.length - 2; j >= 0; j--) {
          if (f.t - buf[j].t > 30000) break;
          if (dist(cur, buf[j]) >= (speed >= 4 ? 5 : cfg.headingWindow)) { h = bearing(buf[j].x, buf[j].y, cur.x, cur.y); break; }
        }
      }
      st.lastH = h;

      if (st.phase === 'AB_SETTING') {
        if (dist(st.A, cur) >= cfg.abAutoDist) finishAB(cur);
      } else if (st.phase === 'IN_PASS' && h !== null) {
        var dirH = st.dir > 0 ? st.phi0 : norm360(st.phi0 + 180);
        var dev = angDiff(h, dirH);
        var sc = toSC(cur.x, cur.y);
        st.pass.push({ s: sc.s, c: sc.c, d: cur.d, t: cur.t, al: dev <= cfg.alignTol });
        if (st.pass.length > 150) st.pass.shift();
        if (dev > cfg.leaveTol) st.devCount++; else st.devCount = 0;
        if (st.devCount >= 2) endPass(h);
      } else if (st.phase === 'TURNING' && h !== null) {
        st.turn.sum += signedDiff(st.turn.lastH, h);
        st.turn.lastH = h;
        if (!st.turn.predicted && Math.abs(st.turn.sum) >= 60) {
          st.turn.predicted = true;
          var side = sign(st.turn.sum) * st.dir;
          st.predictedL = st.L + side;
          events.push({ type: 'predict', L: st.predictedL, isTram: isTram(st.predictedL), side: side });
        }
        var ad = 0;
        if (angDiff(h, st.phi0) <= cfg.alignTol) ad = 1;
        else if (angDiff(h, norm360(st.phi0 + 180)) <= cfg.alignTol) ad = -1;
        if (ad !== 0) {
          if (!st.run || st.run.dir !== ad) st.run = { dir: ad, pts: [], startD: cur.d };
          var sc2 = toSC(cur.x, cur.y);
          st.run.pts.push({ s: sc2.s, c: sc2.c, d: cur.d, t: cur.t });
          if (cur.d - st.run.startD >= cfg.lockDist) lockPass();
        } else {
          st.run = null;
        }
      }
      return { events: events };
    }

    // ---------- dış API ----------
    function markA() {
      if (!st.lastFix) return false;
      st.A = { x: st.lastFix.x, y: st.lastFix.y, t: st.lastFix.t };
      st.u = { x: 0, y: 1 }; st.n = { x: 1, y: 0 };
      st.phase = 'AB_SETTING';
      st.L = 0; st.passNo = 0; st.laneDir = null;
      if (!st.anchorManual) st.anchorR = null;
      return true;
    }
    function finishABManual() {
      if (st.phase !== 'AB_SETTING' || !st.lastFix) return false;
      if (dist(st.A, st.lastFix) < cfg.abMinDist) return false;
      events = [];
      finishAB(st.lastFix);
      return events;
    }
    function adjustLane(d) {
      st.L += d;
      return { L: st.L, isTram: isTram(st.L) };
    }
    function markTramHere() {
      st.anchorR = mod(st.L, cfg.interval);
      st.anchorManual = true;
    }
    function setConfig(c) {
      var oldN = cfg.interval;
      for (var key in c) if (c[key] !== undefined) cfg[key] = c[key];
      if (cfg.interval !== oldN) setAnchorFromLaneDir();
    }
    function reset() {
      st.phase = 'NO_AB'; st.A = null; st.L = 0; st.passNo = 0; st.dir = 1;
      st.laneDir = null; st.anchorR = null; st.anchorManual = false;
      st.pass = []; st.prevWin = null; st.devCount = 0; st.turn = null; st.run = null;
      st.conf = null; st.restored = false; st.predictedL = null;
      buf = [];
    }
    function snapshot() {
      var cur = st.lastFix;
      return {
        phase: st.phase, L: st.L, passNo: st.passNo, laneDir: st.laneDir,
        isTram: st.phase === 'IN_PASS' ? isTram(st.L) : false,
        predictedL: st.predictedL,
        predictedTram: st.predictedL !== null ? isTram(st.predictedL) : null,
        anchorR: st.anchorR, conf: st.conf, heading: st.lastH, speed: st.lastSpeed,
        abDist: (st.phase === 'AB_SETTING' && cur) ? dist(st.A, cur) : null,
        toTram: passesToTram(), phi0: st.phi0, dir: st.dir,
        nextL: st.laneDir !== null ? st.L + st.laneDir : null,
        nextTram: (st.laneDir !== null && st.anchorR !== null) ? isTram(st.L + st.laneDir) : false
      };
    }
    // Harita çizimi için: (s,c) çerçevesinde son noktalar
    function trail(maxPts) {
      if (!st.A || st.phase === 'NO_AB' || st.phase === 'AB_SETTING') return [];
      var out = [], i, start = Math.max(0, buf.length - (maxPts || 60));
      for (i = start; i < buf.length; i++) { var sc = toSC(buf[i].x, buf[i].y); out.push([sc.s, sc.c]); }
      return out;
    }
    function currentLineC() {
      var arr = st.phase === 'IN_PASS' ? st.pass : (st.prevWin ? [{ c: st.prevWin.meanC }] : []);
      if (!arr.length) return null;
      var tail = arr.slice(-12);
      return mean(tail, 'c');
    }
    function getFrame() {
      if (!st.A || !o || st.phase === 'NO_AB' || st.phase === 'AB_SETTING') return null;
      return {
        lat: o.lat + st.A.y / R_EARTH / D2R,
        lon: o.lon + st.A.x / (R_EARTH * D2R * o.cosLat),
        phi0: st.phi0
      };
    }
    function serialize() {
      var pw = st.phase === 'IN_PASS' ? windowFromPass() : st.prevWin;
      return JSON.stringify({
        o: o, A: st.A, phi0: st.phi0, L: st.L, passNo: st.passNo, dir: st.dir,
        laneDir: st.laneDir, anchorR: st.anchorR, anchorManual: st.anchorManual,
        phase: st.phase, prevWin: pw
      });
    }
    function restore(json) {
      try {
        var d = JSON.parse(json);
        if (!d || !d.o || !d.A || d.phase === 'NO_AB' || d.phase === 'AB_SETTING') return false;
        o = d.o; setFrame(d.A, d.phi0);
        st.L = d.L; st.passNo = d.passNo; st.dir = d.dir; st.laneDir = d.laneDir;
        st.anchorR = d.anchorR; st.anchorManual = !!d.anchorManual;
        st.prevWin = d.prevWin; st.phase = 'TURNING';
        st.turn = { sum: 0, lastH: 0, predicted: true }; st.run = null; st.restored = true;
        buf = []; pathD = 0;
        return true;
      } catch (e) { return false; }
    }

    return {
      addFix: addFix, markA: markA, finishAB: finishABManual,
      adjustLane: adjustLane, markTramHere: markTramHere,
      setConfig: setConfig, reset: reset, snapshot: snapshot, trail: trail,
      currentLineC: currentLineC, getFrame: getFrame, serialize: serialize, restore: restore,
      isTram: isTram, cfg: cfg
    };
  }

  return { createTracker: createTracker, DEFAULTS: DEFAULTS };
});
