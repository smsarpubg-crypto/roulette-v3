(()=>{
'use strict';
const wheel=[0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
const red=new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const pos=new Map(wheel.map((n,i)=>[n,i]));
const BASELINE=9/37;
const STORAGE='bonhayan_v12_spins', SETTINGS='bonhayan_v12_settings';
const $=id=>document.getElementById(id);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const mod=(n,m)=>((n%m)+m)%m;
const pct=x=>Number.isFinite(x)?(x*100).toFixed(1)+'%':'—';
function mean(a){return a.length?a.reduce((s,x)=>s+x,0)/a.length:0}
function sd(a){if(a.length<2)return 0;const m=mean(a);return Math.sqrt(a.reduce((s,x)=>s+(x-m)*(x-m),0)/(a.length-1))}
function median(a){if(!a.length)return 0;const s=[...a].sort((a,b)=>a-b),m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2}
function signedDelta(a,b){let d=pos.get(b)-pos.get(a);if(d>18)d-=37;if(d<-18)d+=37;return d}
function zone(center){if(!pos.has(center))return[];const i=pos.get(center),out=[];for(let k=-4;k<=4;k++)out.push(wheel[mod(i+k,37)]);return out}
function sectorMass(scores,i){let s=0;for(let k=-4;k<=4;k++)s+=scores[mod(i+k,37)];return s}
function binomTail(k,n,p=BASELINE){if(!n)return 1;let sum=0;for(let i=k;i<=n;i++){let c=1;for(let j=1;j<=i;j++)c*=((n-j+1)/j);sum+=c*Math.pow(p,i)*Math.pow(1-p,n-i)}return clamp(sum,0,1)}
function dealerSegment(spins,dealerId){return spins.filter(x=>x.dealerId===dealerId).map(x=>x.n)}
function deltas(nums){const out=[];for(let i=1;i<nums.length;i++)out.push(signedDelta(nums[i-1],nums[i]));return out}
function bounceFeatures(nums){
  const ds=deltas(nums), recent=ds.slice(-10), abs=recent.map(Math.abs);
  if(!recent.length)return{vol:0,longRate:0,stability:0,state:'تعلم',mad:0,medianJump:0,drift:1,concentration:0};
  const medAbs=median(abs), mad=median(abs.map(x=>Math.abs(x-medAbs))), vol=clamp(sd(abs)/9,0,1), longRate=abs.filter(x=>x>=10).length/abs.length;
  const prev=ds.slice(-20,-10).map(Math.abs), prevMed=prev.length?median(prev):medAbs, drift=clamp(Math.abs(medAbs-prevMed)/10,0,1);
  const concentration=abs.filter(x=>Math.abs(x-medAbs)<=4).length/abs.length, consistency=1-clamp(mad/7,0,1);
  const stability=clamp(.45*consistency+.35*concentration+.20*(1-drift),0,1);
  let state='هادئ'; if(vol>.72||longRate>.45||stability<.35)state='متقلب'; else if(vol>.45||longRate>.25||stability<.55)state='متوسط';
  return{vol,longRate,stability,state,mad,medianJump:medAbs,drift,concentration};
}
function proposal(nums){
  if(nums.length<11)return null;
  const ds=deltas(nums).slice(-28), scores=Array(37).fill(0), decay=.90; let total=0;
  for(let j=0;j<ds.length;j++){
    const age=ds.length-1-j,w=Math.pow(decay,age),d=mod(ds[j],37);
    scores[d]+=w; scores[mod(d-1,37)]+=.35*w; scores[mod(d+1,37)]+=.35*w; total+=1.7*w;
  }
  let bestI=0,bestMass=-1;
  for(let i=0;i<37;i++){const m=sectorMass(scores,i)/total;if(m>bestMass){bestMass=m;bestI=i}}
  const centerDelta=bestI<=18?bestI:bestI-37;
  const center=wheel[mod(pos.get(nums[nums.length-1])+centerDelta,37)];
  const probs=scores.map(x=>x/total);let entropy=0;for(const p of probs)if(p>0)entropy-=p*Math.log(p);entropy/=Math.log(37);
  const recent=ds.slice(-10),med=median(recent),mad=median(recent.map(x=>Math.abs(x-med))),consistency=Math.max(0,1-mad/9);
  let driftScore=.5;
  if(ds.length>=14){
    const old=ds.slice(0,-7), sc=Array(37).fill(0);let tt=0;
    for(let j=0;j<old.length;j++){const age=old.length-1-j,w=Math.pow(decay,age),d=mod(old[j],37);sc[d]+=w;sc[mod(d-1,37)]+=.35*w;sc[mod(d+1,37)]+=.35*w;tt+=1.7*w}
    let bi=0,bm=-1;for(let i=0;i<37;i++){const m=sectorMass(sc,i)/tt;if(m>bm){bm=m;bi=i}}
    const diff=Math.min(mod(bestI-bi,37),mod(bi-bestI,37));driftScore=Math.max(0,1-diff/9);
  }
  const stability=clamp(.45*Math.min(1,bestMass/.65)+.30*consistency+.25*driftScore,0,1);
  return{center,zone:zone(center),mass:bestMass,stability,entropy,centerDelta};
}
function shadowWalkForward(nums){
  const outs=[];
  for(let i=11;i<nums.length;i++){
    const p=proposal(nums.slice(0,i));
    if(!p)continue;
    outs.push(p.zone.includes(nums[i])?1:0);
  }
  const recent=outs.slice(-18), n=recent.length, k=recent.reduce((a,b)=>a+b,0), rate=n?k/n:0, pValue=n?binomTail(k,n):1;
  const r6=recent.slice(-6), recent6Rate=r6.length?r6.reduce((a,b)=>a+b,0)/r6.length:0;
  return{all:outs,recent,n,k,rate,pValue,recent6Rate,recent6N:r6.length};
}
function decision(nums){
  const p=proposal(nums), wf=shadowWalkForward(nums), bounce=bounceFeatures(nums);
  const readyCurrent=!!(p&&nums.length>=14&&p.mass>=.36&&p.stability>=.48);
  const strong=!!(readyCurrent&&wf.n>=12&&wf.rate>=.45&&wf.pValue<=.0005&&p.mass>=.39&&p.stability>=.56&&wf.recent6N>=6&&wf.recent6Rate>=.50);
  let stage='تعلم',reason='نجمع بيانات الديلر الحالي ونشغّل الاختبار الظلي تلقائياً.';
  if(nums.length>=11)stage='اختبار ظلي';
  if(nums.length>=14)stage='تحقق';
  if(readyCurrent)reason='في إشارة حالية، لكن الأرقام تظل مخفية لين يثبتها الأداء المستقبلي.';
  if(strong){stage='توقع مؤكد بالنموذج';reason='الإشارة الحالية اجتازت التركيز والثبات والاختبار المستقبلي المستقل.'}
  const gates=[
    {ok:nums.length>=14,text:'14 فرة على الأقل قبل التحقق النهائي'},
    {ok:!!p&&p.mass>=.39,text:'تركيز القطاع الحالي ≥ 39%'},
    {ok:!!p&&p.stability>=.56,text:'ثبات النموذج الحالي ≥ 56%'},
    {ok:wf.n>=12,text:'12 اختبار ظل مستقبلي على الأقل'},
    {ok:wf.n>=12&&wf.rate>=.45,text:'إصابة اختبار الظل ≥ 45%'},
    {ok:wf.n>=12&&wf.pValue<=.0005,text:'احتمال الصدفة ≤ 0.05%'},
    {ok:wf.recent6N>=6&&wf.recent6Rate>=.50,text:'آخر 6 اختبارات: ≥ 50% حتى لا نعتمد على نمط قديم'}
  ];
  const progress=gates.filter(g=>g.ok).length/gates.length;
  return{p,wf,bounce,strong,readyCurrent,stage,reason,gates,progress};
}
let spins=[],settings={dealerId:0};
try{
  const raw=JSON.parse(localStorage.getItem(STORAGE)||'null');
  if(Array.isArray(raw))spins=raw.filter(x=>x&&Number.isInteger(x.n)&&x.n>=0&&x.n<=36).map(x=>({n:x.n,dealerId:Number.isInteger(x.dealerId)?x.dealerId:0}));
  else{
    for(const key of ['bonhayan_v11_spins','bonhayan_v10_spins','bonhayan_v9_spins']){
      const x=JSON.parse(localStorage.getItem(key)||'null');if(Array.isArray(x)){spins=x.filter(y=>y&&Number.isInteger(y.n)&&y.n>=0&&y.n<=36).map(y=>({n:y.n,dealerId:Number.isInteger(y.dealerId)?y.dealerId:0}));break}
    }
  }
  const st=JSON.parse(localStorage.getItem(SETTINGS)||'null');if(st&&Number.isInteger(st.dealerId))settings.dealerId=st.dealerId;else if(spins.length)settings.dealerId=spins[spins.length-1].dealerId;
}catch(e){spins=[];settings={dealerId:0}}
function save(){try{localStorage.setItem(STORAGE,JSON.stringify(spins));localStorage.setItem(SETTINGS,JSON.stringify(settings))}catch(e){}}
function addSpin(n){spins.push({n,dealerId:settings.dealerId});save();render()}
const grid=$('numberGrid');for(let n=0;n<=36;n++){const b=document.createElement('button');b.className='num '+(n===0?'green':red.has(n)?'red':'');b.textContent=n;b.addEventListener('click',()=>addSpin(n));grid.appendChild(b)}
$('undoBtn').addEventListener('click',()=>{if(spins.length){spins.pop();save();render()}});
$('newDealerBtn').addEventListener('click',()=>{if(confirm('تغيّر الديلر؟ بنبدأ تحليل مستقل للديلر اليديد بدون مسح القديم.')){settings.dealerId=(settings.dealerId||0)+1;save();render()}});
$('resetBtn').addEventListener('click',()=>{if(confirm('متأكد تبا تمسح كل النتائج؟')){spins=[];settings.dealerId=0;save();render()}});
function render(){
  const nums=dealerSegment(spins,settings.dealerId), d=decision(nums), p=d.p,w=d.wf,b=d.bounce;
  $('spinCount').textContent=spins.length;$('dealerSpinCount').textContent=nums.length;
  $('bounceState').textContent=nums.length<6?'تعلم':b.state;$('bounceVolatility').textContent=nums.length<6?'—':pct(b.vol);$('longJumpRate').textContent=nums.length<6?'—':pct(b.longRate);$('patternStability').textContent=nums.length<6?'—':pct(b.stability);
  $('bounceExplain').textContent=nums.length<6?'نحتاج عدة نتائج لبناء خط أساس.':'الوسيط '+b.medianJump.toFixed(1)+' جيب • MAD '+b.mad.toFixed(1)+' • تركّز الانتقالات '+pct(b.concentration)+' • تغيّر النمط '+pct(b.drift)+'.';
  $('engineStage').textContent=d.stage;$('trustProgress').textContent=Math.round(d.progress*100)+'%';
  $('currentMass').textContent=p?pct(p.mass):'—';$('modelStability').textContent=p?pct(p.stability):'—';
  $('shadowTests').textContent=w.n?(w.k+'/'+w.n):'0';$('shadowRate').textContent=w.n?pct(w.rate):'—';$('chanceP').textContent=w.n?(w.pValue<0.0001?'<0.01%':pct(w.pValue)):'—';$('recent6').textContent=w.recent6N?(Math.round(w.recent6Rate*6)+'/6 = '+pct(w.recent6Rate)):'—';
  $('betDecision').textContent=d.strong?'توقع جاهز':'لا توقع للحين';$('betReason').textContent=d.reason;
  $('predictionCenter').textContent=d.strong&&p?p.center:'—';const z=$('predictionZone');z.innerHTML='';if(d.strong&&p)p.zone.forEach(n=>{const s=document.createElement('span');s.className='chip';s.textContent=n;z.appendChild(s)});else z.textContent='—';
  $('gateList').innerHTML=d.gates.map(g=>(g.ok?'✅ ':'⏳ ')+g.text).join('<br>');
  const recent=$('recentResults');recent.innerHTML='';if(!spins.length)recent.innerHTML='<span class="small">ما سجلت شي للحين.</span>';else spins.slice(-20).reverse().forEach(s=>{const x=document.createElement('span');x.className='chip';x.textContent=s.n;recent.appendChild(x)});
}
render();
window.BONHAYAN_V12={wheel,zone,signedDelta,bounceFeatures,proposal,shadowWalkForward,decision,binomTail};
})();
