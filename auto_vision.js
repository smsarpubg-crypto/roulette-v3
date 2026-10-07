(()=>{
'use strict';
const $=id=>document.getElementById(id);
const N=360,W=360,H=270,TAU=Math.PI*2;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const normAng=a=>{while(a<=-Math.PI)a+=TAU;while(a>Math.PI)a-=TAU;return a};
const roulette=[0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
const LOCK_FRAMES=18, UNLOCK_FRAMES=10, MIN_LOCK_SCORE=.72;
let stream=null,running=false,raf=0,prevGray=null,prevInner=null,lastT=0;
let cx=W/2,cy=H/2,R=104,ballAngle=null,ballEMA=null,wheelEMA=null;
let sampleStart=null,lastBallSamples=[];
let lockFrames=0,badFrames=0,locked=false,lastGoodMetrics=null;
const wheelMotionHist=[],ballMotionHist=[],zeroHist=[],structureHist=[];
const video=$('visionVideo'),canvas=$('visionCanvas'),ctx=canvas?.getContext('2d',{willReadFrequently:true});
if(!video||!canvas||!ctx)return;
canvas.width=W;canvas.height=H;

function status(msg,kind='neutral',badgeText=null){
  $('visionStatus').textContent=msg;
  $('visionBadge').textContent=badgeText||(kind==='good'?'عجلة مؤكدة':kind==='warn'?'تحقق جاري':kind==='bad'?'لا توجد عجلة':'جاهز');
  $('visionBadge').className='badge '+kind;
}
function dispatch(id,type='input'){const el=$(id);if(el)el.dispatchEvent(new Event(type,{bubbles:true}));}
function setField(id,val,digits=2){const el=$(id);if(!el||val==null||!Number.isFinite(Number(val)))return;el.value=Number(val).toFixed(digits);dispatch(id);}
function clearAutoFields(){for(const id of ['wheelRpm1','ballRpm1','wheelRpm2','ballRpm2','sampleGap','refPocket']){const el=$(id);if(el&&el.dataset.auto==='1'){el.value='';delete el.dataset.auto;dispatch(id);}}}
function setAutoField(id,val,digits=2){const el=$(id);if(!el||val==null||!Number.isFinite(Number(val)))return;el.dataset.auto='1';el.value=Number(val).toFixed(digits);dispatch(id);}
function clickDir(group,val){const b=document.querySelector(`[data-${group}="${val}"]`);if(b&&!b.classList.contains('active'))b.click();}
function grayFrom(img){const d=img.data,g=new Uint8Array(W*H);for(let i=0,j=0;i<d.length;i+=4,j++)g[j]=(d[i]*3+d[i+1]*6+d[i+2])>>3;return g;}
function ring(gray,rad,band=2){const out=new Float32Array(N);for(let k=0;k<N;k++){const a=TAU*k/N;let s=0,c=0;for(let dr=-band;dr<=band;dr+=2){const x=Math.round(cx+(rad+dr)*Math.cos(a)),y=Math.round(cy+(rad+dr)*Math.sin(a));if(x>0&&x<W-1&&y>0&&y<H-1){s+=gray[y*W+x];c++;}}out[k]=c?s/c:0;}let m=0;for(const v of out)m+=v;m/=N;for(let i=0;i<N;i++)out[i]-=m;return out;}
function corrShift(a,b,maxShift=24){if(!a||!b)return null;let best=-2,second=-2,shift=0;for(let sh=-maxShift;sh<=maxShift;sh++){let s=0,aa=0,bb=0;for(let i=0;i<N;i++){const j=(i+sh+N)%N;s+=a[i]*b[j];aa+=a[i]*a[i];bb+=b[j]*b[j];}const q=s/Math.sqrt(aa*bb+1e-9);if(q>best){second=best;best=q;shift=sh}else if(q>second)second=q;}return{shift,quality:best,margin:best-second};}
function estimateCenter(gray){if(!prevGray)return null;let sw=0,sx=0,sy=0;for(let y=18;y<H-18;y+=3)for(let x=18;x<W-18;x+=3){const i=y*W+x,df=Math.abs(gray[i]-prevGray[i]);if(df<18)continue;const ed=Math.abs(gray[i]-gray[i-1])+Math.abs(gray[i]-gray[i-W]);const w=df+.25*ed;sw+=w;sx+=x*w;sy+=y*w;}if(sw<9000)return null;const x=sx/sw,y=sy/sw;if(x<55||x>W-55||y<45||y>H-45)return null;return{x,y,energy:sw};}
function radialRingScore(gray,tcx,tcy){let best={r:0,score:0};for(let r=62;r<Math.min(128,Math.min(W,H)/2-8);r+=2){let e=0,c=0;for(let k=0;k<N;k+=4){const a=TAU*k/N,x=Math.round(tcx+r*Math.cos(a)),y=Math.round(tcy+r*Math.sin(a));if(x<2||x>=W-2||y<2||y>=H-2)continue;const i=y*W+x;const gx=Math.abs(gray[i+1]-gray[i-1]),gy=Math.abs(gray[i+W]-gray[i-W]);e+=gx+gy;c++;}const sc=c?e/c:0;if(sc>best.score)best={r,score:sc};}return best;}
function pocketSignature(gray){
  // Radial separators create a ~37-fold cadence. We measure angular gradient energy
  // on the pocket annulus, then test autocorrelation at one-pocket spacing.
  const a=new Float32Array(N);for(let k=0;k<N;k++){const ang=TAU*k/N;let s=0,c=0;for(const rr of [.56,.62,.68,.74]){const r=R*rr,x=Math.round(cx+r*Math.cos(ang)),y=Math.round(cy+r*Math.sin(ang));if(x<2||x>=W-2||y<2||y>=H-2)continue;const i=y*W+x;const tang=Math.abs(gray[y*W+Math.min(W-1,x+1)]-gray[y*W+Math.max(0,x-1)])+Math.abs(gray[Math.min(H-1,y+1)*W+x]-gray[Math.max(0,y-1)*W+x]);s+=tang;c++;}a[k]=c?s/c:0;}
  let mean=0;for(const v of a)mean+=v;mean/=N;for(let i=0;i<N;i++)a[i]-=mean;
  const lag=N/37;let best=-1;for(const L of [Math.floor(lag),Math.ceil(lag)]){let s=0,aa=0,bb=0;for(let i=0;i<N;i++){const j=(i+L)%N;s+=a[i]*a[j];aa+=a[i]*a[i];bb+=a[j]*a[j];}best=Math.max(best,s/Math.sqrt(aa*bb+1e-9));}
  // Separator count: peaks in smoothed angular edge energy. True wheel should have many.
  const sm=new Float32Array(N);for(let i=0;i<N;i++)sm[i]=(a[(i+N-2)%N]+a[(i+N-1)%N]+a[i]+a[(i+1)%N]+a[(i+2)%N])/5;
  let sd=0;for(const v of sm)sd+=v*v;sd=Math.sqrt(sd/N)+1e-6;let peaks=0;for(let i=2;i<N-2;i++)if(sm[i]>sm[i-1]&&sm[i]>=sm[i+1]&&sm[i]>.45*sd)peaks++;
  const countScore=clamp(1-Math.abs(peaks-37)/24,0,1),cadenceScore=clamp((best-.02)/.28,0,1);
  return{score:.58*countScore+.42*cadenceScore,peaks,cadence:best};
}
function detectGreenZero(img){const d=img.data;let best=-999,bang=null;for(let k=0;k<N;k++){const ang=TAU*k/N;let s=0,c=0;for(let rr=.50;rr<=.78;rr+=.045){const x=Math.round(cx+R*rr*Math.cos(ang)),y=Math.round(cy+R*rr*Math.sin(ang));if(x<0||x>=W||y<0||y>=H)continue;const p=(y*W+x)*4,r=d[p],g=d[p+1],b=d[p+2],mx=Math.max(r,b);const sat=g-mx;s+=sat-.12*Math.abs(r-b);c++;}const q=c?s/c:-999;if(q>best){best=q;bang=ang;}}return best>34?{angle:bang,quality:clamp((best-34)/80,0,1),raw:best}:null;}
function detectBall(img,gray){if(!prevGray)return null;const d=img.data,bins=new Float32Array(N);let best=-1,bang=0,second=-1;for(let k=0;k<N;k++){const ang=TAU*k/N;let score=0;for(let rr=.82;rr<=1.08;rr+=.04){const x=Math.round(cx+R*rr*Math.cos(ang)),y=Math.round(cy+R*rr*Math.sin(ang));if(x<2||x>=W-2||y<2||y>=H-2)continue;const i=y*W+x,p=i*4,motion=Math.abs(gray[i]-prevGray[i]);const mx=Math.max(d[p],d[p+1],d[p+2]),mn=Math.min(d[p],d[p+1],d[p+2]);const neutral=mx-mn<45?1:0;const bright=(d[p]+d[p+1]+d[p+2])/3;score+=motion*1.35+neutral*Math.max(0,bright-125)*.33;}bins[k]=score;}
  let bestK=0;for(let k=0;k<N;k++){const v=(bins[(k+N-2)%N]+bins[(k+N-1)%N]+2*bins[k]+bins[(k+1)%N]+bins[(k+2)%N])/6;if(v>best){best=v;bestK=k;bang=TAU*k/N;}}
  second=-1;for(let k=0;k<N;k++){let d=Math.abs(k-bestK);d=Math.min(d,N-d);if(d<=10)continue;const v=(bins[(k+N-2)%N]+bins[(k+N-1)%N]+2*bins[k]+bins[(k+1)%N]+bins[(k+2)%N])/6;if(v>second)second=v;}
  const uniqueness=(best-second)/(Math.abs(best)+1e-6);return best>70&&uniqueness>.025?{angle:bang,quality:clamp((best-70)/140,0,1)*clamp(uniqueness/.22,0,1),raw:best}:null;
}
function markerPocket(zeroAngle){const marker=-Math.PI/2;let cw=(marker-zeroAngle)%TAU;if(cw<0)cw+=TAU;return roulette[Math.round(cw/TAU*37)%37];}
function ema(o,v,a=.28){return o==null?v:o*(1-a)+v*a;}
function pushHist(arr,v,max=14){arr.push(v);if(arr.length>max)arr.shift();}
function motionConsistency(arr){if(arr.length<8)return{score:0,dir:null,cv:9};const vals=arr.map(x=>Math.abs(x)).filter(x=>x>.01);if(vals.length<6)return{score:0,dir:null,cv:9};const m=vals.reduce((a,b)=>a+b,0)/vals.length,sd=Math.sqrt(vals.reduce((a,b)=>a+(b-m)**2,0)/vals.length);const signs=arr.map(Math.sign).filter(Boolean),pos=signs.filter(x=>x>0).length,neg=signs.length-pos,dom=Math.max(pos,neg)/Math.max(1,signs.length);const cv=sd/(m+1e-6);return{score:clamp((dom-.62)/.33,0,1)*clamp((.65-cv)/.5,0,1),dir:pos>=neg?1:-1,cv};}
function authDecision(m){
  const hard=m.ringScore>=12&&m.structure>=.50&&m.wheelMotion>=.42&&m.ballMotion>=.32&&m.zero>=.16&&m.ballDistinct>=.18;
  const score=.18*clamp((m.ringScore-8)/18,0,1)+.24*m.structure+.20*m.wheelMotion+.18*m.ballMotion+.12*m.zero+.08*m.ballDistinct;
  return{score,pass:hard&&score>=MIN_LOCK_SCORE};
}
function updateLock(m){const a=authDecision(m);lastGoodMetrics={...m,auth:a};if(a.pass){lockFrames++;badFrames=0}else{badFrames++;lockFrames=Math.max(0,lockFrames-2)}if(!locked&&lockFrames>=LOCK_FRAMES){locked=true;sampleStart=null;status('تم تأكيد عجلة روليت متحركة + كورة + مرجع 0. بدأت القياسات.','good');}if(locked&&badFrames>=UNLOCK_FRAMES){locked=false;lockFrames=0;clearAutoFields();sampleStart=null;wheelEMA=null;ballEMA=null;status('فقدت القفل — أوقفت القياسات ومسحت القراءات التلقائية.','bad');}return a;}
function anomaly(ballRpm,q){if(ballRpm==null)return;lastBallSamples.push(ballRpm);if(lastBallSamples.length>14)lastBallSamples.shift();if(lastBallSamples.length<6)return;const m=lastBallSamples.reduce((a,b)=>a+b,0)/lastBallSamples.length,dev=Math.sqrt(lastBallSamples.reduce((a,b)=>a+(b-m)**2,0)/lastBallSamples.length)/(m+1e-6);let sev=0,kind='normal';if(q<.15||dev>.30){sev=3;kind='erratic'}else if(dev>.21){sev=2;kind='erratic'}else if(dev>.13){sev=1;kind='long_bounce'}$('anomaly').value=kind;dispatch('anomaly','change');setAutoField('bounceSeverity',sev,0);}
function overlay(ball,zero,a,m){ctx.save();ctx.lineWidth=locked?3:2;ctx.strokeStyle=locked?'rgba(34,197,94,.95)':'rgba(239,68,68,.9)';ctx.beginPath();ctx.arc(cx,cy,R,0,TAU);ctx.stroke();ctx.strokeStyle='rgba(37,99,235,.8)';ctx.beginPath();ctx.arc(cx,cy,R*.65,0,TAU);ctx.stroke();if(ball){ctx.fillStyle='rgba(245,158,11,.95)';ctx.beginPath();ctx.arc(cx+R*.95*Math.cos(ball.angle),cy+R*.95*Math.sin(ball.angle),5,0,TAU);ctx.fill();}if(zero){ctx.strokeStyle='rgba(16,185,129,.95)';ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+R*.72*Math.cos(zero.angle),cy+R*.72*Math.sin(zero.angle));ctx.stroke();}ctx.fillStyle='rgba(0,0,0,.78)';ctx.fillRect(4,4,245,58);ctx.fillStyle='#fff';ctx.font='12px -apple-system,Arial';ctx.fillText(`AUTH ${Math.round(a.score*100)}%  ${locked?'LOCKED':'VERIFYING'}  pockets ${m.peaks||0}`,10,20);ctx.fillText(`wheel-motion ${Math.round(m.wheelMotion*100)}%  ball ${Math.round(m.ballMotion*100)}%`,10,38);ctx.fillText(locked?`RPM W:${wheelEMA?.toFixed(1)??'—'} B:${ballEMA?.toFixed(1)??'—'}`:'RPM blocked until lock',10,55);ctx.restore();}
function frame(t){
 if(!running||video.readyState<2){raf=requestAnimationFrame(frame);return;}
 ctx.drawImage(video,0,0,W,H);const img=ctx.getImageData(0,0,W,H),gray=grayFrom(img),dt=lastT?(t-lastT)/1000:0;
 const c=estimateCenter(gray);if(c){const rs=radialRingScore(gray,c.x,c.y);if(rs.score>10){cx=.90*cx+.10*c.x;cy=.90*cy+.10*c.y;R=.90*R+.10*rs.r;}}
 const rs=radialRingScore(gray,cx,cy),sig=pocketSignature(gray),inner=ring(gray,R*.65,2),sh=corrShift(prevInner,inner,20);
 let wSigned=null,wq=0;if(sh&&dt>.025&&dt<.45&&sh.quality>.30&&Math.abs(sh.shift)>=1){const deg=sh.shift*(360/N),rpm=deg/dt/360*60;if(Math.abs(rpm)>.4&&Math.abs(rpm)<35){wSigned=rpm;pushHist(wheelMotionHist,rpm);wq=clamp((sh.quality-.28)/.50,0,1)*clamp((sh.margin-.001)/.025,0,1);}}
 const ball=detectBall(img,gray);let bSigned=null,bq=0;if(ball&&ballAngle!=null&&dt>.025&&dt<.45){const da=normAng(ball.angle-ballAngle),rpm=da/dt/TAU*60;if(Math.abs(rpm)>2&&Math.abs(rpm)<180){bSigned=rpm;pushHist(ballMotionHist,rpm);bq=ball.quality;}}if(ball)ballAngle=ball.angle;
 const wc=motionConsistency(wheelMotionHist),bc=motionConsistency(ballMotionHist),zero=detectGreenZero(img);
 pushHist(structureHist,sig.score,16);pushHist(zeroHist,zero?zero.quality:0,16);
 const recentAvg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;
 const recentTopAvg=a=>{if(!a.length)return 0;const z=[...a].sort((x,y)=>y-x).slice(0,Math.max(3,Math.ceil(a.length/3)));return z.reduce((x,y)=>x+y,0)/z.length};
 const distinct=(wSigned!=null&&bSigned!=null)?clamp((Math.abs(bSigned)-Math.abs(wSigned)*1.2)/25,0,1):0;
 const metrics={ringScore:rs.score,structure:.55*sig.score+.45*recentAvg(structureHist),wheelMotion:wc.score*wq,ballMotion:bc.score*bq,zero:recentTopAvg(zeroHist),ballDistinct:distinct,peaks:sig.peaks,cadence:sig.cadence};
 const auth=updateLock(metrics);$('visionQuality').textContent=Math.round(auth.score*100)+'%';
 if(!locked){if(auth.score>.58)status(`أتحقق من بصمة الروليت… ${lockFrames}/${LOCK_FRAMES} فريم ثابت. لن أطلع RPM قبل القفل.`,'warn');else status('لا توجد عجلة روليت مؤكدة — القياسات مقفلة. وجّه الكاميرا للعجلة كاملة وهي تتحرك.','bad');}
 if(locked){
   if(wSigned!=null){wheelEMA=ema(wheelEMA,Math.abs(wSigned),.24);clickDir('wheel-dir',wSigned>0?'ccw':'cw');}
   if(bSigned!=null){ballEMA=ema(ballEMA,Math.abs(bSigned),.30);clickDir('ball-dir',bSigned>0?'cw':'ccw');anomaly(ballEMA,ball?.quality||0);}
   if(zero)setAutoField('refPocket',markerPocket(zero.angle),0);
   const now=performance.now()/1000;if(wheelEMA!=null&&ballEMA!=null){if(sampleStart==null){sampleStart=now;setAutoField('wheelRpm1',wheelEMA);setAutoField('ballRpm1',ballEMA);}setAutoField('wheelRpm2',wheelEMA);setAutoField('ballRpm2',ballEMA);setAutoField('sampleGap',Math.max(.1,now-sampleStart));}
 }
 overlay(ball,zero,auth,metrics);prevGray=gray;prevInner=inner;lastT=t;raf=requestAnimationFrame(frame);
}
async function startCamera(){stopSource();try{stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720},frameRate:{ideal:60,max:60}},audio:false});video.srcObject=stream;video.removeAttribute('src');await video.play();resetTracker(true);running=true;$('visionStartBtn').textContent='إيقاف التحليل';raf=requestAnimationFrame(frame);status('الكاميرا شغالة. لن تبدأ أي قراءة قبل تأكيد بصمة عجلة الروليت.','neutral');}catch(e){status('ما قدرت أفتح الكاميرا. اسمح للكاميرا من إعدادات Safari أو استخدم فيديو محفوظ.','bad');}}
function stopSource(){running=false;if(raf)cancelAnimationFrame(raf);raf=0;if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}video.pause();}
function resetTracker(clear=true){prevGray=null;prevInner=null;lastT=0;ballAngle=null;ballEMA=null;wheelEMA=null;sampleStart=null;lastBallSamples=[];wheelMotionHist.length=0;ballMotionHist.length=0;zeroHist.length=0;structureHist.length=0;lockFrames=0;badFrames=0;locked=false;lastGoodMetrics=null;cx=W/2;cy=H/2;R=104;if(clear)clearAutoFields();$('visionQuality').textContent='0%';}
$('visionCameraBtn').addEventListener('click',startCamera);
$('visionStartBtn').addEventListener('click',()=>{if(running){running=false;$('visionStartBtn').textContent='بدء التحليل';status('التحليل متوقف والقيم مجمّدة.','neutral');}else if(video.readyState>=2){resetTracker(true);running=true;$('visionStartBtn').textContent='إيقاف التحليل';raf=requestAnimationFrame(frame);}else startCamera();});
$('visionResetBtn').addEventListener('click',()=>{resetTracker(true);status('تم مسح القفل والقياسات التلقائية. يبدأ التحقق من الصفر.','neutral');});
$('visionFile').addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;stopSource();video.srcObject=null;video.src=URL.createObjectURL(f);video.loop=false;video.muted=true;await video.play();resetTracker(true);running=true;$('visionStartBtn').textContent='إيقاف التحليل';raf=requestAnimationFrame(frame);status('أتحقق من الفيديو. لن تظهر RPM إلا بعد تأكيد عجلة حقيقية متحركة.','neutral');});
window.addEventListener('beforeunload',stopSource);
// Expose only the pure gate for deterministic regression tests.
window.__BONHAYAN_VISION_GATE__={authDecision};
status('جاهز — افتح الكاميرا أو اختر فيديو. القياسات مقفلة إلى أن تتأكد العجلة.','neutral');
})();
