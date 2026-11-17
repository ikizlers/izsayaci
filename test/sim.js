// Gürültülü GPS simülasyonu: gidiş-dönüş (U dönüşlü) sürüş, iz sırası doğruluğu
const { createTracker } = require('../core.js');

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function gauss(r) { return Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r()); }

function run({ W, N, rows, len, noise, drift, seed, bearing, speed, skipLane }) {
  const r = rng(seed);
  const lat0 = 39.0, lon0 = 35.0, cos = Math.cos(lat0 * Math.PI / 180);
  const b = bearing * Math.PI / 180;
  const u = { x: Math.sin(b), y: Math.cos(b) }, n = { x: Math.cos(b), y: -Math.sin(b) };
  const T = createTracker({ width: W, interval: N, allowSkip: !!skipLane });
  let t = 1e6, dx = 0, dy = 0, truthL = 0, errors = 0, checks = 0, tramHits = 0, tramExpected = 0;
  const dt = 1;
  const trueLane = []; // her sıra için gerçek lane
  let lane = 0, dir = 1, first = true;
  const events = [];

  function fix(s, c) {
    dx += gauss(r) * drift; dy += gauss(r) * drift;
    dx *= 0.995; dy *= 0.995;
    const x = s * u.x + c * n.x + dx + gauss(r) * noise;
    const y = s * u.y + c * n.y + dy + gauss(r) * noise;
    t += dt * 1000;
    const res = T.addFix({ lat: lat0 + y / 6371000 / (Math.PI / 180), lon: lon0 + x / 6371000 / (Math.PI / 180) / cos, t, acc: 5, speed: null });
    if (first && t > 1e6 + 3000) { first = false; T.markA(); }
    res.events.forEach(e => events.push({ e, lane, dir }));
  }
  function straight(s0, s1, c) {
    const step = speed * dt, L = Math.abs(s1 - s0), sg = Math.sign(s1 - s0);
    for (let d = 0; d < L; d += step) fix(s0 + sg * d, c);
  }
  // başlangıç: A öncesi 3 fix
  const c0 = 0;
  let s = 0;
  for (let i = 0; i < 3; i++) { fix(s, c0); s += speed; }
  const sched = [];
  let c = c0;
  for (let row = 0; row < rows; row++) {
    const sEnd = dir > 0 ? len : 0;
    const startS = dir > 0 ? (row === 0 ? s : 0) : len;
    straight(startS, sEnd, c);
    // U dönüşü: yarım daire, kayma = skip lane (normalde 1, 2 sıra atlayarak da olabilir)
    const k = (skipLane && row % 4 === 1) ? 2 : 1;
    const side = 1; // hep aynı tarafa ilerle
    const rad = k * W / 2;
    const cStart = c, cNew = c + side * k * W;
    const sCenter = sEnd;
    const steps = Math.max(8, Math.round(Math.PI * Math.max(rad, 14) * 1.3 / (speed * dt)));
    for (let i = 1; i <= steps; i++) {
      const a = Math.PI * i / steps;
      const sOff = dir * Math.max(rad, 14) * Math.sin(a);
      const cOff = (cNew - cStart) * (1 - Math.cos(a)) / 2;
      fix(sCenter + sOff, cStart + cOff);
    }
    c = cNew; lane += k; dir = -dir;
    sched.push({ row: row + 1, lane });
  }
  // son sıra
  const sEnd = dir > 0 ? len : 0;
  straight(dir > 0 ? 0 : len, sEnd, c);

  const passes = events.filter(x => x.e.type === 'pass').slice(1);
  let wrongL = 0;
  passes.forEach((p, i) => { if (sched[i] && p.e.L !== sched[i].lane) wrongL++; });
  return { passes: passes.length, expected: rows, wrongL, final: T.snapshot().L, trueFinal: lane, got: passes.map(p=>p.e.L).join(','), want: sched.map(p=>p.lane).join(',') };
}

if (process.argv[2]==='scan') { for (let seed=1;seed<=12;seed++){ const o=run({W:+(process.argv[3]||4),N:3,rows:14,len:250,noise:1.5,drift:0,seed:seed*7919+(+(process.argv[3]||4)),bearing:(seed*53)%360,speed:2.2,skipLane:false}); console.log(seed,o.wrongL,o.passes,o.got); } process.exit(); }
if (process.argv[2]) { global.DBG=1; console.log(run({W:4,N:3,rows:14,len:250,noise:1.5,drift:0,seed:7919*2+4,bearing:53,speed:2.2,skipLane:false})); process.exit(); }
let total = 0, bad = 0;
const widths = [3, 4, 6, 9, 12];
for (const W of widths) for (const noise of [0.3, 0.8, 1.5]) for (const drift of [0, 0.15]) for (const skipLane of [false, true]) {
  let fails = 0, runs = 0, passErr = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const o = run({ W, N: 3, rows: 14, len: 250, noise, drift, seed: seed * 7919 + W, bearing: (seed * 53) % 360, speed: 2.2, skipLane });
    runs++;
    if (o.passes !== o.expected || o.wrongL > 0 || o.final !== o.trueFinal) fails++;
  }
  total += runs; bad += fails;
  console.log(`W=${W} gürültü=${noise}m drift=${drift} atlama=${skipLane}: hatalı ${fails}/${runs}`);
}
console.log(`TOPLAM hatalı koşu: ${bad}/${total}`);
