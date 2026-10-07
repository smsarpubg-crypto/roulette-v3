(()=>{
'use strict';
const wheel=[0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
const red=new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const pos=new Map(wheel.map((n,i)=>[n,i]));
const BASELINE=9/37;
const STORAGE='bonhayan_v9_spins';
const SETTINGS='bonhayan_v9_settings';
const $=id=>document.getElementById(id);
const pct=x=>Number.isFinite(x)?(x*100).toFixed(1)+'%':'—';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const mod=(n,m)=>((n%m)+m)%m;
function zone(center,span=9){if(center==null||!pos.has(center))return[];const i=pos.get(center),half=Math.floor(span/2),out=[];for(let d=-half;d<=half;d++)out.push(wheel[mod(i+d,37)]);return out}
function signedWheelDelta(a,b){if(!pos.has(a)||!pos.has(b))return 0;let d=pos.get(b)-pos.get(a);if(d>18)d-=37;if(d<-18)d+=37;return d}
function median(a){if(!a.length)return 0;const s=[...a].sort((x,y)=>x-y),m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2}
function mean(a){return a.length?a.reduce((x,y)=>x+y,0)/a.length:0}
function sd(a){if(a.length<2)return 0;const m=mean(a);return Math.sqrt(a.reduce((s,x)=>s+(x-m)*(x-m),0)/(a.length-1))}
function wilson(k,n,z=1.96){if(!n)return[0,1];const p=k/n,zz=z*z,d=1+zz/n,c=(p+zz/(2*n))/d,h=z*Math.sqrt((p*(1-p)+zz/(4*n))/n)/d;return[Math.max(0,c-h),Math.min(1,c+h)]}
function quantile(a,q){if(!a.length)return 0;const s=[...a].sort((x,y)=>x-y),x=(s.length-1)*q,i=Math.floor(x),f=x-i;return s[i+1]!==undefined?s[i]*(1-f)+s[i+1]*f:s[i]}
function dealerSegment(spins,dealerId){return spins.filter(s=>s.dealerId===dealerId).map(s=>s.n)}
function features(nums){
  const deltas=[];for(let i=1;i<nums.length;i++)deltas.push(signedWheelDelta(nums[i-1],nums[i]));
  const abs=deltas.map(Math.abs),recent=abs.slice(-12),recentD=deltas.slice(-12);
  if(!recent.length)return{n:0,vol:0,longRate:0,stability:0,state:'تعلم',medianJump:0,mad:0,dirBalance:0,deltas};
  const med=median(recent),mad=median(recent.map(x=>Math.abs(x-med))),vol=clamp((sd(recent)/10),0,1.5);
  const longRate=recent.filter(x=>x>=10).length/recent.length;
  const prev=abs.slice(-24,-12);const prevMed=prev.length?median(prev):med;
  const drift=Math.abs(med-prevMed)/18;
  const stability=clamp(1-(mad/9)*0.65-drift*0.35,0,1);
  const dirBalance=recentD.length?Math.abs(recentD.reduce((s,x)=>s+Math.sign(x),0))/recentD.length:0;
  let state='هادئ';if(vol>.72||longRate>.42||mad>5.5)state='متقلب';else if(vol>.42||longRate>.24||mad>3.2)state='متوسط';
  return{n:recent.length,vol,longRate,stability,state,medianJump:med,mad,dirBalance,deltas};
}
function patternVector(deltas,endIdx,len=4){if(endIdx-len+1<0)return null;return deltas.slice(endIdx-len+1,endIdx+1)}
function vecDistance(a,b){if(!a||!b||a.length!==b.length)return Infinity;let s=0,w=0;for(let i=0;i<a.length;i++){const wt=i+1;s+=wt*Math.abs(a[i]-b[i]);w+=wt*18}return s/w}
function rawProposal(nums){
  if(nums.length<18)return{ok:false,reason:'أقل من 18 فرة',analogN:0};
  const deltas=[];for(let i=1;i<nums.length;i++)deltas.push(signedWheelDelta(nums[i-1],nums[i]));
  const cur=patternVector(deltas,deltas.length-1,4);if(!cur)return{ok:false,reason:'نمط غير مكتمل',analogN:0};
  const analogs=[];
  for(let j=3;j<deltas.length-1;j++){
    const v=patternVector(deltas,j,4),dist=vecDistance(cur,v);
    if(dist<=0.34){const next=deltas[j+1],wt=Math.exp(-5*dist);analogs.push({next,dist,wt});}
  }
  if(analogs.length<8)return{ok:false,reason:'الحالات المشابهة أقل من 8',analogN:analogs.length};
  const scores=Array(37).fill(0);
  for(const a of analogs){const idx=mod(pos.get(nums[nums.length-1])+a.next,37);scores[idx]+=a.wt}
  let bestIdx=0,bestMass=-1,total=analogs.reduce((s,a)=>s+a.wt,0)||1;
  for(let i=0;i<37;i++){let m=0;for(let d=-4;d<=4;d++)m+=scores[mod(i+d,37)];if(m>bestMass){bestMass=m;bestIdx=i}}
  const center=wheel[bestIdx],localMass=bestMass/total;
  const avgDist=mean(analogs.map(a=>a.dist));
  const bounce=features(nums);
  const volatilityPenalty=0.10*bounce.vol+0.08*bounce.longRate+0.08*(1-bounce.stability);
  const adjustedMass=localMass-volatilityPenalty;
  return{ok:true,center,zone:zone(center),analogN:analogs.length,localMass,adjustedMass,avgDist,bounce};
}
function walkForward(nums){
  let preds=0,hits=0,strongPreds=0,strongHits=0;
  for(let i=18;i<nums.length;i++){
    const p=rawProposal(nums.slice(0,i));if(!p.ok)continue;preds++;const hit=p.zone.includes(nums[i]);if(hit)hits++;
    if(p.analogN>=8&&p.adjustedMass>=0.36&&p.bounce.stability>=0.55){strongPreds++;if(hit)strongHits++}
  }
  const rate=strongPreds?strongHits/strongPreds:0,ci=wilson(strongHits,strongPreds);
  return{preds,hits,strongPreds,strongHits,rate,ci};
}
function decision(nums){
  const p=rawProposal(nums),wf=walkForward(nums),bounce=features(nums);
  const gates=[];
  gates.push({ok:nums.length>=24,text:'24 فرة على الأقل للديلر الحالي'});
  gates.push({ok:p.ok&&p.analogN>=8,text:'8 حالات تاريخية مشابهة على الأقل'});
  gates.push({ok:p.ok&&p.adjustedMass>=0.36,text:'تركيز القطاع بعد خصم تشتت القفز ≥ 36%'});
  gates.push({ok:bounce.stability>=0.55,text:'ثبات نمط القفز ≥ 55%'});
  gates.push({ok:wf.strongPreds>=15,text:'15 اختبار مستقبلي مؤهل على الأقل'});
  gates.push({ok:wf.strongPreds>=15&&wf.rate>=BASELINE+0.06,text:'نسبة الاختبار المستقبلي ≥ 30.3%'});
  gates.push({ok:wf.strongPreds>=20&&wf.ci[0]>BASELINE,text:'الحد الأدنى 95% أعلى من خط 9/37'});
  const all=gates.every(g=>g.ok);
  let reason='';
  if(all)reason='كل بوابات الثقة اجتازت. التوقع مبني على تشابه انتقالات الجيوب وثبات تشتت الديلر.';
  else{const first=gates.find(g=>!g.ok);reason='امتناع: '+(first?first.text:'الدليل غير كافي')+'.';}
  return{all,reason,p,wf,bounce,gates};
}
let spins=[],settings={dealerId:0};
try{
  const raw=JSON.parse(localStorage.getItem(STORAGE)||'null');
  if(Array.isArray(raw))spins=raw.filter(x=>x&&Number.isInteger(x.n)&&x.n>=0&&x.n<=36).map(x=>({n:x.n,dealerId:Number.isInteger(x.dealerId)?x.dealerId:0}));
  else{
    for(const key of ['bonhayan_v8_spins','bonhayan_v7_spins','bonhayan_v6_spins','bonhayan_v5_spins']){
      const x=JSON.parse(localStorage.getItem(key)||'null');if(Array.isArray(x)){spins=x.filter(y=>y&&Number.isInteger(y.n)&&y.n>=0&&y.n<=36).map(y=>({n:y.n,dealerId:Number.isInteger(y.dealerId)?y.dealerId:0}));break}
    }
  }
  const st=JSON.parse(localStorage.getItem(SETTINGS)||'null');if(st&&Number.isInteger(st.dealerId))settings.dealerId=st.dealerId;else if(spins.length)settings.dealerId=spins[spins.length-1].dealerId;
}catch(e){spins=[];settings={dealerId:0}}
function save(){try{localStorage.setItem(STORAGE,JSON.stringify(spins));localStorage.setItem(SETTINGS,JSON.stringify(settings))}catch(e){}}
function addSpin(n){spins.push({n,dealerId:settings.dealerId});save();render()}
const grid=$('numberGrid');for(let n=0;n<=36;n++){const b=document.createElement('button');b.className='num '+(n===0?'green':red.has(n)?'red':'');b.textContent=n;b.addEventListener('click',()=>addSpin(n));grid.appendChild(b)}
$('undoBtn').addEventListener('click',()=>{if(spins.length){spins.pop();save();render()}});
$('newDealerBtn').addEventListener('click',()=>{if(confirm('تغيّر الديلر؟ بنبدأ نموذج جديد للديلر اليديد بدون مسح القديم.')){settings.dealerId=(settings.dealerId||0)+1;save();render()}});
$('resetBtn').addEventListener('click',()=>{if(confirm('متأكد تبا تمسح كل النتائج؟')){spins=[];settings.dealerId=0;save();render()}});
function render(){
  const nums=dealerSegment(spins,settings.dealerId),d=decision(nums),b=d.bounce,p=d.p,w=d.wf;
  $('spinCount').textContent=spins.length;$('dealerSpinCount').textContent=nums.length;
  $('bounceState').textContent=nums.length<6?'تعلم':b.state;
  $('bounceVolatility').textContent=nums.length<6?'—':pct(clamp(b.vol,0,1));
  $('longJumpRate').textContent=nums.length<6?'—':pct(b.longRate);
  $('patternStability').textContent=nums.length<6?'—':pct(b.stability);
  if(nums.length<6)$('bounceExplain').textContent='نحتاج عدة نتائج عشان نكوّن خط أساس للديلر.';
  else $('bounceExplain').textContent='متوسط القفزة الوسيطة '+b.medianJump.toFixed(1)+' جيب، MAD '+b.mad.toFixed(1)+'، والحالة الحالية '+b.state+'. هذي قراءة مستنتجة من انتقالات الجيوب وليست مشاهدة مباشرة لمسار الكورة.';
  $('betDecision').textContent=d.all?'قطاع مرشح':'لا تلعب';
  $('betReason').textContent=d.reason;
  $('predictionCenter').textContent=d.all&&p.ok?p.center:'—';
  const z=$('predictionZone');z.innerHTML='';if(d.all&&p.ok)p.zone.forEach(n=>{const s=document.createElement('span');s.className='chip';s.textContent=n;z.appendChild(s)});else z.textContent='—';
  $('analogCount').textContent=p.analogN||0;$('localMass').textContent=p.ok?pct(p.adjustedMass):'—';
  $('wfScore').textContent=w.strongPreds?(w.strongHits+'/'+w.strongPreds+' = '+pct(w.rate)):'—';$('wfLow').textContent=w.strongPreds?pct(w.ci[0]):'—';
  $('gateList').innerHTML=d.gates.map(g=>(g.ok?'✅ ':'⛔ ')+g.text).join('<br>');
  const recent=$('recentResults');recent.innerHTML='';if(!spins.length)recent.innerHTML='<span class="small">ما سجلت شي للحين.</span>';else spins.slice(-20).reverse().forEach(s=>{const x=document.createElement('span');x.className='chip';x.textContent=s.n;recent.appendChild(x)});
}
render();
window.BONHAYAN_V9={wheel,zone,signedWheelDelta,features,rawProposal,walkForward,decision,wilson};
})();
