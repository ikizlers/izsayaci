const { createTracker } = require('../core.js');
const k=111320, lat0=39, kl=k*Math.cos(lat0*Math.PI/180);
for (const kmh of [8,12,15,20,25]) {
  const v=kmh/3.6; let res=[];
  for (let off=0; off<v; off+=v/4) {
    const T=createTracker({width:6,interval:3}); let t=1e12, first=true, ev=null;
    const pts=[]; for(let s=-off;s<=250;s+=v) pts.push([0,s]);
    // dönüş: 14 m çıkıp 6 m yana, geri
    const n=Math.max(6,Math.round(Math.PI*14*1.3/v)); for(let i=1;i<=n;i++){const a=Math.PI*i/n; pts.push([6*(1-Math.cos(a))/2,250+14*Math.sin(a)]);}
    pts.forEach(([x,y],i)=>{ const r=T.addFix({lat:lat0+y/k,lon:35+x/kl,t:t+=1000,acc:4,speed:v});
      if(i===3&&first){first=false;T.markA();}
      r.events.forEach(e=>{ if(e.type==='turn_start'&&!ev) ev={y,x}; }); });
    res.push(ev? Math.max(0,ev.y-250).toFixed(0)+'m ileri/'+ev.x.toFixed(1)+'m yan':'yok');
  }
  console.log(kmh+' km/s: dönüş başlangıcı algılanana kadar katedilen:', res.join(' | '));
}
