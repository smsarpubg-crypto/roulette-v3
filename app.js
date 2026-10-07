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
const NEIGHBOR_SPAN=9,BASELINE=9/37,DEALER_WARMUP=8,MIN_PHYSICS=8;
const VALID_ANOMALY=new Set(['normal','long_bounce','wall_hit','diverter','erratic']);
const VALID_DIR=new Set(['cw','ccw','unknown']);
const STORAGE='bonhayan_roulette_v5_spins',SETTINGS='bonhayan_roulette_v5_settings';
const OLD_STORAGES=['bonhayan_roulette_v4_spins','bonhayan_roulette_v3_spins','bonhayan_roulette_v2_results'];
const OLD_SETTINGS=['bonhayan_roulette_v4_settings','bonhayan_roulette_v3_settings'];
function cleanDir(v){return VALID_DIR.has(v)?v:'unknown'}
function num(v){v=Number(v);return Number.isFinite(v)?v:null}
function validPocket(v){v=Number(v);return Number.isInteger(v)&&v>=0&&v<=36?v:null}
function cleanAnomaly(v){return VALID_ANOMALY.has(v)?v:'normal'}
function anomalyAr(v){return v==='long_bounce'?'قفزة طويلة':v==='wall_hit'?'ضربة جدار':v==='diverter'?'اصطدام قوي بالـ deflector':v==='erratic'?'ارتداد غير منتظم':'طبيعي'}
function normalizePhysics(p){if(!p||typeof p!=='object')return null;const q={wheelRpm1:num(p.wheelRpm1),ballRpm1:num(p.ballRpm1),wheelRpm2:num(p.wheelRpm2),ballRpm2:num(p.ballRpm2),sampleGap:num(p.sampleGap),refPocket:validPocket(p.refPocket),anomaly:cleanAnomaly(p.anomaly),bounceSeverity:Math.max(0,Math.min(3,num(p.bounceSeverity)||0))};return q}
function physicsUsable(p){return !!p&&p.wheelRpm2>0&&p.ballRpm2>0&&p.refPocket!==null}
function normalizeSpin(x){if(Number.isInteger(x)&&x>=0&&x<=36)return{n:x,wheelDir:'unknown',ballDir:'unknown',dealerId:0,physics:null};if(!x||!Number.isInteger(x.n)||x.n<0||x.n>36)return null;return{n:x.n,wheelDir:cleanDir(x.wheelDir),ballDir:cleanDir(x.ballDir),dealerId:Number.isInteger(x.dealerId)?x.dealerId:0,physics:normalizePhysics(x.physics)}}
function numbers(spins){return spins.map(s=>s.n)}
function counts(arr){const c=Array(37).fill(0);arr.forEach(n=>c[n]++);return c}
function zone(center,span=NEIGHBOR_SPAN){const i=wheelIndex.get(center),h=Math.floor(span/2),a=[];for(let d=-h;d<=h;d++)a.push(wheel[(i+d+37)%37]);return a}
function signedOffset(from,to){let d=(wheelIndex.get(to)-wheelIndex.get(from)+37)%37;if(d>18)d-=37;return d}
function offsetPocket(ref,off){return wheel[(wheelIndex.get(ref)+off+3700)%37]}
function sum(a){return a.reduce((x,y)=>x+y,0)}
function normalized(a){const s=sum(a);return s>0?a.map(x=>x/s):Array(37).fill(1/37)}
function circDist(a,b){const d=Math.abs(a-b)%37;return Math.min(d,37-d)}
function dirAr(v){return v==='cw'?'مع العقارب':v==='ccw'?'عكس العقارب':'غير محدد'}
function pct(x){return(x*100).toFixed(1)+'%'}
function dealerSegment(spins,id){return spins.filter(s=>s.dealerId===id)}
function physFeatures(p,ctx){
  if(!physicsUsable(p))return null;
  const gap=p.sampleGap&&p.sampleGap>0?p.sampleGap:null;
  const wd=gap&&p.wheelRpm1>0?(p.wheelRpm1-p.wheelRpm2)/gap:null;
  const bd=gap&&p.ballRpm1>0?(p.ballRpm1-p.ballRpm2)/gap:null;
  return{wr:p.wheelRpm2,br:p.ballRpm2,ratio:p.ballRpm2/Math.max(.1,p.wheelRpm2),wd,bd,opposite:cleanDir(ctx.wheelDir)!=='unknown'&&cleanDir(ctx.ballDir)!=='unknown'&&ctx.wheelDir!==ctx.ballDir?1:0,anomaly:cleanAnomaly(p.anomaly),bounceSeverity:Math.max(0,Math.min(3,num(p.bounceSeverity)||0))};
}
function featureDistance(a,b){
  let s=0,w=0;
  const add=(x,y,scale,weight)=>{if(x!==null&&y!==null&&Number.isFinite(x)&&Number.isFinite(y)){const d=(x-y)/scale;s+=weight*d*d;w+=weight}};
  add(a.wr,b.wr,3.0,1.3);add(a.br,b.br,10.0,1.5);add(a.ratio,b.ratio,1.2,1.2);add(a.wd,b.wd,2.0,.7);add(a.bd,b.bd,7.0,.8);add(a.opposite,b.opposite,1,1.0);add(a.bounceSeverity,b.bounceSeverity,1.0,.8);if(a.anomaly!==b.anomaly){s+=1.0;w+=1.0}
  return w?Math.sqrt(s/w):99;
}
function physicsPrediction(spins,ctx,curPhysics){
  ctx={wheelDir:cleanDir(ctx.wheelDir),ballDir:cleanDir(ctx.ballDir),dealerId:Number.isInteger(ctx.dealerId)?ctx.dealerId:0};
  const curF=physFeatures(curPhysics,ctx);
  const seg=dealerSegment(spins,ctx.dealerId);
  if(seg.length<DEALER_WARMUP)return{center:null,zone:[],decision:'learning',confidence:'learning',reason:'مرحلة تعلّم الديلر '+seg.length+'/'+DEALER_WARMUP+'.',modelN:seg.length,localN:0};
  if(!curF)return{center:null,zone:[],decision:'no_bet',confidence:'none',reason:'دخل RPM العجلة + RPM الكورة + رقم المرجع قبل النتيجة.',modelN:seg.length,localN:0};
  const rows=[];
  for(let i=0;i<spins.length;i++){
    const s=spins[i];if(!physicsUsable(s.physics))continue;
    // فصل صارم للديلر: لا نستخدم أي فرّة من ديلر سابق في التوقع الحالي.
    if(s.dealerId!==ctx.dealerId)continue;
    const sf=physFeatures(s.physics,s);if(!sf)continue;
    const dist=featureDistance(curF,sf);
    let weight=Math.exp(-1.25*dist*dist);
    if(ctx.wheelDir!=='unknown'&&s.wheelDir!==ctx.wheelDir)weight*=0.22;
    if(ctx.ballDir!=='unknown'&&s.ballDir!==ctx.ballDir)weight*=0.22;
    const age=spins.length-1-i;weight*=Math.exp(-age/80);
    if(weight>.002)rows.push({s,dist,weight,off:signedOffset(s.physics.refPocket,s.n)});
  }
  rows.sort((a,b)=>a.dist-b.dist);
  const near=rows.slice(0,18),localSame=near.filter(r=>r.s.dealerId===ctx.dealerId&&r.dist<1.35),samePhys=seg.filter(s=>physicsUsable(s.physics)).length;
  if(samePhys<MIN_PHYSICS||localSame.length<5)return{center:null,zone:[],decision:'no_bet',confidence:'low',reason:'القياسات موجودة، لكن نحتاج أمثلة فيزيائية مشابهة أكثر لنفس الديلر. عندك '+samePhys+' فرّات بقياسات و '+localSame.length+' مشابهة محليًا.',modelN:samePhys,localN:localSame.length};
  const offScore=Array(37).fill(0.015); // index offset +18
  for(const r of near){for(let off=-18;off<=18;off++){const d=circDist((r.off+37)%37,(off+37)%37);const k=d===0?1:d===1?.58:d===2?.24:d===3?.08:0;offScore[off+18]+=r.weight*k}}
  const probs=normalized(offScore),rank=[...Array(37).keys()].map(i=>({off:i-18,p:probs[i]})).sort((a,b)=>b.p-a.p);
  const bestOff=rank[0].off,center=offsetPocket(curPhysics.refPocket,bestOff),z=zone(center);
  // Compute zone probability in offset space around best offset.
  let score=0;for(let d=-4;d<=4;d++){let o=bestOff+d;while(o>18)o-=37;while(o<-18)o+=37;score+=probs[o+18]}
  const secondCenter=offsetPocket(curPhysics.refPocket,rank[1].off);let secondScore=0;const secondOff=rank[1].off;for(let d=-4;d<=4;d++){let o=secondOff+d;while(o>18)o-=37;while(o<-18)o+=37;secondScore+=probs[o+18]}
  const edge=score-BASELINE,margin=Math.max(0,score-secondScore),effective=near.reduce((a,r)=>a+r.weight,0),avgDist=near.slice(0,8).reduce((a,r)=>a+r.dist,0)/Math.min(8,near.length);
  const anomalyPenalty=curF.anomaly==='normal'?0:(curF.anomaly==='long_bounce'?.055:curF.anomaly==='wall_hit'?.075:curF.anomaly==='diverter'?.065:.09)+curF.bounceSeverity*.015;
  const adjustedEdge=edge-anomalyPenalty;
  // Strong abstention gate. Model score alone is never enough: same-dealer support + similarity + edge required.
  const medium=localSame.length>=7&&samePhys>=10&&effective>=2.4&&avgDist<=1.15&&adjustedEdge>=.055&&margin>=.006;
  const high=localSame.length>=10&&samePhys>=14&&effective>=3.6&&avgDist<=.90&&adjustedEdge>=.085&&margin>=.012&&curF.anomaly==='normal';
  const reason=medium?(curF.anomaly==='normal'?'القياسات الحركية متوافقة مع فرّات سابقة لنفس الديلر.':'يوجد نمط حركي، لكن الارتداد المسجل خفّض الثقة؛ اعتبر القطاع فقط.'):'الفلتر الفيزيائي رفض التوقع: التشابه/الدعم أو هامش الأفضلية بعد خصم الارتداد غير كافي.';
  return{center,zone:z,score,edge,adjustedEdge,margin,decision:medium?'candidate':'no_bet',confidence:high?'high':medium?'medium':'low',reason,modelN:samePhys,localN:localSame.length,effective,avgDist,bestOff,anomaly:curF.anomaly,bounceSeverity:curF.bounceSeverity};
}
function logChoose(n,k){let s=0;for(let i=1;i<=k;i++)s+=Math.log(n-k+i)-Math.log(i);return s}
function binomTail(n,k,p){if(k<=0)return 1;if(k>n)return 0;let total=0;for(let i=k;i<=n;i++)total+=Math.exp(logChoose(n,i)+i*Math.log(p)+(n-i)*Math.log(1-p));return Math.min(1,total)}
function wilson(hits,n,z=1.96){if(!n)return[0,1];const ph=hits/n,zz=z*z,den=1+zz/n,center=(ph+zz/(2*n))/den,half=z*Math.sqrt((ph*(1-ph)+zz/(4*n))/n)/den;return[Math.max(0,center-half),Math.min(1,center+half)]}
function sectorAnalysis(spins){const arr=numbers(spins),c=counts(arr),n=arr.length;return sectors.map((s,idx)=>{const hits=s.reduce((a,x)=>a+c[x],0),p=s.length/37,raw=n?binomTail(n,hits,p):1;return{idx,hits,p,pct:n?hits/n:0,adj:Math.min(1,raw*6),nums:s}}).sort((a,b)=>a.adj-b.adj||b.pct-a.pct)[0]}
function historicalZoneAnalysis(spins){const arr=numbers(spins),n=arr.length,c=counts(arr);let best=null;for(const center of wheel){const z=zone(center),hits=z.reduce((s,x)=>s+c[x],0);if(!best||hits>best.hits)best={center,zone:z,hits}}if(!best||!n)return{center:null,zone:[],hits:0,pct:0,adj:1};const raw=binomTail(n,best.hits,BASELINE);return{...best,pct:best.hits/n,adj:Math.min(1,raw*37)}}
function futureBacktest(spins){let hits=0,preds=0,candidateHits=0,candidatePreds=0,physPreds=0,physHits=0;const rows=[];for(let i=0;i<spins.length;i++){const target=spins[i];if(!physicsUsable(target.physics))continue;const prior=spins.slice(0,i),p=physicsPrediction(prior,target,target.physics);if(p.center===null)continue;physPreds++;const hit=p.zone.includes(target.n);if(hit)physHits++;if(p.decision==='candidate'){candidatePreds++;if(hit)candidateHits++}preds++;if(hit)hits++;rows.push({i,center:p.center,actual:target.n,hit,decision:p.decision,dealerId:target.dealerId})}return{hits,preds,rate:preds?hits/preds:0,ci:wilson(hits,preds),p:preds?binomTail(preds,hits,BASELINE):1,candidateHits,candidatePreds,candidateRate:candidatePreds?candidateHits/candidatePreds:0,physHits,physPreds,rows}}
function evidenceLabel(sec,z,bk,n){if(bk.candidatePreds>=30&&wilson(bk.candidateHits,bk.candidatePreds)[0]>BASELINE&&binomTail(bk.candidatePreds,bk.candidateHits,BASELINE)<.01)return['نمط فيزيائي يستاهل متابعة','good','المرشحات الفيزيائية المستقبلية تجاوزت 9/37 في هذه العينة.'];if(bk.candidatePreds>=15&&bk.candidateRate>BASELINE+.06)return['إشارة تحتاج عينة أكبر','warn','المرشحات أفضل من الطبيعي في هذه العينة، لكن العدد للحين صغير.'];if(n<20)return['ما عندنا بيانات كافية','neutral','نحتاج فرّات أكثر وقياسات قبل النتيجة.'];return['ما في نمط مثبت','bad','الأداء الحالي ما أثبت أفضلية ثابتة فوق 9/37.']}
function mulberry32(a){return function(){let t=a+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
function sim(seed,pattern){const rnd=mulberry32(seed),sp=[];let dealer=0;for(let i=0;i<520;i++){if(i&&i%52===0)dealer++;const ref=wheel[Math.floor(rnd()*37)],wr=9+rnd()*8,br=35+rnd()*35,gap=1+rnd(),wr1=wr+(pattern?(.5+rnd()*1.5):rnd()*2),br1=br+(pattern?(3+rnd()*6):rnd()*8),wheelDir=rnd()<.5?'cw':'ccw',ballDir=wheelDir==='cw'?'ccw':'cw';let n;if(pattern){const ratio=br/wr;let off=Math.round(7+ratio*2.4+(br1-br)/gap*.18+(dealer%3-1)*1.2+(rnd()-.5)*3);off=((off+18+3700)%37)-18;n=offsetPocket(ref,off)}else n=Math.floor(rnd()*37);sp.push({n,wheelDir,ballDir,dealerId:dealer,physics:{wheelRpm1:wr1,ballRpm1:br1,wheelRpm2:wr,ballRpm2:br,sampleGap:gap,refPocket:ref}})}return futureBacktest(sp)}
function runSimulation(seed){const f=sim(seed,false),p=sim(seed+777,true);return{fair:f,pattern:p}}
function bootstrap(document){
 const $=id=>document.getElementById(id);let spins=[];let settings={wheelDir:'cw',ballDir:'ccw',dealerId:0,physics:{wheelRpm1:null,ballRpm1:null,wheelRpm2:null,ballRpm2:null,sampleGap:null,refPocket:null,anomaly:'normal',bounceSeverity:0}};
 try{let raw=JSON.parse(localStorage.getItem(STORAGE)||'null');if(!Array.isArray(raw)){for(const k of OLD_STORAGES){const x=JSON.parse(localStorage.getItem(k)||'null');if(Array.isArray(x)){raw=x;break}}}spins=(Array.isArray(raw)?raw:[]).map(normalizeSpin).filter(Boolean);let st=JSON.parse(localStorage.getItem(SETTINGS)||'null');if(!st){for(const k of OLD_SETTINGS){const x=JSON.parse(localStorage.getItem(k)||'null');if(x){st=x;break}}}if(st){settings.wheelDir=cleanDir(st.wheelDir);settings.ballDir=cleanDir(st.ballDir);settings.dealerId=Number.isInteger(st.dealerId)?st.dealerId:(spins.length?spins[spins.length-1].dealerId:0);settings.physics=normalizePhysics(st.physics)||settings.physics}else settings.dealerId=spins.length?spins[spins.length-1].dealerId:0}catch(e){spins=[]}
 const save=()=>{try{localStorage.setItem(STORAGE,JSON.stringify(spins));localStorage.setItem(SETTINGS,JSON.stringify(settings))}catch(e){}};
 const readPhysics=()=>normalizePhysics({wheelRpm1:$('wheelRpm1').value,ballRpm1:$('ballRpm1').value,wheelRpm2:$('wheelRpm2').value,ballRpm2:$('ballRpm2').value,sampleGap:$('sampleGap').value,refPocket:$('refPocket').value,anomaly:$('anomaly').value,bounceSeverity:$('bounceSeverity').value});
 const clearPhysics=()=>{settings.physics={wheelRpm1:null,ballRpm1:null,wheelRpm2:null,ballRpm2:null,sampleGap:null,refPocket:null,anomaly:'normal',bounceSeverity:0};for(const id of ['wheelRpm1','ballRpm1','wheelRpm2','ballRpm2','sampleGap','refPocket'])$(id).value='';$('anomaly').value='normal';$('bounceSeverity').value='0';save();render()};
 const grid=$('numberGrid');for(let n=0;n<=36;n++){const b=document.createElement('button');b.className='num '+(n===0?'green':(red.has(n)?'red':''));b.textContent=n;b.addEventListener('click',()=>{settings.physics=readPhysics();spins.push({n,wheelDir:settings.wheelDir,ballDir:settings.ballDir,dealerId:settings.dealerId,physics:settings.physics});settings.physics={wheelRpm1:null,ballRpm1:null,wheelRpm2:null,ballRpm2:null,sampleGap:null,refPocket:null,anomaly:'normal',bounceSeverity:0};for(const id of ['wheelRpm1','ballRpm1','wheelRpm2','ballRpm2','sampleGap','refPocket'])$(id).value='';$('anomaly').value='normal';$('bounceSeverity').value='0';save();render()});grid.appendChild(b)}
 function wireDir(group,key){document.querySelectorAll('[data-'+group+']').forEach(btn=>btn.addEventListener('click',()=>{settings[key]=btn.getAttribute('data-'+group);save();render()}))}wireDir('wheel-dir','wheelDir');wireDir('ball-dir','ballDir');
 $('swapDirBtn').addEventListener('click',()=>{const a=settings.wheelDir;settings.wheelDir=settings.ballDir;settings.ballDir=a;save();render()});
 $('newDealerBtn').addEventListener('click',()=>{if(confirm('تغيّر الديلر؟ بنبدأ تعلّم جديد بدون مسح النتائج القديمة.')){settings.dealerId=(settings.dealerId||0)+1;clearPhysics()}});
 $('undoBtn').addEventListener('click',()=>{if(spins.length){const s=spins.pop();settings.physics=s.physics||settings.physics;save();syncInputs();render()}});
 $('resetBtn').addEventListener('click',()=>{if(confirm('متأكد تبا تمسح كل النتائج؟')){spins=[];settings.dealerId=0;clearPhysics()}});$('clearPhysicsBtn').addEventListener('click',clearPhysics);$('selfTestBtn').addEventListener('click',runSelfTest);
 for(const id of ['wheelRpm1','ballRpm1','wheelRpm2','ballRpm2','sampleGap','refPocket','bounceSeverity'])$(id).addEventListener('input',()=>{settings.physics=readPhysics();save();render()});$('anomaly').addEventListener('change',()=>{settings.physics=readPhysics();save();render()});
 function syncInputs(){for(const id of ['wheelRpm1','ballRpm1','wheelRpm2','ballRpm2','sampleGap','refPocket'])$(id).value=settings.physics&&settings.physics[id]!=null?settings.physics[id]:'';$('anomaly').value=settings.physics&&settings.physics.anomaly?settings.physics.anomaly:'normal';$('bounceSeverity').value=settings.physics&&settings.physics.bounceSeverity!=null?settings.physics.bounceSeverity:0}
 function render(){const n=spins.length,c=counts(numbers(spins)),sec=sectorAnalysis(spins),za=historicalZoneAnalysis(spins),bk=futureBacktest(spins),cur=readPhysics(),pred=physicsPrediction(spins,{...settings},cur),dseg=dealerSegment(spins,settings.dealerId);$('spinCount').textContent=n;$('dealerSpinCount').textContent=dseg.length;document.querySelectorAll('[data-wheel-dir]').forEach(b=>b.classList.toggle('active',b.getAttribute('data-wheel-dir')===settings.wheelDir));document.querySelectorAll('[data-ball-dir]').forEach(b=>b.classList.toggle('active',b.getAttribute('data-ball-dir')===settings.ballDir));$('directionSummary').textContent='العجلة: '+dirAr(settings.wheelDir)+' • الكورة: '+dirAr(settings.ballDir)+' • الديلر #'+settings.dealerId;
 const f=physFeatures(cur,settings);$('physicsSummary').textContent=f?('القياس الحالي: عجلة '+f.wr.toFixed(1)+' RPM • كورة '+f.br.toFixed(1)+' RPM • النسبة '+f.ratio.toFixed(2)+(f.wd!==null?' • تباطؤ العجلة '+f.wd.toFixed(2):'')+(f.bd!==null?' • تباطؤ الكورة '+f.bd.toFixed(2):'')):'ما في قياسات مكتملة للفرّة الحالية.';
   if($('phase1')){$('phase1').textContent=f?('العجلة '+f.wr.toFixed(1)+' RPM / الكورة '+f.br.toFixed(1)+' RPM / الاتجاه '+dirAr(settings.wheelDir)+' مقابل '+dirAr(settings.ballDir)):'بانتظار قياسات السرعة والاتجاه';$('phase2').textContent=f?('التباطؤ: '+(f.wd!==null?f.wd.toFixed(2):'—')+' عجلة، '+(f.bd!==null?f.bd.toFixed(2):'—')+' كورة • الارتداد: '+anomalyAr(f.anomaly)+' (شدة '+f.bounceSeverity+'/3)'):'بانتظار قياسين متتابعين';$('phase3').textContent=pred.center===null?'لا يوجد قطاع صالح للحين':('المركز '+pred.center+' • 9 جيران: '+pred.zone.join(' · '));$('phase4').textContent=pred.decision==='candidate'?'قطاع مرشح — '+(pred.confidence==='high'?'ثقة عالية':'ثقة متوسطة'):'امتناع عن التوقع';}
 $('predictionCenter').textContent=pred.center===null?'—':pred.center;$('predictionZone').textContent=pred.center===null?'—':pred.zone.join(' · ');$('predictionConfidence').textContent=pred.confidence==='high'?'عالية':pred.confidence==='medium'?'متوسطة':pred.confidence==='learning'?'تعلّم':pred.confidence==='low'?'ضعيفة':'—';$('predictionSupport').textContent='قياسات الديلر: '+(pred.modelN||0)+' • حالات مشابهة: '+(pred.localN||0)+(pred.avgDist!=null?' • مسافة التشابه '+pred.avgDist.toFixed(2):'')+(pred.adjustedEdge!=null?' • أفضلية بعد خصم الارتداد '+pct(pred.adjustedEdge):pred.edge!=null?' • أفضلية نموذجية '+pct(pred.edge):'');$('betDecision').textContent=pred.decision==='candidate'?'مرشح للتجربة':pred.decision==='learning'?'تعلّم — لا تلعب':'لا تلعب';$('betReason').textContent=pred.reason;
 const[label,kind,note]=evidenceLabel(sec,za,bk,n);$('patternState').textContent=label;$('patternBadge').className='badge '+kind;$('patternBadge').textContent=kind==='good'?'دليل قوي':kind==='warn'?'يحتاج تأكيد':kind==='bad'?'غير مثبت':'بانتظار بيانات';$('patternNote').textContent=note;
 $('bestSector').textContent=n?'القطاع '+(sec.idx+1):'—';$('bestSectorPct').textContent=n?pct(sec.pct):'—';$('sectorP').textContent=n?sec.adj.toFixed(4):'—';$('predCount').textContent=bk.preds;$('watchZone').textContent=n?za.zone.join(' · '):'—';$('zoneEvidence').textContent=n?('ظهرت تاريخيًا '+za.hits+' من '+n+' ('+pct(za.pct)+')، p-adj='+za.adj.toFixed(4)):'—';$('futureHits').textContent=bk.hits;$('futureRate').textContent=bk.preds?pct(bk.rate):'—';$('baselinePct').textContent=pct(BASELINE);$('futureCI').textContent=bk.preds?(pct(bk.ci[0])+' – '+pct(bk.ci[1])):'—';$('directionBacktest').innerHTML=bk.candidatePreds?('<bdi dir="ltr">'+bk.candidateHits+' / '+bk.candidatePreds+' = '+pct(bk.candidateRate)+'</bdi>'):'—';$('futureVerdict').textContent=bk.candidatePreds?('كل التوقعات الفيزيائية: '+bk.hits+'/'+bk.preds+' ('+pct(bk.rate)+'). المرشحة فقط: '+bk.candidateHits+'/'+bk.candidatePreds+' ('+pct(bk.candidateRate)+').'):'ما عندنا مرشحات فيزيائية كافية للحكم.';
 const recent=$('recentResults');recent.innerHTML='';if(!n)recent.innerHTML='<span class="small">ما سجلت شي للحين.</span>';else spins.slice(-20).reverse().forEach(s=>{const x=document.createElement('span');x.className='chip';x.title='ديلر '+s.dealerId+(physicsUsable(s.physics)?' / قياسات محفوظة':' / بدون قياسات');x.textContent=s.n;recent.appendChild(x)});const top=$('topNumbers');top.innerHTML='';if(!n)top.textContent='—';else[...Array(37).keys()].sort((a,b)=>c[b]-c[a]||a-b).slice(0,5).forEach(x=>{const d=document.createElement('div');d.className='row';d.innerHTML='<b>'+x+'</b><span>'+c[x]+' مرة</span>';top.appendChild(d)});const bars=$('sectorBars');bars.innerHTML='';sectors.forEach((s,idx)=>{const hits=s.reduce((a,x)=>a+c[x],0),raw=n?hits/n:0,expected=s.length/37,d=document.createElement('div');d.className='barrow';d.innerHTML='<div class="barhead"><b>القطاع '+(idx+1)+': '+s.join(' · ')+'</b><span>'+(n?(hits+' ('+pct(raw)+') | المتوقع '+pct(expected)):'—')+'</span></div><div class="bar"><div class="fill" style="width:'+(n?Math.min(100,raw*100):0)+'%"></div></div>';bars.appendChild(d)})}
 async function runSelfTest(){const btn=$('selfTestBtn'),prog=$('testProgress'),out=$('selfTestResult');btn.disabled=true;prog.style.width='0%';out.textContent='جاري الاختبارات...';const seeds=[20261007,314159,9102026],rows=[];for(let i=0;i<3;i++){await new Promise(r=>setTimeout(r,0));rows.push(runSimulation(seeds[i]));prog.style.width=((i+1)/3*100)+'%'}const avg=(key,sub)=>rows.reduce((a,r)=>a+(r[key][sub]||0),0)/rows.length;out.innerHTML='تمت <b>3 جولات</b>.<br>• العشوائي — كل توقعات الفيزياء: <b>'+pct(avg('fair','rate'))+'</b>، المرشحة: <b>'+pct(avg('fair','candidateRate'))+'</b> من '+Math.round(avg('fair','candidatePreds'))+' مرشح/جولة.<br>• النموذج الصناعي الفيزيائي — كل التوقعات: <b>'+pct(avg('pattern','rate'))+'</b>، المرشحة: <b>'+pct(avg('pattern','candidateRate'))+'</b> من '+Math.round(avg('pattern','candidatePreds'))+' مرشح/جولة.<br><b>المغزى:</b> V5 يستخدم القياسات قبل النتيجة ويقدر يمتنع بدل ما يجبر توقع.';btn.disabled=false}
 syncInputs();render();
}
return{wheel,sectors,NEIGHBOR_SPAN,BASELINE,DEALER_WARMUP,normalizeSpin,zone,physicsPrediction,futureBacktest,sectorAnalysis,historicalZoneAnalysis,evidenceLabel,runSimulation,wilson,binomTail,bootstrap};
});
