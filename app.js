(function(root,factory){
  const core=factory();
  if(typeof module==='object'&&module.exports) module.exports=core;
  if(root) root.BonhayanRouletteCore=core;
  if(root&&root.document) root.addEventListener('DOMContentLoaded',()=>core.bootstrap(root.document));
})(typeof window!=='undefined'?window:null,function(){
  'use strict';
  const wheel=[0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
  const wheelIndex=new Map(wheel.map((n,i)=>[n,i]));
  const red=new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
  const sectors=[wheel.slice(0,7),wheel.slice(7,13),wheel.slice(13,19),wheel.slice(19,25),wheel.slice(25,31),wheel.slice(31,37)];
  const NEIGHBOR_SPAN=9, BASELINE=NEIGHBOR_SPAN/37, HALF_LIFE=18;
  const VALID_DIR=new Set(['cw','ccw','unknown']);
  const STORAGE='bonhayan_roulette_v3_spins';
  const SETTINGS='bonhayan_roulette_v3_settings';

  function cleanDir(v){return VALID_DIR.has(v)?v:'unknown'}
  function normalizeSpin(x){
    if(Number.isInteger(x)&&x>=0&&x<=36) return {n:x,wheelDir:'unknown',ballDir:'unknown'};
    if(!x||!Number.isInteger(x.n)||x.n<0||x.n>36) return null;
    return {n:x.n,wheelDir:cleanDir(x.wheelDir),ballDir:cleanDir(x.ballDir)};
  }
  function numbers(spins){return spins.map(s=>s.n)}
  function counts(arr){const c=Array(37).fill(0);arr.forEach(n=>c[n]++);return c}
  function zone(center,span=NEIGHBOR_SPAN){const i=wheelIndex.get(center),h=Math.floor(span/2),a=[];for(let d=-h;d<=h;d++)a.push(wheel[(i+d+37)%37]);return a}
  function circDist(a,b){const d=Math.abs(a-b)%37;return Math.min(d,37-d)}
  function sum(a){return a.reduce((x,y)=>x+y,0)}
  function normalized(a){const s=sum(a);return s>0?a.map(x=>x/s):Array(37).fill(1/37)}
  function expWeight(age){return Math.exp(-Math.LN2*age/HALF_LIFE)}

  function recencyPocketProb(spins){
    const w=Array(37).fill(0.25); // smoothing
    const n=spins.length;
    spins.forEach((s,i)=>{w[s.n]+=expWeight(n-1-i)});
    return normalized(w);
  }
  function directionMatch(s,ctx){
    if(ctx.wheelDir!=='unknown'&&s.wheelDir!==ctx.wheelDir)return false;
    if(ctx.ballDir!=='unknown'&&s.ballDir!==ctx.ballDir)return false;
    return ctx.wheelDir!=='unknown'||ctx.ballDir!=='unknown';
  }
  function directionPocketProb(spins,ctx){
    const w=Array(37).fill(0.15),n=spins.length;let support=0;
    spins.forEach((s,i)=>{if(directionMatch(s,ctx)){w[s.n]+=expWeight(n-1-i);support++}});
    return {prob:normalized(w),support};
  }
  function transitionPocketProb(spins,ctx){
    if(spins.length<2)return {prob:Array(37).fill(1/37),support:0};
    const offsets=[], n=spins.length;
    for(let i=1;i<n;i++){
      if(!directionMatch(spins[i],ctx))continue;
      const a=wheelIndex.get(spins[i-1].n),b=wheelIndex.get(spins[i].n);
      offsets.push({off:(b-a+37)%37,w:expWeight(n-1-i)});
    }
    if(!offsets.length)return {prob:Array(37).fill(1/37),support:0};
    const last=wheelIndex.get(spins[n-1].n),p=Array(37).fill(0.02);
    for(let target=0;target<37;target++){
      const off=(target-last+37)%37;
      for(const o of offsets){
        const d=circDist(off,o.off);
        // small circular kernel: exact transition strongest, adjacent pockets still contribute.
        const k=d===0?1:d===1?0.55:d===2?0.22:d===3?0.08:0;
        p[wheel[target]]+=o.w*k;
      }
    }
    return {prob:normalized(p),support:offsets.length};
  }
  function candidateZoneScore(prob,center){return zone(center).reduce((s,n)=>s+prob[n],0)}
  function livePrediction(spins,ctx={wheelDir:'unknown',ballDir:'unknown'}){
    ctx={wheelDir:cleanDir(ctx.wheelDir),ballDir:cleanDir(ctx.ballDir)};
    if(!spins.length)return {center:null,zone:[],score:0,dirSupport:0,transSupport:0,weights:{recency:1,direction:0,transition:0},confidence:'none'};
    const r=recencyPocketProb(spins),d=directionPocketProb(spins,ctx),t=transitionPocketProb(spins,ctx);
    const dw=Math.min(0.85,d.support/24*0.85);
    const tw=Math.min(1.15,t.support/28*1.15);
    const mix=Array(37).fill(0);
    for(let n=0;n<37;n++)mix[n]=r[n]+dw*d.prob[n]+tw*t.prob[n];
    const p=normalized(mix);
    let best=null;
    for(const center of wheel){
      const score=candidateZoneScore(p,center);
      if(!best||score>best.score)best={center,zone:zone(center),score};
    }
    const support=d.support+t.support;
    const confidence=spins.length<12?'low':support>=30?'high':support>=12?'medium':'low';
    return {...best,dirSupport:d.support,transSupport:t.support,weights:{recency:1,direction:dw,transition:tw},confidence};
  }

  function logChoose(n,k){let s=0;for(let i=1;i<=k;i++)s+=Math.log(n-k+i)-Math.log(i);return s}
  function binomTail(n,k,p){
    if(k<=0)return 1;if(k>n)return 0;let total=0;
    for(let i=k;i<=n;i++)total+=Math.exp(logChoose(n,i)+i*Math.log(p)+(n-i)*Math.log(1-p));
    return Math.min(1,total);
  }
  function wilson(hits,n,z=1.96){
    if(!n)return [0,1];const ph=hits/n,zz=z*z,den=1+zz/n;
    const center=(ph+zz/(2*n))/den,half=z*Math.sqrt((ph*(1-ph)+zz/(4*n))/n)/den;
    return [Math.max(0,center-half),Math.min(1,center+half)];
  }
  function sectorAnalysis(spins){
    const arr=numbers(spins),c=counts(arr),n=arr.length;
    return sectors.map((s,idx)=>{const hits=s.reduce((a,x)=>a+c[x],0),p=s.length/37,raw=n?binomTail(n,hits,p):1;return {idx,hits,p,pct:n?hits/n:0,adj:Math.min(1,raw*6),nums:s}}).sort((a,b)=>a.adj-b.adj||b.pct-a.pct)[0];
  }
  function historicalZoneAnalysis(spins){
    const arr=numbers(spins),n=arr.length,c=counts(arr);let best=null;
    for(const center of wheel){const z=zone(center),hits=z.reduce((s,x)=>s+c[x],0);if(!best||hits>best.hits)best={center,zone:z,hits}}
    if(!best||!n)return {center:null,zone:[],hits:0,pct:0,adj:1};
    const raw=binomTail(n,best.hits,BASELINE);return {...best,pct:best.hits/n,adj:Math.min(1,raw*37)};
  }
  function futureBacktest(spins,warmup=12){
    let hits=0,preds=0,dirPreds=0,dirHits=0;
    const rows=[];
    for(let i=warmup;i<spins.length;i++){
      const ctx={wheelDir:spins[i].wheelDir,ballDir:spins[i].ballDir};
      const p=livePrediction(spins.slice(0,i),ctx);if(p.center===null)continue;
      const hit=p.zone.includes(spins[i].n);preds++;if(hit)hits++;
      const hasDir=ctx.wheelDir!=='unknown'||ctx.ballDir!=='unknown';
      if(hasDir){dirPreds++;if(hit)dirHits++}
      rows.push({i,center:p.center,zone:p.zone,actual:spins[i].n,hit,ctx});
    }
    return {hits,preds,rate:preds?hits/preds:0,ci:wilson(hits,preds),p:preds?binomTail(preds,hits,BASELINE):1,dirHits,dirPreds,dirRate:dirPreds?dirHits/dirPreds:0,rows};
  }
  function evidenceLabel(sec,z,bk,n){
    if(n<20)return ['ما عندنا بيانات كافية','neutral','قبل 20 فرّة نخلي الحكم حذر، لكن التوقع التجريبي يشتغل من بدري.'];
    const histStrong=Math.min(sec.adj,z.adj)<0.01,histWeak=Math.min(sec.adj,z.adj)<0.05;
    const futureStrong=bk.preds>=30&&bk.ci[0]>BASELINE&&bk.p<0.01;
    const futureLarge=bk.preds>=30&&bk.rate>BASELINE+0.10;
    if(futureStrong&&(histStrong||futureLarge))return ['نمط يستاهل متابعة','good','الـ backtest المستقبلي قوي، ومعه إما دعم تاريخي أو فرق عملي واضح فوق خط 9/37.'];
    if(histWeak||(bk.preds>=30&&bk.rate>BASELINE+0.05))return ['نمط ضعيف','warn','في إشارة، لكن الدليل للحين مب قوي كفاية للاعتماد.'];
    return ['ما في نمط مثبت','bad','الأداء الحالي ما أثبت أفضلية ثابتة فوق خط 9/37.'];
  }
  function pct(x){return (x*100).toFixed(1)+'%'}
  function dirAr(v){return v==='cw'?'مع العقارب':v==='ccw'?'عكس العقارب':'غير محدد'}

  function mulberry32(seed){return function(){let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
  function randomDir(rng){return rng()<0.5?'cw':'ccw'}
  function simSession(rng,n,mode='fair'){
    const spins=[];
    for(let i=0;i<n;i++){
      const wheelDir=randomDir(rng),ballDir=wheelDir==='cw'?'ccw':'cw';let value=Math.floor(rng()*37);
      if(mode==='directional'&&i>0&&rng()<0.58){
        const prev=wheelIndex.get(spins[i-1].n);
        const base=wheelDir==='cw'?8:29; // direction-conditioned relative landing tendency in synthetic test only
        const jitter=[-4,-3,-2,-1,0,1,2,3,4][Math.floor(rng()*9)];
        value=wheel[(prev+base+jitter+37)%37];
      }
      spins.push({n:value,wheelDir,ballDir});
    }
    return spins;
  }
  function runSimulation(seed=20261006,sessions=1000,spinsPer=60){
    const rng=mulberry32(seed);let fairHits=0,fairPreds=0,patternHits=0,patternPreds=0,falseStrong=0,patternStrong=0;
    for(let i=0;i<sessions;i++){
      const fair=simSession(rng,spinsPer,'fair'),fb=futureBacktest(fair),fs=sectorAnalysis(fair),fz=historicalZoneAnalysis(fair),[fl]=evidenceLabel(fs,fz,fb,fair.length);
      fairHits+=fb.hits;fairPreds+=fb.preds;if(fl==='نمط يستاهل متابعة')falseStrong++;
      const pat=simSession(rng,spinsPer,'directional'),pb=futureBacktest(pat),ps=sectorAnalysis(pat),pz=historicalZoneAnalysis(pat),[pl]=evidenceLabel(ps,pz,pb,pat.length);
      patternHits+=pb.hits;patternPreds+=pb.preds;if(pl==='نمط يستاهل متابعة')patternStrong++;
    }
    return {seed,sessions,spinsPer,fairRate:fairPreds?fairHits/fairPreds:0,patternRate:patternPreds?patternHits/patternPreds:0,falseStrongRate:falseStrong/sessions,patternStrongRate:patternStrong/sessions,baseline:BASELINE};
  }

  function bootstrap(document){
    const $=id=>document.getElementById(id);let spins=[];let settings={wheelDir:'cw',ballDir:'ccw'};
    try{
      const raw=JSON.parse(localStorage.getItem(STORAGE)||'null');
      const legacy=JSON.parse(localStorage.getItem('bonhayan_roulette_v2_results')||'[]');
      const src=Array.isArray(raw)?raw:(Array.isArray(legacy)?legacy:[]);spins=src.map(normalizeSpin).filter(Boolean);
      const st=JSON.parse(localStorage.getItem(SETTINGS)||'null');if(st){settings.wheelDir=cleanDir(st.wheelDir);settings.ballDir=cleanDir(st.ballDir)}
    }catch(e){spins=[]}
    const save=()=>{try{localStorage.setItem(STORAGE,JSON.stringify(spins));localStorage.setItem(SETTINGS,JSON.stringify(settings))}catch(e){}};
    const grid=$('numberGrid');
    for(let n=0;n<=36;n++){
      const b=document.createElement('button');b.className='num '+(n===0?'green':(red.has(n)?'red':''));b.textContent=n;
      b.addEventListener('click',()=>{spins.push({n,wheelDir:settings.wheelDir,ballDir:settings.ballDir});save();render()});grid.appendChild(b);
    }
    function wireDir(group,key){
      document.querySelectorAll('[data-'+group+']').forEach(btn=>btn.addEventListener('click',()=>{settings[key]=btn.getAttribute('data-'+group);save();render()}));
    }
    wireDir('wheel-dir','wheelDir');wireDir('ball-dir','ballDir');
    $('swapDirBtn').addEventListener('click',()=>{const a=settings.wheelDir;settings.wheelDir=settings.ballDir;settings.ballDir=a;save();render()});
    $('undoBtn').addEventListener('click',()=>{if(spins.length){spins.pop();save();render()}});
    $('resetBtn').addEventListener('click',()=>{if(confirm('متأكد تبا تمسح كل النتائج؟')){spins=[];save();render()}});
    $('selfTestBtn').addEventListener('click',runSelfTest);

    function render(){
      const n=spins.length,arr=numbers(spins),c=counts(arr),sec=sectorAnalysis(spins),za=historicalZoneAnalysis(spins),bk=futureBacktest(spins),pred=livePrediction(spins,settings);
      $('spinCount').textContent=n;
      document.querySelectorAll('[data-wheel-dir]').forEach(b=>b.classList.toggle('active',b.getAttribute('data-wheel-dir')===settings.wheelDir));
      document.querySelectorAll('[data-ball-dir]').forEach(b=>b.classList.toggle('active',b.getAttribute('data-ball-dir')===settings.ballDir));
      $('directionSummary').textContent='العجلة: '+dirAr(settings.wheelDir)+' • الكورة: '+dirAr(settings.ballDir);
      $('predictionCenter').textContent=pred.center===null?'—':pred.center;
      $('predictionZone').textContent=pred.center===null?'—':pred.zone.join(' · ');
      $('predictionSupport').textContent=pred.center===null?'—':('دعم الاتجاه: '+pred.dirSupport+' • انتقالات مشابهة: '+pred.transSupport+' • وزن الاتجاه '+pred.weights.direction.toFixed(2)+' • وزن الانتقال '+pred.weights.transition.toFixed(2));
      $('predictionConfidence').textContent=pred.confidence==='high'?'أعلى':pred.confidence==='medium'?'متوسط':pred.confidence==='low'?'محدود':'—';

      const [label,kind,note]=evidenceLabel(sec,za,bk,n);$('patternState').textContent=label;$('patternBadge').className='badge '+kind;
      $('patternBadge').textContent=kind==='good'?'دليل قوي':kind==='warn'?'دليل غير كافي':kind==='bad'?'غير مثبت':'بانتظار بيانات';$('patternNote').textContent=note;
      $('bestSector').textContent=n?'القطاع '+(sec.idx+1):'—';$('bestSectorPct').textContent=n?pct(sec.pct):'—';$('sectorP').textContent=n?sec.adj.toFixed(4):'—';$('predCount').textContent=bk.preds;
      $('watchZone').textContent=n?za.zone.join(' · '):'—';$('zoneEvidence').textContent=n?('ظهرت تاريخيًا '+za.hits+' من '+n+' ('+pct(za.pct)+')، p-adj='+za.adj.toFixed(4)):'—';
      $('futureHits').textContent=bk.hits;$('futureRate').textContent=bk.preds?pct(bk.rate):'—';$('baselinePct').textContent=n?pct(BASELINE):'—';$('futureCI').textContent=bk.preds?(pct(bk.ci[0])+' – '+pct(bk.ci[1])):'—';
      $('directionBacktest').textContent=bk.dirPreds?(bk.dirHits+' / '+bk.dirPreds+' = '+pct(bk.dirRate)):'—';
      if(bk.preds<30)$('futureVerdict').textContent='نحتاج '+(30-bk.preds)+' توقع مستقبلي إضافي على الأقل قبل الحكم.';else if(bk.ci[0]>BASELINE)$('futureVerdict').textContent='الـ backtest تجاوز خط 24.3% ضمن 95% CI في هذه العينة.';else $('futureVerdict').textContent='ما ثبت إن الاختيار المستقبلي أفضل من 24.3% الطبيعية لـ9 أرقام.';
      const recent=$('recentResults');recent.innerHTML='';if(!n)recent.innerHTML='<span class="small">ما سجلت شي للحين.</span>';else spins.slice(-20).reverse().forEach(s=>{const x=document.createElement('span');x.className='chip';x.title='عجلة '+dirAr(s.wheelDir)+' / كورة '+dirAr(s.ballDir);x.textContent=s.n;recent.appendChild(x)});
      const top=$('topNumbers');top.innerHTML='';if(!n)top.textContent='—';else [...Array(37).keys()].sort((a,b)=>c[b]-c[a]||a-b).slice(0,5).forEach(x=>{const d=document.createElement('div');d.className='row';d.innerHTML='<b>'+x+'</b><span>'+c[x]+' مرة</span>';top.appendChild(d)});
      const bars=$('sectorBars');bars.innerHTML='';sectors.forEach((s,idx)=>{const hits=s.reduce((a,x)=>a+c[x],0),raw=n?hits/n:0,expected=s.length/37,d=document.createElement('div');d.className='barrow';d.innerHTML='<div class="barhead"><b>القطاع '+(idx+1)+': '+s.join(' · ')+'</b><span>'+(n?(hits+' ('+pct(raw)+') | المتوقع '+pct(expected)):'—')+'</span></div><div class="bar"><div class="fill" style="width:'+(n?Math.min(100,raw*100):0)+'%"></div></div>';bars.appendChild(d)});
    }
    async function runSelfTest(){
      const btn=$('selfTestBtn'),prog=$('testProgress'),out=$('selfTestResult');btn.disabled=true;out.textContent='جاري 3 جولات اختبار مستقلة...';prog.style.width='0%';
      const seeds=[20261006,9102026,314159],rows=[];
      for(let i=0;i<seeds.length;i++){await new Promise(r=>setTimeout(r,0));rows.push(runSimulation(seeds[i],700,60));prog.style.width=((i+1)/3*100)+'%'}
      const fr=rows.reduce((s,r)=>s+r.fairRate,0)/3,pr=rows.reduce((s,r)=>s+r.patternRate,0)/3,fs=rows.reduce((s,r)=>s+r.falseStrongRate,0)/3,ps=rows.reduce((s,r)=>s+r.patternStrongRate,0)/3;
      out.innerHTML='تمت <b>3 جولات مستقلة</b> (كل جولة 700 جلسة عادلة + 700 جلسة نمط اتجاه صناعي، 60 فرّة للجلسة).<br>• متوسط إصابة العادل: <b>'+pct(fr)+'</b> مقابل الطبيعي <b>'+pct(BASELINE)+'</b><br>• متوسط إصابة نمط الاتجاه الصناعي: <b>'+pct(pr)+'</b><br>• إنذار قوي كاذب في العادل: <b>'+pct(fs)+'</b><br>• اكتشاف قوي للنمط الصناعي: <b>'+pct(ps)+'</b><br><b>مهم:</b> الاتجاه يُستخدم كإشارة ترجيح فقط، وما يتحول إلى ثقة عالية إلا إذا دعمه السجل والـ backtest.';
      btn.disabled=false;
    }
    render();
  }

  return {wheel,sectors,NEIGHBOR_SPAN,BASELINE,normalizeSpin,zone,livePrediction,sectorAnalysis,historicalZoneAnalysis,futureBacktest,evidenceLabel,simSession,runSimulation,wilson,binomTail,bootstrap};
});
