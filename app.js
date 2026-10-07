(()=>{
'use strict';
const wheel=[0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
const red=new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const pos=new Map(wheel.map((n,i)=>[n,i]));
const STORAGE='bonhayan_v16_spins', SETTINGS='bonhayan_v16_settings';
const $=id=>typeof document!=='undefined'?document.getElementById(id):null;
const mod=(n,m)=>((n%m)+m)%m;
const pct=x=>Number.isFinite(x)?(x*100).toFixed(1)+'%':'—';
const norm=a=>{const t=a.reduce((x,y)=>x+y,0)||1;return a.map(v=>v/t)};
function signedDelta(a,b){let d=pos.get(b)-pos.get(a);if(d>18)d-=37;if(d<-18)d+=37;return d}
function ew(age,hl){return Math.pow(.5,age/hl)}
function smooth(a,c,amt,r=1){for(let k=-r;k<=r;k++)a[mod(c+k,37)]+=amt*(r+1-Math.abs(k))/(r+1)}
function topFromScores(sc,count){return [...Array(37).keys()].sort((a,b)=>sc[b]-sc[a]).slice(0,count).map(i=>wheel[i])}
function makeRecency(hl=24,r=1){return nums=>{const s=Array(37).fill(.03);nums.slice(-120).reverse().forEach((n,age)=>smooth(s,pos.get(n),ew(age,hl),r));return norm(s)}}
function makeDelta(hl=24,r=1,window=120){return nums=>{const s=Array(37).fill(.03);if(nums.length<2)return norm(s);const ds=[];for(let i=Math.max(1,nums.length-window);i<nums.length;i++)ds.push(signedDelta(nums[i-1],nums[i]));const p0=pos.get(nums.at(-1));ds.reverse().forEach((d,age)=>smooth(s,mod(p0+d,37),ew(age,hl),r));return norm(s)}}
function makeCondPocket(tol=2,hl=32,r=1){return nums=>{const s=Array(37).fill(.03);if(nums.length<3)return norm(s);const last=nums.at(-1);let used=0;for(let i=Math.max(0,nums.length-180);i<nums.length-1;i++){const dist=Math.abs(signedDelta(last,nums[i]));if(dist<=tol){smooth(s,pos.get(nums[i+1]),ew(nums.length-2-i,hl)/(1+.4*dist),r);used++}}return used>=2?norm(s):makeRecency(24,1)(nums)}}
function makeCondDelta(tol=3,hl=28,r=1){return nums=>{const s=Array(37).fill(.03);if(nums.length<4)return norm(s);const cur=signedDelta(nums.at(-2),nums.at(-1)),p0=pos.get(nums.at(-1));let used=0;for(let i=Math.max(2,nums.length-180);i<nums.length-1;i++){const pd=signedDelta(nums[i-2],nums[i-1]);if(Math.abs(pd-cur)<=tol){const nd=signedDelta(nums[i-1],nums[i]);smooth(s,mod(p0+nd,37),ew(nums.length-1-i,hl)/(1+.25*Math.abs(pd-cur)),r);used++}}return used>=2?norm(s):makeDelta(24,1)(nums)}}
function makeCondAccel(tol=5,hl=28,r=1){return nums=>{const s=Array(37).fill(.03);if(nums.length<5)return norm(s);const d1=signedDelta(nums.at(-3),nums.at(-2)),d2=signedDelta(nums.at(-2),nums.at(-1)),ch=d2-d1,p0=pos.get(nums.at(-1));let used=0;for(let i=Math.max(3,nums.length-180);i<nums.length-1;i++){const a=signedDelta(nums[i-3],nums[i-2]),b=signedDelta(nums[i-2],nums[i-1]),ph=b-a;if(Math.abs(ph-ch)<=tol){const nd=signedDelta(nums[i-1],nums[i]);smooth(s,mod(p0+nd,37),ew(nums.length-1-i,hl)/(1+.2*Math.abs(ph-ch)),r);used++}}return used>=2?norm(s):makeDelta(24,1)(nums)}}
function makeSector(win=36,r=4){return nums=>{const s=Array(37).fill(.03);nums.slice(-win).reverse().forEach((n,age)=>{const wt=ew(age,Math.max(4,win/2)),p=pos.get(n);for(let k=-r;k<=r;k++)s[mod(p+k,37)]+=wt/(1+.3*Math.abs(k))});return norm(s)}}
function makeLag(lag=3,r=1){return nums=>{const s=Array(37).fill(.03);if(nums.length>=lag)smooth(s,pos.get(nums.at(-lag)),3,r);const bg=makeRecency(20,1)(nums);for(let i=0;i<37;i++)s[i]+=2*bg[i];return norm(s)}}
const BASE=[];const NAMES=[];
for(const hl of [8,16,32,64]){BASE.push(makeRecency(hl,1),makeRecency(hl,0));NAMES.push(`حرارة ${hl}R1`,`حرارة ${hl}R0`)}
for(const hl of [8,16,32,64])for(const r of [0,1,2]){BASE.push(makeDelta(hl,r));NAMES.push(`دلتا ${hl}R${r}`)}
for(const tol of [0,1,2,4])for(const hl of [16,32,64]){BASE.push(makeCondPocket(tol,hl,1));NAMES.push(`جيب مشروط ${tol}/${hl}`)}
for(const tol of [1,3,6])for(const hl of [16,32,64]){BASE.push(makeCondDelta(tol,hl,1));NAMES.push(`دلتا مشروط ${tol}/${hl}`)}
for(const tol of [2,5,8]){BASE.push(makeCondAccel(tol,32,1));NAMES.push(`تسارع ${tol}`)}
for(const w of [12,24,48,96]){BASE.push(makeSector(w,4));NAMES.push(`قطاع ${w}`)}
for(let lag=2;lag<=12;lag++){BASE.push(makeLag(lag,1));NAMES.push(`Lag ${lag}`)}
function antiScore(p){const mx=Math.max(...p),mn=Math.min(...p);return norm(p.map(v=>Math.max(1e-9,mx+mn+1e-9-v)))}
function regime(nums){if(nums.length<4)return[0,0,0];const d1=signedDelta(nums.at(-3),nums.at(-2)),d2=signedDelta(nums.at(-2),nums.at(-1));const sg=d2>2?1:d2<-2?-1:0,mg=Math.abs(d2)<=6?0:Math.abs(d2)<=12?1:2,ac=d2-d1,ag=ac>3?1:ac<-3?-1:0;return[sg,mg,ag]}
function expertPacks(nums){const p=BASE.map(fn=>fn(nums));return p.concat(p.map(antiScore))}
function hitOf(scores,n,count=18){return topFromScores(scores,count).includes(n)}
function regimeWeights(nums,count=18){
  const base=count/37,lookback=72,halfLife=48,eta=1,topK=8,shrink=8;
  const packs=expertPacks(nums),E=packs.length,weights=Array(E).fill(1);
  const start=Math.max(18,nums.length-lookback),cur=regime(nums);
  if(nums.length>18){
    const h=Array(E).fill(0),rwSum=Array(E).fill(0);
    for(let i=start;i<nums.length;i++){
      const pre=nums.slice(0,i),r=regime(pre);let sim=0;for(let k=0;k<3;k++)if(r[k]===cur[k])sim++;
      if(sim<3)continue;const w=ew(nums.length-1-i,halfLife)*(1+sim/3),pp=expertPacks(pre);
      for(let e=0;e<E;e++){rwSum[e]+=w;if(hitOf(pp[e],nums[i],count))h[e]+=w}
    }
    for(let e=0;e<E;e++){
      const rate=(h[e]+base*shrink)/(rwSum[e]+shrink),edge=rate-base,rel=Math.min(1,rwSum[e]/12);weights[e]=Math.exp(eta*edge*rel);
    }
  }
  const ids=[...Array(E).keys()].sort((a,b)=>weights[b]-weights[a]).slice(0,topK),keep=new Set(ids);let sw=0;
  for(let e=0;e<E;e++){if(!keep.has(e))weights[e]=0;sw+=weights[e]}
  for(let e=0;e<E;e++)weights[e]/=sw||1;
  return {weights,packs};
}
function rankedPrediction(nums,count=18){if(nums.length<24)return[];const {weights,packs}=regimeWeights(nums,count),out=Array(37).fill(0);for(let e=0;e<packs.length;e++)if(weights[e])for(let i=0;i<37;i++)out[i]+=packs[e][i]*weights[e];return topFromScores(out,count)}
function walkForward(nums,count=18){let k=0,n=0;const recent=[];for(let i=24;i<nums.length;i++){const p=rankedPrediction(nums.slice(0,i),count);if(!p.length)continue;const ok=p.includes(nums[i]);n++;if(ok)k++;recent.push(ok?1:0)}return{k,n,rate:n?k/n:0,baseline:count/37,recent:recent.slice(-10)}}
function modelAgreement(nums,count=18){if(nums.length<24)return 0;const {weights,packs}=regimeWeights(nums,count);const ids=weights.map((w,i)=>[w,i]).filter(x=>x[0]>0).map(x=>x[1]);const sets=ids.map(i=>new Set(topFromScores(packs[i],count)));let s=0,p=0;for(let i=0;i<sets.length;i++)for(let j=i+1;j<sets.length;j++){let inter=0;for(const x of sets[i])if(sets[j].has(x))inter++;const u=sets[i].size+sets[j].size-inter;s+=u?inter/u:0;p++}return p?s/p:0}
function topSectorCenter(picks){if(!picks.length)return null;let best={m:-1,c:null};for(let i=0;i<37;i++){let m=0;for(let k=-4;k<=4;k++)if(picks.includes(wheel[mod(i+k,37)]))m++;if(m>best.m)best={m,c:wheel[i]}}return best.c}
let spins=[],settings={tableId:0,coverage:18};
if(typeof localStorage!=='undefined')try{const a=JSON.parse(localStorage.getItem(STORAGE)||'null');if(Array.isArray(a))spins=a;else{for(const key of ['bonhayan_v15_spins','bonhayan_v14_spins']){const x=JSON.parse(localStorage.getItem(key)||'null');if(Array.isArray(x)){spins=x;break}}}const st=JSON.parse(localStorage.getItem(SETTINGS)||'null');if(st){if(Number.isInteger(st.tableId))settings.tableId=st.tableId;if([9,18,27,30,33].includes(st.coverage))settings.coverage=st.coverage}}catch(e){}
function save(){if(typeof localStorage!=='undefined'){localStorage.setItem(STORAGE,JSON.stringify(spins));localStorage.setItem(SETTINGS,JSON.stringify(settings))}}
function segment(){return spins.filter(x=>(x.tableId??x.dealerId??0)===settings.tableId).map(x=>x.n)}
function addSpin(n){spins.push({n,tableId:settings.tableId});save();render()}
function render(){if(typeof document==='undefined')return;const nums=segment(),c=settings.coverage,picks=rankedPrediction(nums,c),wf=walkForward(nums,c),base=c/37,agr=modelAgreement(nums,c),pack=nums.length>=24?regimeWeights(nums,c):null;
$('spinCount').textContent=spins.length;$('dealerSpinCount').textContent=nums.length;$('engineStage').textContent=nums.length<24?'تعلم':'Regime مباشر';$('trustProgress').textContent=nums.length<24?Math.round(nums.length/24*100)+'%':'100%';$('activeModels').textContent=String(BASE.length*2);$('modelAgreement').textContent=nums.length>=24?pct(agr):'—';
$('modelList').innerHTML=pack?pack.weights.map((w,i)=>[w,i]).filter(x=>x[0]>0).sort((a,b)=>b[0]-a[0]).map(([w,i])=>`${i<BASE.length?NAMES[i]:'عكس '+NAMES[i-BASE.length]}: ${(w*100).toFixed(0)}%`).join('<br>'):'المحرك ينتظر 24 فرة لبناء حالة الحركة.';
$('currentMass').textContent=picks.length?`${picks.length} رقم`:'—';$('modelStability').textContent=nums.length>=24?pct(agr):'—';$('shadowTests').textContent=wf.n?`${wf.k}/${wf.n}`:'0';$('shadowRate').textContent=wf.n?pct(wf.rate):'—';$('lowerBound').textContent=pct(base);const r10=wf.recent.length?wf.recent.reduce((a,b)=>a+b,0)/wf.recent.length:NaN;$('recent10').textContent=Number.isFinite(r10)?`${wf.recent.reduce((a,b)=>a+b,0)}/${wf.recent.length} = ${pct(r10)}`:'—';$('baselineLabel').textContent=`الخط الطبيعي لـ${c} رقم`;$('baselineValue').textContent=pct(base);$('betDecision').textContent=nums.length>=24?'توقع Regime جاهز':'نحتاج 24 فرة أول';$('betReason').textContent=nums.length>=24?`V16 يختار 8 خبراء فقط حسب حالة الحركة الحالية، ويستفيد حتى من النماذج التي تثبت أنها عكسية. Walk‑Forward الحالي ${wf.n?pct(wf.rate):'—'} مقابل ${pct(base)}.`:'نجمع 24 نتيجة حتى نحدد نظام الحركة الحالي.';$('predictionCenter').textContent=picks.length?(topSectorCenter(picks)??'—'):'—';const z=$('predictionZone');z.innerHTML='';if(picks.length)picks.forEach(n=>{const s=document.createElement('span');s.className='chip';s.textContent=n;z.appendChild(s)});else z.textContent='—';$('gateList').innerHTML=nums.length>=24?`✅ 118 خبير (59 نموذج + 59 عكسي)<br>✅ Regime من اتجاه/حجم الحركة/التسارع<br>✅ أفضل 8 خبراء فقط لكل حالة<br>✅ Walk‑Forward ما يشوف النتيجة القادمة<br>⚠️ خط الأساس ${pct(base)}`:`⏳ ${24-nums.length} فرات متبقية للإحماء`;const rr=$('recentResults');rr.innerHTML='';if(!spins.length)rr.innerHTML='<span class="small">ما سجلت شي للحين.</span>';else spins.slice(-20).reverse().forEach(s=>{const x=document.createElement('span');x.className='chip';x.textContent=s.n;rr.appendChild(x)});}
if(typeof document!=='undefined'){
 const grid=$('numberGrid');for(let n=0;n<=36;n++){const b=document.createElement('button');b.className='num '+(n===0?'green':red.has(n)?'red':'');b.textContent=n;b.onclick=()=>addSpin(n);grid.appendChild(b)}
 $('undoBtn').onclick=()=>{if(spins.length){spins.pop();save();render()}};$('newDealerBtn').textContent='طاولة أوتو جديدة';$('newDealerBtn').onclick=()=>{if(confirm('نبدأ طاولة Auto جديدة بتحليل مستقل؟')){settings.tableId++;save();render()}};$('resetBtn').onclick=()=>{if(confirm('متأكد تبا تمسح كل النتائج؟')){spins=[];settings.tableId=0;save();render()}};$('coverage').value=String(settings.coverage);$('coverage').onchange=e=>{settings.coverage=Number(e.target.value);save();render()};render();
}
const api={wheel,BASE,NAMES,regime,regimeWeights,rankedPrediction,walkForward};if(typeof window!=='undefined')window.BONHAYAN_V16=api;if(typeof module!=='undefined')module.exports=api;
})();
