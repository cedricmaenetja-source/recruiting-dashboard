import { initAuth, getCurrentUser, logout } from './auth.js';

/* silence noisy (harmless) SheetJS zip-size warnings from some SmartRecruiters exports */
(async function(){
    var loader = document.getElementById('pageLoader');
    if (!loader) return;

    const token = await initAuth();
    if (!token) {
        window.location.href = `./login.html`;
        return;
    }

    const user = await getCurrentUser();
    if (user.data.role == 'admin'){
        logout();
        window.location.href = `./login.html`;
        return;
    }
    
    await loadAllData(token);

    loader.classList.add('hide');
    const w=console.warn.bind(console),e=console.error.bind(console),l=console.log.bind(console);
  const skip=a=>typeof a==='string'&&/bad uncompressed size/i.test(a);
  console.warn=(...a)=>{if(!skip(a[0]))w(...a);};
  console.error=(...a)=>{if(!skip(a[0]))e(...a);};
  console.log=(...a)=>{if(!skip(a[0]))l(...a);};})();
Chart.register(ChartDataLabels);
Chart.defaults.plugins.datalabels.display=false; // opt-in per chart

/* ---------- column maps ---------- */
const APPMAP={'job id':'jobId','job ref id':'ref','job title':'title','job country/region':'country',
 'recruiters':'recruiter','job status':'jobStatus','staubli unit':'unit','stäubli unit':'unit',
 'default job ad creation date':'created','application state: new date':'applied',
 'candidate source':'source','candidate source type':'sourceType','candidate source subtype':'sourceSub',
 'application status before rejection':'preReject','latest offer extended date':'offer',
 'application status: in-review/submitted to manager date':'dSubmit',
 'application state: interview date':'dInterview','application state: offer date':'dOffer',
 'application state: hired date':'hired','division':'division','job family':'family',
 'confidential':'confidential','contract type':'contract','origin':'origin',
 'application reason for rejection':'rejectReason','application reason for withdrawal':'withdrawReason',
 'time in application state: lead':'tLead','time in application state: new':'tNew',
 'time in application state: in-review':'tReview','time in application state: offered':'tOffered',
 'time in application state: interview':'tInterview',
 'time in application status: interview/video interview':'tVideo',
 'time in application status: interview/on-site interview':'tOnsite',
 'time in application status: interview/on-site interview 2':'tOnsite2',
 'time in application status: interview/final interview':'tFinal',
 /* second heat map — time in JOB STATUS (add these columns to the export; variants accepted) */
 'time in job status: created':'tjsCreated',
 'time in job status: sourcing':'tjsSourcing',
 'time in job status: interview':'tjsInterview',
 'time in job status: offer':'tjsOffer','time in job status: offered':'tjsOffer',
 'time in job status: on hold':'tjsOnHold','time in job status: on-hold':'tjsOnHold','time in job status: on_hold':'tjsOnHold'};
const POSMAP={'job id':'jobId','position id':'positionId','position status':'posStatus'};
const JOBMAP={'job id':'jobId','job status':'jobStatus','job ref id':'ref','job title':'title',
 'job country/region':'country','staubli unit':'unit','stäubli unit':'unit','division':'division',
 'job family':'family','contract type':'contract','recruiters':'recruiter',
 'default job ad creation date':'created'};
const norm=s=>String(s||'').trim().toLowerCase();
function mapHeaders(hdr,MAP){const m={};hdr.forEach((h,i)=>{const n=norm(h);
  if(MAP[n])m[i]=MAP[n]; else for(const k in MAP){if(n===k){m[i]=MAP[k];break;}}});return m;}
function toDate(v){if(v==null||v==='')return null;if(v instanceof Date)return isNaN(v)?null:v;
  const s=String(v).trim();if(!s||s==='NaT')return null;const d=new Date(s);return isNaN(d)?null:d;}
const numOrNull=v=>{if(v==null||v===''||v==='NaT')return null;const n=Number(v);return isNaN(n)?null:n;};

/* ---------- state ---------- */
let APP=[], POS=[], JOBS=[], JOBATTR={}, LASTROWS=[], DRILL=null, TABLE_EXPORT=[], HEATDATA={}, modalKind='chart', CONV_EXPORT=[];
const charts={};
const STATES=[['tLead','Lead'],['tNew','New'],['tReview','In-Review'],['tInterview','Interview'],['tOffered','Offered']];
const STATES2=[['tjsCreated','Created'],['tjsSourcing','Sourcing'],['tjsInterview','Interview'],['tjsOffer','Offer'],['tjsOnHold','On Hold']];
const SUBINT=['tVideo','tOnsite','tOnsite2','tFinal'];
const STATUS_ORDER=['SOURCING','INTERVIEW','OFFER','FILLED','ON_HOLD','CANCELLED'];
const FILTERDEFS=[['country','Country'],['unit','Stäubli unit'],['division','Division'],
  ['family','Job family'],['contract','Contract type'],['jobStatus','Job status'],['recruiter','Recruiter'],
  ['origin','Origin']];
const MULTIVAL={recruiter:true};   // fields that hold several comma-separated values per row
const splitList=s=>String(s||'').split(',').map(x=>x.trim()).filter(Boolean);
const SEL={}; FILTERDEFS.forEach(([k])=>SEL[k]=new Set());
const DATE={from:null,to:null};   // Job Creation Date range (inclusive), null = unbounded
const JOBREFS=new Set();            // selected Job Refs for one-or-more-job reconciliation (empty = all jobs)
const CSS=k=>getComputedStyle(document.documentElement).getPropertyValue(k).trim();
const parseDMY=s=>{if(!s)return null;const d=new Date(s+'T00:00:00');return isNaN(d)?null:d;};
const isoDay=d=>d?d.toISOString().slice(0,10):'';

function showLoaderError(message) {
    const loader = document.getElementById('pageLoader');
    if (!loader) return;

    const inner = loader.querySelector('.pl-inner');
    if (inner) {
        inner.innerHTML =
            '<div class="pl-error-icon">!</div>' +
            '<div class="pl-text pl-text-error">' + message + '</div>' +
            '<button class="pl-retry" onclick="location.reload()">Reload page</button>';
    }
    loader.classList.add('pl-error-state');
    // do NOT add 'hide' — keep the overlay up so the error is visible
}

/* ---------- parse ---------- */
function parse(data,MAP,kind){
  const wb=XLSX.read(data,{type:'array',cellDates:true});
  const ws=wb.Sheets[wb.SheetNames[0]];
  const aoa=XLSX.utils.sheet_to_json(ws,{header:1,defval:null});
  if(!aoa.length)throw new Error('The file is empty.');
  const map=mapHeaders(aoa[0],MAP), vals=Object.values(map);
  if(kind==='app'&&!vals.includes('applied'))throw new Error('File A doesn\u2019t look like an Applications export (missing "Application State: New Date").');
  if(kind==='pos'&&!vals.includes('posStatus'))throw new Error('File B doesn\u2019t look like a Positions export (missing "Position Status").');
  if(kind==='jobs'&&!(vals.includes('jobId')&&vals.includes('jobStatus')))throw new Error('File C doesn\u2019t look like a Jobs export (needs "Job ID" and "Job Status").');
  const rows=[];
  for(let r=1;r<aoa.length;r++){const raw=aoa[r];if(!raw||raw.every(c=>c==null||c===''))continue;
    const o={}; for(const i in map){const key=map[i];let v=raw[i];
      if(['created','applied','hired','offer','dSubmit','dInterview','dOffer'].includes(key))o[key]=toDate(v);
      else if(key[0]==='t'&&key!=='title')o[key]=numOrNull(v);
      else o[key]=v==null?'':String(v).trim();}
    if(kind==='app'||kind==='jobs')o.recruiterList=splitList(o.recruiter);
    if(o.origin!==undefined&&!o.origin)o.origin='(manually added)';   // blank Origin = added outside the FTE Budget tool
    rows.push(o);}
  if(!rows.length)throw new Error('No data rows found under the header.');
  return rows;
}

/* ---------- helpers ---------- */
const days=(a,b)=>(b-a)/86400000;
const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
function uniq(arr){return[...new Set(arr)].filter(x=>x!==''&&x!=null).sort();}
function inRange(d){ // filter on Job Creation Date (the "in period" quarterly window)
  if(!d)return DATE.from==null&&DATE.to==null?true:false; // no creation date -> only shown when range is open
  if(DATE.from&&d<DATE.from)return false;
  if(DATE.to&&d>DATE.to)return false;
  return true;}
function passFilters(r){
  if(JOBREFS.size&&!JOBREFS.has(r.ref))return false;
  if(!inRange(r.created))return false;
  for(const [k] of FILTERDEFS){
    if(SEL[k].size===0)continue;
    if(MULTIVAL[k]){ if(!(r.recruiterList||[]).some(x=>SEL[k].has(x)))return false; }
    else if(!SEL[k].has(r[k]||''))return false;
  }
  return true;}
function refGuard(){ // classify selected refs against the date window
  if(!JOBREFS.size)return null;
  const created={}; APP.forEach(r=>{if(JOBREFS.has(r.ref)&&!(r.ref in created))created[r.ref]=r.created;});
  const notFound=[...JOBREFS].filter(ref=>!(ref in created));
  const outRange=(DATE.from||DATE.to)?[...JOBREFS].filter(ref=>ref in created&&!inRange(created[ref])):[];
  const inRangeRefs=[...JOBREFS].filter(ref=>ref in created&&!outRange.includes(ref));
  if(!inRangeRefs.length)return{type:'block',notFound,outRange,created}; // nothing to show
  if(outRange.length||notFound.length)return{type:'warn',notFound,outRange,created}; // some shown, some not
  return null;}
function fApps(){return APP.filter(passFilters);}
function fPos(){ // positions filtered by the merged job attributes + creation-date window
  return POS.filter(p=>{const a=JOBATTR[p.jobId]||{};
    if(!inRange(a.created))return false;
    if(SEL.recruiter.size&&!(a.recruiterList||[]).some(x=>SEL.recruiter.has(x)))return false;
    return['country','unit','division'].every(k=>SEL[k].size===0||SEL[k].has(a[k]||''));});}

/* ---------- KPIs ---------- */
function kpis(rows){
  const hires=rows.filter(r=>r.hired);
  const tth=hires.map(r=>r.applied?days(r.applied,r.hired):null).filter(d=>d!=null&&d>=0);
  const ttf=hires.map(r=>r.created?days(r.created,r.hired):null).filter(d=>d!=null&&d>=0);
  const reachedInt=rows.filter(r=>r.dInterview).length;             // Interview Date present
  const intHired=rows.filter(r=>r.dInterview&&r.hired).length;      // interviewed and hired
  const offers=rows.filter(r=>r.dOffer);                            // Offer Date present
  const offHired=offers.filter(r=>r.hired).length;                  // offered and hired (accepted)
  const iph=mean(hires.map(r=>SUBINT.reduce((s,k)=>s+(r[k]!=null?1:0),0)));
  const pos=fPos();
  const posFilled=pos.filter(p=>['FILLED','HIRED'].includes(p.posStatus)).length;
  const posOpen=pos.filter(p=>p.posStatus==='OPEN').length;
  return {apps:rows.length,jobs:new Set(rows.map(r=>r.jobId)).size,hires:hires.length,
    tth:mean(tth),ttf:mean(ttf),iph,
    offAcc:offers.length?offHired/offers.length*100:null,offers:offers.length,
    convInt:rows.length?reachedInt/rows.length*100:0,
    convHire:reachedInt?intHired/reachedInt*100:0,
    posFilled,posOpen,hasPos:POS.length>0};
}
function renderKPIs(k){
  const f1=x=>x==null?'—':x.toFixed(1);
  const cards=[
    {l:'Applications',v:k.apps.toLocaleString(),n:k.jobs+' jobs'},
    {l:'Hires',v:k.hires,n:'confirmed'},
    {l:'Time to Hire',v:f1(k.tth),u:'d',n:'apply → hire',lead:true},
    {l:'Time to Fill',v:f1(k.ttf),u:'d',n:'posting → hire'},
    {l:'App → Interview',v:k.convInt.toFixed(1),u:'%',n:'reached interview'},
    {l:'Interviews / Hire',v:k.iph==null?'—':k.iph.toFixed(2),n:'rounds per hire'},
    {l:'Offer Acceptance',v:k.offAcc==null?'—':k.offAcc.toFixed(0),u:'%',n:k.offers+' offers'},
    {l:'Positions Filled',v:k.hasPos?k.posFilled:'—',u:k.hasPos?'':'',n:k.hasPos?k.posOpen+' still open':'load file B'}
  ];
  document.getElementById('kpis').innerHTML=cards.map(c=>`<div class="kpi${c.lead?' lead':''}">
    <div class="k-label">${c.l}</div><div class="k-val">${c.v}${c.u?`<span class="k-unit">${c.u}</span>`:''}</div>
    <div class="k-note">${c.n}</div></div>`).join('');
  // data-quality flags
  const flags=[];
  if(k.offers<20)flags.push(`Only ${k.offers} Offer Dates present in this selection — Offer Acceptance is indicative, not statistically robust.`);
  if(k.convInt<10)flags.push(`Interview Date is recorded on a small share of applications — App→Interview % reflects source-data completeness.`);
  const el=document.getElementById('dqFlag');
  if(flags.length){el.innerHTML='⚠&nbsp;&nbsp;'+flags.join('<br>⚠&nbsp;&nbsp;');el.classList.remove('hidden');}
  else el.classList.add('hidden');
}

/* ---------- chart scaffolding ---------- */
Chart.defaults.font.family="Inter,'Helvetica Neue',Arial,sans-serif";
Chart.defaults.font.size=11; Chart.defaults.color=CSS('--muted');
Chart.defaults.plugins.datalabels.font={family:"Inter,'Helvetica Neue',Arial,sans-serif"};
const AX=()=>({grid:{color:CSS('--line'),drawTicks:false},ticks:{color:CSS('--muted2')},border:{color:CSS('--line')}});
function mk(id,cfg){if(charts[id])charts[id].destroy();charts[id]=new Chart(document.getElementById(id),cfg);}
function monLbl(k){const[y,m]=k.split('-');return new Date(y,m-1,1).toLocaleDateString('en',{month:'short'})+" '"+y.slice(2);}
function counts(rows,key,top){const m={};rows.forEach(r=>{const v=r[key]||'(none)';m[v]=(m[v]||0)+1;});
  let e=Object.entries(m).sort((a,b)=>b[1]-a[1]);
  if(top&&e.length>top){const rest=e.slice(top).reduce((s,x)=>s+x[1],0);e=e.slice(0,top);if(rest)e.push(['Other',rest]);}
  return{labels:e.map(x=>x[0]),data:e.map(x=>x[1])};}
const DL_BAR_H=c=>({display:true,anchor:'end',align:'right',clamp:true,color:CSS('--ink'),
  textStrokeColor:'rgba(255,255,255,.9)',textStrokeWidth:3,font:{weight:700,size:10},
  formatter:v=>v>0?v.toLocaleString():''});
const DL_BAR_V={display:true,anchor:'end',align:'top',color:CSS('--ink'),font:{weight:600,size:10},
  formatter:v=>v>0?v.toLocaleString():''};
// white label text with subtle dark halo, for text sitting on coloured fills (doughnuts, stacked bars)
const DL_ONFILL={display:true,color:'#fff',font:{weight:700,size:10},textStrokeColor:'rgba(0,0,0,.35)',textStrokeWidth:3,
  formatter:v=>v>0?v.toLocaleString():''};

// external labels with leader lines for doughnuts — labels every slice, even tiny ones
const leaderLabels={
  id:'leaderLabels',
  afterDraw(chart){
    if(!chart.options.plugins.leaderLabels||!chart.options.plugins.leaderLabels.on)return;
    const ctx=chart.ctx, meta=chart.getDatasetMeta(0), ds=chart.data.datasets[0];
    const total=ds.data.reduce((s,x)=>s+(x||0),0); if(!total)return;
    const ink=CSS('--ink'), muted=CSS('--muted');
    // gather points per side
    const items=[];
    meta.data.forEach((arc,i)=>{
      const v=ds.data[i]; if(!v)return;
      const ang=(arc.startAngle+arc.endAngle)/2;
      const dir=Math.cos(ang)>=0?1:-1;
      items.push({i,ang,dir,cx:arc.x,cy:arc.y,or:arc.outerRadius,
        x0:arc.x+Math.cos(ang)*arc.outerRadius,y0:arc.y+Math.sin(ang)*arc.outerRadius,
        yTarget:arc.y+Math.sin(ang)*(arc.outerRadius+14),
        color:ds.backgroundColor[i],label:chart.data.labels[i],val:v});
    });
    const LH=26;
    [1,-1].forEach(side=>{
      const list=items.filter(o=>o.dir===side).sort((a,b)=>a.yTarget-b.yTarget);
      // de-collide vertically
      for(let k=1;k<list.length;k++){if(list[k].yTarget-list[k-1].yTarget<LH)list[k].yTarget=list[k-1].yTarget+LH;}
      list.forEach(o=>{
        const or=o.or, cx=o.cx, cy=o.cy;
        const elbowX=cx+o.dir*(or+16);
        const textX=cx+o.dir*(or+26);
        const yA=o.yTarget;
        ctx.save();
        ctx.beginPath();ctx.moveTo(o.x0,o.y0);ctx.lineTo(elbowX,yA);ctx.lineTo(textX,yA);
        ctx.strokeStyle=o.color;ctx.lineWidth=1.2;ctx.stroke();
        ctx.beginPath();ctx.arc(o.x0,o.y0,1.8,0,Math.PI*2);ctx.fillStyle=o.color;ctx.fill();
        const tx=textX+o.dir*4, pct=o.val/total*100, pctT=pct>=10?pct.toFixed(0):pct.toFixed(1);
        ctx.textAlign=o.dir>0?'left':'right'; ctx.textBaseline='middle';
        ctx.fillStyle=ink; ctx.font="700 11px Inter, Arial, sans-serif";
        ctx.fillText(o.label, tx, yA-6);
        ctx.fillStyle=muted; ctx.font="500 10px Inter, Arial, sans-serif";
        ctx.fillText(o.val.toLocaleString()+' · '+pctT+'%', tx, yA+6);
        ctx.restore();
      });
    });
  }
};
Chart.register(leaderLabels);

function renderCharts(rows){
  const steel=CSS('--steel'),steel3=CSS('--steel3'),steel2=CSS('--steel2'),steel4=CSS('--steel4'),
    signal=CSS('--signal'),amber=CSS('--amber'),good=CSS('--good'),warn=CSS('--warn'),muted2=CSS('--muted2'),ink=CSS('--ink');

  // applications over time — monthly stacked bar: Applications + Hires
  const monKey=d=>{const t=new Date(d);return t.toISOString().slice(0,7);};           // YYYY-MM
  const aW={},hW={};rows.forEach(r=>{if(r.applied){const k=monKey(r.applied);aW[k]=(aW[k]||0)+1;}if(r.hired){const k=monKey(r.hired);hW[k]=(hW[k]||0)+1;}});
  const mons=[...new Set([...Object.keys(aW),...Object.keys(hW)])].sort();
  mk('cTime',{type:'bar',data:{labels:mons.map(monLbl),datasets:[
    {label:'Applications',data:mons.map(m=>aW[m]||0),backgroundColor:steel3,stack:'s',borderRadius:{topLeft:0,topRight:0},
     datalabels:{display:ctx=>ctx.dataset.data[ctx.dataIndex]>0,anchor:'center',align:'center',
       color:'#fff',textStrokeColor:'rgba(0,0,0,.35)',textStrokeWidth:3,font:{size:10,weight:700},formatter:v=>v.toLocaleString()}},
    {label:'Hires',data:mons.map(m=>hW[m]||0),backgroundColor:signal,stack:'s',borderRadius:{topLeft:2,topRight:2},
     datalabels:{display:ctx=>ctx.dataset.data[ctx.dataIndex]>0,anchor:'end',align:'top',
       color:signal,font:{size:9.5,weight:700},formatter:v=>v.toLocaleString()}}]},
    options:{maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
      layout:{padding:{top:18}},
      onHover:(e,el)=>{e.native.target.style.cursor=el.length?'pointer':'default';},
      onClick:(e,el)=>{if(!el.length)return;const mkey=mons[el[0].index];
        setDrill(`Applications in ${monLbl(mkey)}`,r=>r.applied&&r.applied.toISOString().slice(0,7)===mkey);},
      plugins:{legend:{labels:{boxWidth:10,boxHeight:10,usePointStyle:true,padding:16}}},
      scales:{x:{...AX(),stacked:true,ticks:{color:muted2}},
        y:{...AX(),stacked:true,beginAtZero:true,title:{display:true,text:'per month',color:muted2,font:{size:9}}}}}});

  // job status — stacked: jobs (distinct Job IDs) + applications, in pipeline order
  const stPipe=['CREATED','SOURCING','INTERVIEW','OFFER','FILLED'];
  const fjobs=filteredJobs();                       // job-level filtered (includes no-application jobs when File C loaded)
  const presentExtra=uniq([...rows.map(r=>r.jobStatus),...fjobs.map(j=>j.jobStatus)]).filter(s=>s&&!stPipe.includes(s));
  const st=[...stPipe,...presentExtra];
  // applications per status (from filtered app rows)
  const stApps=st.map(s=>rows.filter(r=>r.jobStatus===s).length);
  // jobs per status — job-level, so Created & no-applicant jobs are counted and honour the filters
  const jc={}; fjobs.forEach(j=>{if(j.jobStatus)jc[j.jobStatus]=(jc[j.jobStatus]||0)+1;});
  const stJobs=st.map(s=>jc[s]||0);
  const dlJobs={display:true,anchor:'start',align:'right',clamp:true,color:CSS('--ink'),
    textStrokeColor:'rgba(255,255,255,.9)',textStrokeWidth:3,font:{size:10,weight:700},formatter:v=>v>0?v.toLocaleString():''};
  const dlApps={display:true,anchor:'center',align:'center',color:'#fff',
    textStrokeColor:'rgba(0,0,0,.35)',textStrokeWidth:3,font:{size:10,weight:700},formatter:v=>v>0?v.toLocaleString():''};
  mk('cStatus',{type:'bar',data:{labels:st,datasets:[
    {label:'Jobs (by Job ID)',data:stJobs,backgroundColor:signal,borderRadius:2,stack:'s',datalabels:dlJobs},
    {label:'Applications',data:stApps,backgroundColor:steel3,borderRadius:2,stack:'s',datalabels:dlApps}]},
    options:{maintainAspectRatio:false,indexAxis:'y',
      plugins:{legend:{labels:{boxWidth:10,boxHeight:10,padding:14}},
        tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${c.raw.toLocaleString()}`}}},
      onHover:(e,el)=>{e.native.target.style.cursor=el.length?'pointer':'default';},
      onClick:(e,el)=>{if(!el.length)return;const v=st[el[0].index];setDrill(`Job status = ${v}`,r=>r.jobStatus===v,j=>j.jobStatus===v);},
      layout:{padding:{right:48}},scales:{x:{...AX(),beginAtZero:true,stacked:true,grace:'3%'},y:{...AX(),stacked:true}}}});

  // stage conversion strip (replaces the funnel — honest step-by-step conversion)
  renderConvStrip(rows);

  // applications by source + source of hire — both dimension-toggleable (source / sub source / source type)
  renderSource();
  renderHireSrc();

  // consolidated Applications-by (geography / unit / division / recruiter)
  renderAppBreak();
  // positions filled vs open — dimension is toggleable (geography / unit / division / recruiter)
  renderPositions();
}

/* ---------- sourcing: applications by source & source of hire (toggleable dimension) ---------- */
let SRCDIM='source', HIRESRCDIM='sourceType';
const SRCDIM_LABEL={source:'SOURCE',sourceSub:'SUB SOURCE',sourceType:'SOURCE TYPE'};
const SRC_PALETTE=()=>[CSS('--signal'),CSS('--steel'),CSS('--amber'),CSS('--steel2'),CSS('--warn'),CSS('--steel4'),CSS('--muted2'),CSS('--steel3')];
function renderSource(){
  const rows=LASTROWS, steel3=CSS('--steel3'),steel=CSS('--steel'),muted2=CSS('--muted2');
  document.querySelectorAll('#srcToggle button').forEach(b=>b.classList.toggle('on',b.dataset.d===SRCDIM));
  document.getElementById('srcSub').textContent='TOP 10 · BY '+SRCDIM_LABEL[SRCDIM];
  const src=counts(rows,SRCDIM,10);
  mk('cSource',{type:'bar',data:{labels:src.labels,datasets:[{data:src.data,backgroundColor:steel3,
    hoverBackgroundColor:steel,borderRadius:2,datalabels:DL_BAR_H()}]},
    options:{maintainAspectRatio:false,indexAxis:'y',layout:{padding:{right:44}},
      onHover:(e,el)=>{e.native.target.style.cursor=el.length?'pointer':'default';},
      onClick:(e,el)=>{if(!el.length)return;const v=src.labels[el[0].index];const dim=SRCDIM;
        if(v==='Other'){const top=new Set(src.labels.filter(l=>l!=='Other'));setDrill(`${SRCDIM_LABEL[dim]} = Other`,r=>!top.has(r[dim]||'(none)'));}
        else setDrill(`${SRCDIM_LABEL[dim]} = ${v}`,r=>(r[dim]||'(none)')===v);},
      plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`${c.raw.toLocaleString()} (${(c.raw/rows.length*100).toFixed(1)}%)`}}},
      scales:{x:{...AX(),beginAtZero:true},y:{...AX(),ticks:{color:muted2,autoSkip:false,font:{size:10}}}}}});
}
function renderHireSrc(){
  const rows=LASTROWS, pc=SRC_PALETTE();
  document.querySelectorAll('#hireSrcToggle button').forEach(b=>b.classList.toggle('on',b.dataset.d===HIRESRCDIM));
  document.getElementById('hireSrcSub').textContent='HIRES BY '+SRCDIM_LABEL[HIRESRCDIM];
  const hs=counts(rows.filter(r=>r.hired),HIRESRCDIM,HIRESRCDIM==='source'?12:20);
  mk('cHireSrc',{type:'doughnut',data:{labels:hs.labels,datasets:[{data:hs.data,
    backgroundColor:hs.labels.map((_,i)=>pc[i%pc.length]),borderColor:CSS('--panel'),borderWidth:2,
    datalabels:{display:false}}]},
    options:{maintainAspectRatio:false,cutout:'55%',layout:{padding:{left:90,right:90,top:26,bottom:26}},
      plugins:{legend:{display:false},leaderLabels:{on:true},
        tooltip:{callbacks:{label:c=>{const t=c.dataset.data.reduce((s,x)=>s+x,0);return `${c.label}: ${c.raw.toLocaleString()} (${(c.raw/t*100).toFixed(1)}%)`;}}}}}});
}

/* ---------- consolidated Applications-by dimension ---------- */
let APPDIM='country';
const APPDIM_LABEL={country:'GEOGRAPHY',unit:'STÄUBLI UNIT',division:'DIVISION',recruiter:'RECRUITER'};
function applicationsAgg(dim){
  const agg={};
  LASTROWS.forEach(r=>{
    let keys;
    if(dim==='recruiter')keys=(r.recruiterList&&r.recruiterList.length)?r.recruiterList:['(unassigned)'];
    else keys=[r[dim]||'(none)'];
    keys.forEach(k=>{if(!agg[k])agg[k]={a:0,h:0};agg[k].a++;if(r.hired)agg[k].h++;});});
  return Object.entries(agg).sort((a,b)=>b[1].a-a[1].a);
}
function renderAppBreak(){
  const sub=document.getElementById('appBreakSub');
  document.querySelectorAll('#appToggle button').forEach(b=>b.classList.toggle('on',b.dataset.d===APPDIM));
  const steel3=CSS('--steel3'),signal=CSS('--signal'),muted2=CSS('--muted2');
  const ce=applicationsAgg(APPDIM).slice(0,12);
  sub.textContent='TOP 12 · APPLICATIONS VS HIRES · BY '+APPDIM_LABEL[APPDIM]+(APPDIM==='recruiter'?' · MULTI-RECRUITER JOBS COUNT FOR EACH':'');
  mk('cAppBreak',{type:'bar',data:{labels:ce.map(x=>x[0]),datasets:[
    {label:'Applications',data:ce.map(x=>x[1].a),backgroundColor:steel3,borderRadius:2,datalabels:DL_BAR_H()},
    {label:'Hires',data:ce.map(x=>x[1].h),backgroundColor:signal,borderRadius:2,
      datalabels:{display:true,anchor:'end',align:'right',clamp:true,color:signal,
        textStrokeColor:'rgba(255,255,255,.9)',textStrokeWidth:3,font:{size:9,weight:700},formatter:v=>v>0?v:''}}]},
    options:{maintainAspectRatio:false,indexAxis:'y',layout:{padding:{right:48}},
      onHover:(e,el)=>{e.native.target.style.cursor=el.length?'pointer':'default';},
      onClick:(e,el)=>{if(!el.length)return;const v=ce[el[0].index][0];const dim=APPDIM;
        if(dim==='recruiter')setDrill(`Recruiter = ${v}`,r=>(r.recruiterList&&r.recruiterList.length?r.recruiterList:['(unassigned)']).includes(v));
        else setDrill(`${APPDIM_LABEL[dim]} = ${v}`,r=>(r[dim]||'(none)')===v);},
      plugins:{legend:{labels:{boxWidth:10,boxHeight:10,padding:14}}},
      scales:{x:{...AX(),beginAtZero:true},y:{...AX(),ticks:{color:muted2,autoSkip:false,font:{size:10}}}}}});
}

/* ---------- positions: filled vs open, by chosen dimension ---------- */
let POSDIM='country';
const POSDIM_META={country:{key:'country',label:'GEOGRAPHY'},unit:{key:'unit',label:'STÄUBLI UNIT'},division:{key:'division',label:'DIVISION'},recruiter:{key:'recruiter',label:'RECRUITER'}};
function positionsAgg(dim){
  const pos=fPos(), agg={};
  pos.forEach(p=>{const a=JOBATTR[p.jobId]||{};
    let keys;
    if(dim==='recruiter')keys=(a.recruiterList&&a.recruiterList.length)?a.recruiterList:['(unassigned)'];
    else keys=[a[dim]||'(unmatched)'];
    const b=['FILLED','HIRED'].includes(p.posStatus)?'f':(p.posStatus==='OPEN'?'o':'d');
    keys.forEach(k=>{if(!agg[k])agg[k]={f:0,o:0,d:0};agg[k][b]++;});});
  return Object.entries(agg).sort((a,b)=>(b[1].f+b[1].o)-(a[1].f+a[1].o));
}
function renderPositions(){
  const posSub=document.getElementById('posSub');
  document.querySelectorAll('#posToggle button').forEach(b=>b.classList.toggle('on',b.dataset.d===POSDIM));
  if(!POS.length){
    posSub.textContent='LOAD THE POSITIONS FILE (B) TO POPULATE';
    if(charts['cPositions'])charts['cPositions'].destroy();
    const cv=document.getElementById('cPositions'),cx=cv.getContext('2d');cx.clearRect(0,0,cv.width,cv.height);
    return;
  }
  const good=CSS('--good'),amber=CSS('--amber'),muted2=CSS('--muted2');
  const pe=positionsAgg(POSDIM).slice(0,10);
  posSub.textContent='BY '+POSDIM_META[POSDIM].label+' · FILLED/HIRED VS OPEN'+(POSDIM==='recruiter'?' · JOBS WITH MULTIPLE RECRUITERS COUNT FOR EACH':'');
  const dl={display:true,color:'#fff',textStrokeColor:'rgba(0,0,0,.35)',textStrokeWidth:3,font:{size:9,weight:700},formatter:v=>v>0?v:''};
  mk('cPositions',{type:'bar',data:{labels:pe.map(x=>x[0]),datasets:[
    {label:'Filled / Hired',data:pe.map(x=>x[1].f),backgroundColor:good,borderRadius:2,stack:'s',datalabels:dl},
    {label:'Open',data:pe.map(x=>x[1].o),backgroundColor:amber,borderRadius:2,stack:'s',datalabels:dl}]},
    options:{maintainAspectRatio:false,indexAxis:'y',plugins:{legend:{labels:{boxWidth:10,boxHeight:10,padding:14}}},
      onHover:(e,el)=>{e.native.target.style.cursor=el.length?'pointer':'default';},
      onClick:(e,el)=>{if(!el.length)return;const v=pe[el[0].index][0];const dim=POSDIM;
        if(dim==='recruiter')setDrill(`Recruiter = ${v}`,r=>(r.recruiterList&&r.recruiterList.length?r.recruiterList:['(unassigned)']).includes(v));
        else setDrill(`${POSDIM_META[dim].label} = ${v}`,r=>(r[dim]||'(unmatched)')===v);},
      scales:{x:{...AX(),beginAtZero:true,stacked:true},y:{...AX(),stacked:true,ticks:{color:muted2,autoSkip:false,font:{size:10}}}}}});
}

/* ---------- stage conversion strip ---------- */
function renderConvStrip(rows){
  const host=document.getElementById('convStrip'); if(!host)return;
  // stage membership from the actual stage DATE columns — a date means the applicant reached that stage
  const has={New:r=>!!r.applied, Submit:r=>!!r.dSubmit, Int:r=>!!r.dInterview, Off:r=>!!r.dOffer, Hire:r=>!!r.hired};
  const nApp=rows.length,
        nSub=rows.filter(has.Submit).length,
        nInt=rows.filter(has.Int).length,
        nOff=rows.filter(has.Off).length,
        nHire=rows.filter(has.Hire).length;
  const stages=[['New applications',nApp],['Submitted to manager',nSub],['Interview',nInt],['Offer',nOff],['Hire',nHire]];
  // true stage-to-stage conversion: of those who reached stage i, how many also reached the next stage
  const both=(a,b)=>rows.filter(r=>a(r)&&b(r)).length;
  const conv=[null,
    nApp?nSub/nApp:0,                                  // New → Submitted to manager
    nSub?both(has.Submit,has.Int)/nSub:0,              // Submitted → Interview
    nInt?both(has.Int,has.Off)/nInt:0,                 // Interview → Offer
    nOff?both(has.Off,has.Hire)/nOff:0];               // Offer → Hire
  const pct=(a,b)=>b?(a/b*100):0;
  const fmtP=x=>x>=10?x.toFixed(0):x.toFixed(1);
  const parts=[];
  stages.forEach((s,i)=>{
    parts.push(`<div class="cs-stage">
        <div class="cs-val">${s[1].toLocaleString()}</div>
        <div class="cs-lab">${s[0]}</div>
        <div class="cs-sub">${i===0?'100%':fmtP(pct(s[1],nApp))+'% of apps'}</div>
      </div>`);
    if(i<stages.length-1){
      parts.push(`<div class="cs-conn">
        <div class="cs-pct">${fmtP(conv[i+1]*100)}%</div>
        <div class="cs-arrow">▸</div>
        <div class="cs-steplab">${stages[i][0].split(' ')[0]} → ${stages[i+1][0].split(' ')[0]}</div>
      </div>`);
    }
  });
  const overall=fmtP(pct(nHire,nApp));
  // export-ready copy of the funnel (respects current filters)
  CONV_EXPORT=stages.map((s,i)=>({Stage:s[0],Reached:s[1],
    '% of applications':i===0?100:+pct(s[1],nApp).toFixed(1),
    'Step conversion into stage %':i===0?'':+ (conv[i]*100).toFixed(1)}));
  // data notes — applicants who reached a stage without the prior stage's date (out-of-sequence / missing dates)
  const cnt=f=>rows.filter(f).length;
  const notes=[];
  const noNewRows=rows.filter(r=>!has.New(r));
  const noNew=noNewRows.length;
  const leads=noNewRows.filter(r=>r.tLead!=null).length;
  if(noNew>0){
    const q=leads===noNew?'all are':leads?`${leads.toLocaleString()} are`:'none appear to be';
    const tail=leads?` — ${q} sourced Leads that never converted to an active application (they carry a Lead timestamp but no New-state date)`:'';
    notes.push(`<b>${noNew.toLocaleString()}</b> application${noNew===1?'':'s'} have no New-state date${tail}.`);
  }
  const intNoSub=cnt(r=>has.Int(r)&&!has.Submit(r));
  if(intNoSub>0)notes.push(`<b>${intNoSub.toLocaleString()}</b> reached Interview without a Submitted-to-manager date — the Submitted → Interview step counts only those with both dates (a conditional %, not the bar-height ratio).`);
  const offNoInt=cnt(r=>has.Off(r)&&!has.Int(r));
  if(offNoInt>0)notes.push(`<b>${offNoInt.toLocaleString()}</b> reached Offer without an Interview date — outside the Interview → Offer step.`);
  const hireNoOff=cnt(r=>has.Hire(r)&&!has.Off(r));
  if(hireNoOff>0)notes.push(`<b>${hireNoOff.toLocaleString()}</b> hire${hireNoOff===1?' was':'s were'} recorded without an Offer date — outside the Offer → Hire step.`);
  host.innerHTML=`<div class="cstrip">${parts.join('')}</div>
    <div class="cstrip-foot"><b>${overall}%</b> overall application → hire &nbsp;·&nbsp; `+
    `<span class="cs-caveat">Stages are counted from the stage <b>date</b> columns — a date means the applicant reached that stage, so brief time in a status is still counted. Each step is “of those who reached a stage, how many reached the next.”</span></div>`+
    (notes.length?`<div class="cs-notes"><div class="cs-notes-h">Data notes — missing / out-of-sequence dates</div><ul>${notes.map(n=>`<li>${n}</li>`).join('')}</ul></div>`:'');
}

/* ---------- heat map ---------- */
function heatRGB(v,min,max){
  const t=max>min?(v-min)/(max-min):0;
  // light pink -> Stäubli red -> deep red (reads on a white panel)
  const stops=[[247,222,224],[233,138,146],[226,0,15],[143,10,18]];
  const seg=t*(stops.length-1);const i=Math.min(Math.floor(seg),stops.length-2);const f=seg-i;
  return stops[i].map((a,j)=>Math.round(a+(stops[i+1][j]-a)*f));
}
function renderHeatInto(hostId,rows,states,emptyNote){
  const host=document.getElementById(hostId); if(!host)return;
  const units=counts(rows,'unit').labels.filter(u=>u!=='Other').slice(0,10);
  const grid=[]; let allVals=[];
  const overall=states.map(([k])=>{const v=mean(rows.map(r=>r[k]).filter(x=>x!=null));return v;});
  units.forEach(uv=>{const sub=rows.filter(r=>(r.unit||'(none)')===uv);
    const cells=states.map(([k])=>{const v=mean(sub.map(r=>r[k]).filter(x=>x!=null));if(v!=null)allVals.push(v);return v;});
    grid.push({label:uv,cells});});
  overall.forEach(v=>{if(v!=null)allVals.push(v);});
  if(!allVals.length){host.innerHTML=`<div class="heat-empty">${emptyNote||'No data available for this heat map in the current selection.'}</div>`;HEATDATA[hostId]=null;return;}
  const min=Math.min(...allVals),max=Math.max(...allVals);
  HEATDATA[hostId]={rowTitle:'Stäubli unit',colLabels:states.map(s=>s[1]),
    rowLabels:['All units',...grid.map(g=>g.label)],values:[overall,...grid.map(g=>g.cells)],min,max};
  const cell=(v)=>{if(v==null)return `<td><div class="cell empty">—</div></td>`;
    const c=heatRGB(v,min,max);
    const lum=(0.299*c[0]+0.587*c[1]+0.114*c[2])/255;      // dark text on pale cells, white on saturated
    const fg=lum>0.62?'#1d1d1b':'#fff';
    return `<td><div class="cell" style="background:rgb(${c[0]},${c[1]},${c[2]});color:${fg}">${v.toFixed(1)}<small>days</small></div></td>`;};
  let html=`<table class="heat"><thead><tr><th class="rowh">Stäubli unit</th>${states.map(s=>`<th>${s[1]}</th>`).join('')}</tr></thead><tbody>`;
  html+=`<tr><td class="rh" style="font-weight:700;color:${CSS('--signal')}">All units</td>${overall.map(cell).join('')}</tr>`;
  grid.forEach(g=>{html+=`<tr><td class="rh">${g.label}</td>${g.cells.map(cell).join('')}</tr>`;});
  html+=`</tbody></table><div class="heat-legend">fewer days<span class="ramp"></span>more days · blank = no data recorded in that state</div>`;
  host.innerHTML=html;
}
function renderHeat(rows){ renderHeatInto('heat',rows,STATES); }
function renderHeat2(rows){
  renderHeatInto('heat2',rows.filter(r=>r.jobStatus!=='CANCELLED'),STATES2,
    'No “Time In Job Status” data found yet. Add these columns to the applications export to populate this heat map: '+
    '<b>Time In Job Status: Created</b>, <b>Sourcing</b>, <b>Interview</b>, <b>Offer</b>, <b>On Hold</b> (one numeric “days” value per application).');
}
/* ---------- heat map: draw to canvas for PNG / expand (no external library) ---------- */
const HEAT_META={heat:{title:'Average time in application stage — heat map',file:'time_in_application_stage_heatmap'},
  heat2:{title:'Average time in job status — heat map',file:'time_in_job_status_heatmap'}};
function drawHeatCanvas(id,scale){
  const d=HEATDATA[id]; if(!d)return null; scale=scale||2;
  const labelW=190,cellW=90,cellH=40,headH=30,pad=14,legendH=8;
  const cols=d.colLabels.length,rows=d.rowLabels.length;
  const W=labelW+cols*cellW+pad*2, H=headH+rows*cellH+pad*2+legendH;
  const c=document.createElement('canvas'); c.width=Math.round(W*scale); c.height=Math.round(H*scale);
  const x=c.getContext('2d'); x.scale(scale,scale);
  x.fillStyle='#ffffff'; x.fillRect(0,0,W,H); x.textBaseline='middle';
  x.fillStyle=CSS('--muted'); x.font='700 11px Inter, Arial, sans-serif'; x.textAlign='left';
  x.fillText(d.rowTitle,pad,pad+headH/2);
  x.textAlign='center';
  d.colLabels.forEach((cl,ci)=>x.fillText(cl,pad+labelW+ci*cellW+cellW/2,pad+headH/2));
  d.rowLabels.forEach((rl,ri)=>{
    const y=pad+headH+ri*cellH;
    x.textAlign='left'; x.fillStyle=ri===0?CSS('--signal'):CSS('--ink');
    x.font=(ri===0?'700 ':'500 ')+'11px Inter, Arial, sans-serif';
    x.fillText(rl.length>27?rl.slice(0,26)+'…':rl,pad,y+cellH/2);
    d.values[ri].forEach((v,ci)=>{
      const cx=pad+labelW+ci*cellW, cy=y;
      if(v==null){x.fillStyle=CSS('--panel2');x.fillRect(cx+2,cy+2,cellW-4,cellH-4);
        x.fillStyle=CSS('--muted2');x.textAlign='center';x.font='500 11px Inter, Arial, sans-serif';
        x.fillText('—',cx+cellW/2,cy+cellH/2);return;}
      const col=heatRGB(v,d.min,d.max);
      x.fillStyle=`rgb(${col[0]},${col[1]},${col[2]})`; x.fillRect(cx+2,cy+2,cellW-4,cellH-4);
      const lum=(0.299*col[0]+0.587*col[1]+0.114*col[2])/255;
      x.fillStyle=lum>0.62?'#1d1d1b':'#fff'; x.textAlign='center';
      x.font='700 13px Inter, Arial, sans-serif'; x.fillText(v.toFixed(1),cx+cellW/2,cy+cellH/2-4);
      x.font='500 8px Inter, Arial, sans-serif'; x.fillText('days',cx+cellW/2,cy+cellH/2+9);
    });
  });
  return c;
}
function downloadHeatPNG(id){
  const c=drawHeatCanvas(id,2); if(!c)return;
  const a=document.createElement('a'); a.href=c.toDataURL('image/png'); a.download=HEAT_META[id].file+'.png'; a.click();
}
function openHeatExpand(id){
  const c=drawHeatCanvas(id,2); if(!c)return;
  modalKind='heat'; modalId=id;
  document.getElementById('modalTitle').textContent=HEAT_META[id].title;
  document.getElementById('modalCanvasWrap').style.display='none';
  const hw=document.getElementById('modalHtmlWrap'); hw.style.display='block'; hw.innerHTML='';
  c.style.width='100%'; c.style.maxWidth=(c.width/2)+'px'; c.style.height='auto'; c.style.display='block'; c.style.margin='0 auto';
  hw.appendChild(c);
  if(modalChart){modalChart.destroy();modalChart=null;}
  document.getElementById('modalOv').classList.add('show');
}
function heatXlsx(id){
  const d=HEATDATA[id]; if(!d)return;
  const rows=d.rowLabels.map((rl,ri)=>{const o={[d.rowTitle]:rl};
    d.colLabels.forEach((cl,ci)=>{const v=d.values[ri][ci];o[cl+' (days)']=v==null?null:Number(v.toFixed(1));});return o;});
  const ws=XLSX.utils.json_to_sheet(rows); const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'Data');
  XLSX.writeFile(wb,HEAT_META[id].file+'_'+new Date().toISOString().slice(0,10)+'.xlsx');
}
function ensureHeatButtons(){
  ['heat','heat2'].forEach(id=>{
    const host=document.getElementById(id); if(!host)return;
    const panel=host.closest('.panel'); if(!panel||panel.querySelector('.chart-tools'))return;
    const tools=document.createElement('div'); tools.className='chart-tools';
    const e=document.createElement('button'); e.className='ctbtn'; e.textContent='⤢ Expand';
    e.title='View full screen'; e.onclick=()=>openHeatExpand(id); tools.appendChild(e);
    const x=document.createElement('button'); x.className='ctbtn'; x.textContent='⬇ Excel';
    x.title='Download this heat map\u2019s data as Excel'; x.onclick=()=>heatXlsx(id); tools.appendChild(x);
    const p=document.createElement('button'); p.className='ctbtn'; p.textContent='↓ PNG';
    p.title='Download this heat map as a PNG image'; p.onclick=()=>downloadHeatPNG(id); tools.appendChild(p);
    panel.appendChild(tools);
  });
}

/* ---------- job table ---------- */
function renderTable(rows){
  // application counts per job (from filtered app rows; respects the bar-drill app predicate)
  const appRows=DRILL?rows.filter(DRILL.pred):rows;
  const ac={}; appRows.forEach(r=>{const id=r.jobId||r.ref;if(!id)return;
    if(!ac[id])ac[id]={apps:0,hires:0};ac[id].apps++;if(r.hired)ac[id].hires++;});
  // base set = jobs passing the job-level filters (includes no-application jobs when File C is loaded)
  let jobs=filteredJobs();
  if(DRILL){
    const drillJobIds=new Set(appRows.map(r=>r.jobId||r.ref));
    jobs=jobs.filter(j=>drillJobIds.has(j.jobId)||(DRILL.jobPred&&DRILL.jobPred(j)));
  }
  // position counts per job
  const pjm={};POS.forEach(p=>{if(!pjm[p.jobId])pjm[p.jobId]={f:0,o:0,tot:0,del:0};
    pjm[p.jobId].tot++;
    if(['FILLED','HIRED'].includes(p.posStatus))pjm[p.jobId].f++;else if(p.posStatus==='OPEN')pjm[p.jobId].o++;
    else if(p.posStatus==='DELETED')pjm[p.jobId].del++;});
  const arr=jobs.map(j=>({j,a:ac[j.jobId]||{apps:0,hires:0}})).sort((x,y)=>y.a.apps-x.a.apps);
  const hasPos=POS.length>0;
  // keep an export-ready copy of exactly what's shown (respects filters + drill)
  TABLE_EXPORT=arr.map(({j,a})=>{const p=pjm[j.jobId]||{f:0,o:0,tot:0,del:0};const row={
    'Job Title':j.title||'','Job Ref':j.ref||'','Country':j.country||'','Stäubli unit':j.unit||'',
    'Division':j.division||'','Job family':j.family||'','Contract type':j.contract||'','Origin':j.origin||'',
    'Job Status':j.jobStatus||'','Recruiters':(j.recruiterList||[]).join(', '),
    'Applications':a.apps,'Hires':a.hires};
    if(hasPos){row['Positions total']=p.tot;row['Positions filled/hired']=p.f;row['Positions open']=p.o;row['Positions deleted']=p.del;}
    return row;});
  const noApp=arr.filter(x=>x.a.apps===0).length;
  const sub=document.getElementById('jobTableSub');
  if(sub)sub.textContent=`${arr.length.toLocaleString()} JOB${arr.length===1?'':'S'}`+(DRILL?` · FILTERED BY BAR SELECTION`:'')+(noApp?` · ${noApp} WITH NO APPLICATIONS`:'')+` · SORTED BY APPLICATION VOLUME · CLICK ANY BAR ABOVE TO FILTER`;
  renderDrillChip();
  const t=document.getElementById('jobTable');
  const cols=hasPos?10:7;
  t.innerHTML=`<thead><tr><th>Job</th><th>Job Ref</th><th>Country</th><th>Unit</th><th>Job status</th>
    <th class="num">Apps</th><th class="num">Hires</th>${hasPos?'<th class="num">Pos. total</th><th class="num">Pos. filled</th><th class="num">Pos. open</th>':''}</tr></thead>
    <tbody>${arr.length?arr.map(({j,a})=>{const p=pjm[j.jobId]||{f:0,o:0,tot:0};return `<tr>
      <td class="ttl" title="${(j.title||'').replace(/"/g,'')}">${j.title||'—'}</td>
      <td style="font-variant-numeric:tabular-nums">${j.ref||'—'}</td>
      <td>${j.country||'—'}</td><td style="color:var(--muted)">${j.unit||'—'}</td>
      <td><span class="pill">${j.jobStatus||'—'}</span></td>
      <td class="num">${a.apps}</td><td class="num"${a.hires?' style="color:var(--good)"':''}>${a.hires}</td>
      ${hasPos?`<td class="num">${p.tot||'—'}</td><td class="num">${p.f||'—'}</td><td class="num"${p.o?' style="color:var(--amber)"':''}>${p.o||'—'}</td>`:''}</tr>`;}).join(''):`<tr><td colspan="${cols}" style="color:var(--muted2);padding:16px">No jobs match this selection.</td></tr>`}</tbody>`;
}
/* ---------- recruiter capacity ---------- */
const REC_ACTIVE=new Set(['CREATED','SOURCING','INTERVIEW','OFFER','ON_HOLD']);
let REC_SORT={key:'reqs',dir:-1}, REC_EXPORT=[], OFF_EXPORT=[];
function recTargetVal(){return Math.max(1,+((document.getElementById('recTarget')||{}).value)||10);}
function recRag(u){return u>1?'r':u>=0.8?'a':'g';}
const REC_STATUSES=['CREATED','SOURCING','INTERVIEW','OFFER','ON_HOLD'];
const REC_STLABEL={CREATED:'Created',SOURCING:'Sourcing',INTERVIEW:'Interview',OFFER:'Offer',ON_HOLD:'On Hold'};
const REC_COL={Reqs:'#1d1d1b',CREATED:'#c2c6ca',SOURCING:'#7d8891',INTERVIEW:'#e8a13a',OFFER:'#2e9e5b',ON_HOLD:'#e2000f'};
const DL_STACK={display:'auto',color:'#fff',font:{size:10,weight:700},clamp:true,formatter:v=>v>0?v.toLocaleString():''};
function computeRecruiters(rows){
  const m={};
  const g=n=>m[n]||(m[n]={name:n,reqs:0,live:0,vol:0,hires:0,offers:0,acc:0,tthSum:0,tthN:0,
    byStatus:{CREATED:0,SOURCING:0,INTERVIEW:0,OFFER:0,ON_HOLD:0}});
  rows.forEach(r=>{
    const live=!r.hired&&!r.preReject;   // open application: not hired, not rejected/withdrawn (terminated apps carry a Before-Rejection status)
    const recs=(r.recruiterList&&r.recruiterList.length)?r.recruiterList:['(unassigned)'];
    recs.forEach(n=>{const o=g(n);o.vol++;if(live)o.live++;
      if(live&&REC_ACTIVE.has(r.jobStatus))o.byStatus[r.jobStatus]++;   // live applicants grouped by their job's status
      if(r.hired){o.hires++;if(r.applied){const d=(r.hired-r.applied)/86400000;if(d>=0){o.tthSum+=d;o.tthN++;}}}
      if(r.dOffer){o.offers++;if(r.hired)o.acc++;}});
  });
  filteredJobs().forEach(j=>{if(REC_ACTIVE.has(j.jobStatus)){
    const recs=(j.recruiterList&&j.recruiterList.length)?j.recruiterList:['(unassigned)'];
    recs.forEach(n=>{g(n).reqs++;});}});
  return Object.values(m).map(o=>({...o,tth:o.tthN?o.tthSum/o.tthN:null,accPct:o.offers?o.acc/o.offers*100:null}));
}
function renderRecruiters(rows){
  const target=recTargetVal();
  const data=computeRecruiters(rows);
  const {key,dir}=REC_SORT;
  data.sort((a,b)=>{if(key==='name'){const av=(a.name||'').toLowerCase(),bv=(b.name||'').toLowerCase();return av<bv?-dir:av>bv?dir:0;}
    const av=a[key]==null?-Infinity:a[key],bv=b[key]==null?-Infinity:b[key];return (av-bv)*dir;});
  REC_EXPORT=data.map(o=>({Recruiter:o.name,'Live requisitions':o.reqs,'Live applicants':o.live,
    'Utilisation % (reqs vs target)':+(o.reqs/target*100).toFixed(0),Hires:o.hires,
    'Avg time-to-hire (d)':o.tth==null?'':+o.tth.toFixed(1),'Offer acceptance %':o.accPct==null?'':+o.accPct.toFixed(0)}));
  const arrow=k=>REC_SORT.key===k?`<span class="arr">${REC_SORT.dir<0?'▼':'▲'}</span>`:'';
  const th=(k,l,cls)=>`<th class="sortable ${cls||''}" data-k="${k}">${l} ${arrow(k)}</th>`;
  const t=document.getElementById('recTable');
  t.innerHTML=`<thead><tr>${th('name','Recruiter')}${th('reqs','Live reqs','num')}<th class="num">Utilisation</th>${th('live','Live applicants','num')}${th('hires','Hires','num')}${th('tth','Avg TTH (d)','num')}${th('accPct','Offer accept','num')}</tr></thead><tbody>${
    data.map(o=>{const u=o.reqs/target,cls=recRag(u);return `<tr>
      <td class="ttl">${o.name}</td><td class="num">${o.reqs||'—'}</td>
      <td class="num"><span class="rag-pill ${cls}">${(u*100).toFixed(0)}%</span></td>
      <td class="num">${o.live}</td>
      <td class="num"${o.hires?' style="color:var(--good)"':''}>${o.hires||'—'}</td>
      <td class="num">${o.tth==null?'—':o.tth.toFixed(1)}</td>
      <td class="num">${o.accPct==null?'—':o.accPct.toFixed(0)+'%'}</td></tr>`;}).join('')}</tbody>`;
  t.querySelectorAll('th.sortable').forEach(h=>h.onclick=()=>{const k=h.dataset.k;
    if(REC_SORT.key===k)REC_SORT.dir*=-1;else REC_SORT={key:k,dir:k==='name'?1:-1};renderRecruiters(LASTROWS);});
  const sub=document.getElementById('recSub');
  if(sub)sub.textContent=`${data.length} RECRUITERS · UTILISATION = LIVE REQS ÷ TARGET (${target}) · LIVE REQS = UNIQUE JOB IDs IN CREATED / SOURCING / INTERVIEW / OFFER / ON-HOLD (EXCL. FILLED & CANCELLED) · CLICK A COLUMN TO SORT`;
  // chart: stacked per recruiter — Reqs + live applicants split by their job status (auto-scoped to the 5 active statuses)
  const top=data.filter(o=>o.name!=='(unassigned)')
    .sort((a,b)=>(b.reqs+b.live)-(a.reqs+a.live)).slice(0,15);
  const ds=[{label:'Reqs',data:top.map(o=>o.reqs),backgroundColor:REC_COL.Reqs,stack:'s',borderRadius:2,datalabels:DL_STACK}];
  REC_STATUSES.forEach(s=>ds.push({label:REC_STLABEL[s],data:top.map(o=>o.byStatus[s]||0),
    backgroundColor:REC_COL[s],stack:'s',borderRadius:2,datalabels:DL_STACK}));
  mk('cRecruiter',{type:'bar',data:{labels:top.map(o=>o.name),datasets:ds},
    options:{maintainAspectRatio:false,indexAxis:'y',
      plugins:{legend:{display:true,labels:{boxWidth:10,boxHeight:10,padding:12,font:{size:11}}},
        tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${c.raw.toLocaleString()}`,
          footer:items=>{const o=top[items[0].dataIndex];return `Total: ${o.reqs} reqs · ${o.live} live applicants`;}}}},
      layout:{padding:{right:16}},
      scales:{x:{...AX(),beginAtZero:true,stacked:true},
        y:{...AX(),stacked:true,ticks:{color:CSS('--muted2'),autoSkip:false,font:{size:11}}}}}});
}
function computeOnHold(rows){
  const m={};
  rows.forEach(r=>{const oh=r.tjsOnHold;                     // days spent in ON HOLD (job-level, repeated per row)
    if(oh==null||oh<=0)return;
    const id=r.jobId||r.ref; if(!id)return;
    if(!m[id])m[id]={title:r.title||'(untitled)',ref:r.ref,onHold:+oh,live:0,apps:0};
    m[id].apps++; if(!r.hired&&!r.preReject)m[id].live++;});
  return Object.values(m).sort((a,b)=>b.onHold-a.onHold);   // longest first
}
function renderOnHold(rows){
  const arr=computeOnHold(rows).slice(0,15);                // top 15, longest at top
  const labels=arr.map(o=>o.title.length>38?o.title.slice(0,37)+'…':o.title);
  const DL={display:true,color:'#fff',font:{size:10,weight:700},formatter:v=>v>0?Math.round(v):''};
  mk('cOnHold',{type:'bar',data:{labels,datasets:[
    {label:'Days on hold',data:arr.map(o=>Math.round(o.onHold)),backgroundColor:CSS('--signal'),stack:'s',borderRadius:2,datalabels:DL},
    {label:'Live applicants',data:arr.map(o=>o.live),backgroundColor:CSS('--steel2'),stack:'s',borderRadius:2,datalabels:DL}]},
    options:{maintainAspectRatio:false,indexAxis:'y',
      plugins:{legend:{display:true,labels:{boxWidth:10,boxHeight:10,padding:12,font:{size:11}}},
        tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${c.raw.toLocaleString()}`,
          footer:items=>{const o=arr[items[0].dataIndex];return `${o.ref||''} · ${o.apps} applicants total`;}}}},
      layout:{padding:{right:16}},
      scales:{x:{...AX(),beginAtZero:true,stacked:true},
        y:{...AX(),stacked:true,ticks:{color:CSS('--muted2'),autoSkip:false,font:{size:11}}}}}});
}
function renderOffersNotAccepted(rows){
  const t=document.getElementById('offTable'); if(!t)return;
  const offers=rows.filter(r=>r.dOffer);
  const accepted=offers.filter(r=>r.hired).length;
  const notAcc=offers.filter(r=>!r.hired);
  const sub=document.getElementById('offNotSub');
  if(sub)sub.textContent=`${offers.length.toLocaleString()} OFFERS EXTENDED · ${accepted} ACCEPTED · ${notAcc.length} NOT ACCEPTED · ${offers.length?(accepted/offers.length*100).toFixed(0):0}% ACCEPTANCE · RESPECTS FILTERS`;
  const fmtDay=d=>d?d.toISOString().slice(0,10):'—';
  const stage=r=>r.preReject?r.preReject:'(offer still open)';
  const isOfferExit=r=>String(r.preReject||'').toUpperCase().startsWith('OFFER');
  // for an offer-stage decline the decline reason lives in the Withdrawal reason field
  const wreason=r=>isOfferExit(r)?(r.withdrawReason||'⚠ not recorded'):(r.withdrawReason||'—');
  const arr=notAcc.slice().sort((a,b)=>(b.dOffer||0)-(a.dOffer||0));
  OFF_EXPORT=arr.map(r=>({'Job Title':r.title||'','Job Ref':r.ref||'','Country':r.country||'','Stäubli unit':r.unit||'',
    'Contract type':r.contract||'','Source':r.source||'','Exit stage':stage(r),
    'Withdrawal reason':isOfferExit(r)?(r.withdrawReason||'(not recorded)'):(r.withdrawReason||''),
    'Rejection reason':r.rejectReason||'','Offer date':fmtDay(r.dOffer)}));
  t.innerHTML=`<thead><tr><th>Job</th><th>Job Ref</th><th>Country</th><th>Unit</th><th>Source</th><th>Exit stage</th><th>Withdrawal reason</th><th class="num">Offer date</th></tr></thead>
    <tbody>${arr.length?arr.map(r=>{const wr=wreason(r);const miss=wr.startsWith('⚠');return `<tr>
      <td class="ttl" title="${(r.title||'').replace(/"/g,'')}">${r.title||'—'}</td>
      <td style="font-variant-numeric:tabular-nums">${r.ref||'—'}</td>
      <td>${r.country||'—'}</td><td style="color:var(--muted)">${r.unit||'—'}</td>
      <td>${r.source||'—'}</td><td><span class="pill">${stage(r)}</span></td>
      <td${miss?' style="color:var(--signal);font-weight:600"':''}>${wr}</td>
      <td class="num">${fmtDay(r.dOffer)}</td></tr>`;}).join(''):`<tr><td colspan="8" style="color:var(--muted2);padding:16px">No unaccepted offers in this selection.</td></tr>`}</tbody>`;
}
function renderDrillChip(){
  const el=document.getElementById('drillChip'); if(!el)return;
  if(!DRILL){el.classList.remove('show');el.innerHTML='';return;}
  el.classList.add('show');
  el.innerHTML=`<span class="dc-tag">Showing jobs where <b>${DRILL.label}</b><span class="dc-x" id="dcX">✕</span></span>`;
  const x=document.getElementById('dcX'); if(x)x.onclick=clearDrill;
}
function setDrill(label,pred,jobPred){DRILL={label,pred,jobPred};renderTable(LASTROWS);document.getElementById('jobTable').scrollIntoView({behavior:'smooth',block:'nearest'});}
function clearDrill(){DRILL=null;renderTable(LASTROWS);}

/* ---------- filters UI ---------- */
function buildDateRange(host){
  const created=Object.values(JOBATTR).map(j=>j.created).filter(Boolean).sort((a,b)=>a-b);
  const minD=created[0], maxD=created[created.length-1];
  const wrap=document.createElement('div');wrap.className='daterange';
  wrap.innerHTML=`<label>Job Creation Date — period</label>
    <div class="dr-row">
      <input type="date" class="dr-in" id="drFrom" value="${isoDay(DATE.from)}" min="${isoDay(minD)}" max="${isoDay(maxD)}">
      <span class="to">→</span>
      <input type="date" class="dr-in" id="drTo" value="${isoDay(DATE.to)}" min="${isoDay(minD)}" max="${isoDay(maxD)}">
    </div>
    <div class="qchips" id="qchips"></div>`;
  host.appendChild(wrap);
  const from=wrap.querySelector('#drFrom'), to=wrap.querySelector('#drTo');
  from.onchange=()=>{DATE.from=parseDMY(from.value);syncChips();refresh();};
  to.onchange=()=>{DATE.to=parseDMY(to.value);syncChips();refresh();};
  // quick-picks: whole years + every quarter present in the data
  const years=[...new Set(created.map(d=>d.getFullYear()))].sort();
  const Q=[[0,2,'Q1'],[3,5,'Q2'],[6,8,'Q3'],[9,11,'Q4']];
  const chips=[{label:'All time',from:null,to:null}];
  years.forEach(y=>{const s=new Date(y,0,1),e=new Date(y,11,31);
    if(e<minD||s>maxD)return; chips.push({label:`${y}`,from:s,to:e});});
  years.forEach(y=>Q.forEach(([m0,m1,ql])=>{
    const s=new Date(y,m0,1), e=new Date(y,m1+1,0);
    if(e<minD||s>maxD)return; // skip quarters with no data
    chips.push({label:`${ql} ${String(y).slice(2)}`,from:s,to:e});
  }));
  const cont=wrap.querySelector('#qchips');
  cont.innerHTML=chips.map((c,i)=>`<span class="qchip" data-i="${i}">${c.label}</span>`).join('');
  cont.querySelectorAll('.qchip').forEach(el=>el.onclick=()=>{
    const c=chips[+el.dataset.i];DATE.from=c.from;DATE.to=c.to;
    from.value=isoDay(c.from);to.value=isoDay(c.to);syncChips();refresh();});
  window.__chips=chips;
  syncChips();
}
function syncChips(){
  const chips=window.__chips||[];
  document.querySelectorAll('#qchips .qchip').forEach(el=>{
    const c=chips[+el.dataset.i];
    const on=isoDay(c.from)===isoDay(DATE.from)&&isoDay(c.to)===isoDay(DATE.to);
    el.classList.toggle('on',on);});
}
function buildJobRef(host){
  const refs=uniq(Object.values(JOBATTR).map(j=>j.ref));
  const wrap=document.createElement('div');wrap.className='ms jobref';
  wrap.innerHTML=`<label>Job Ref — single/multi-job check</label>
    <input class="jr-in" id="jobRefInput" list="jobRefList" placeholder="Type or pick a ref…" autocomplete="off">
    <datalist id="jobRefList">${refs.map(r=>`<option value="${String(r).replace(/"/g,'&quot;')}">`).join('')}</datalist>
    <div class="jr-chips" id="jrChips"></div>`;
  host.appendChild(wrap);
  const inp=wrap.querySelector('#jobRefInput'), chips=wrap.querySelector('#jrChips');
  const refSet=new Set(refs.map(String));
  const drawChips=()=>{
    chips.innerHTML=[...JOBREFS].map(r=>`<span class="jr-chip">${r}<b data-r="${String(r).replace(/"/g,'&quot;')}">✕</b></span>`).join('')
      +(JOBREFS.size?`<span class="jr-clear" id="jrClear">clear all</span>`:'');
    chips.querySelectorAll('.jr-chip b').forEach(x=>x.onclick=()=>{JOBREFS.delete(x.dataset.r);drawChips();refresh();});
    const cl=chips.querySelector('#jrClear'); if(cl)cl.onclick=()=>{JOBREFS.clear();drawChips();refresh();};
    inp.classList.toggle('on',JOBREFS.size>0);
  };
  const add=()=>{const v=inp.value.trim();if(v&&refSet.has(v)&&!JOBREFS.has(v)){JOBREFS.add(v);inp.value='';drawChips();refresh();}
    else if(v&&!refSet.has(v)){inp.value='';}};
  inp.onchange=add;
  inp.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();add();}};
  drawChips();
}
function buildFilters(){
  const host=document.getElementById('filters');host.innerHTML='';
  buildDateRange(host);
  buildJobRef(host);
  FILTERDEFS.forEach(([key,label])=>{
    const jobsArr=Object.values(JOBATTR);
    const opts=MULTIVAL[key]?uniq(jobsArr.flatMap(j=>j.recruiterList||[])):uniq(jobsArr.map(j=>j[key]));
    const wrap=document.createElement('div');wrap.className='ms';
    wrap.innerHTML=`<label>${label}</label>
      <div class="ms-btn" data-k="${key}"><span class="lbl">All</span><span class="cnt">0</span><span class="car">▾</span></div>
      <div class="ms-pop">${opts.map(o=>`<label class="ms-opt"><input type="checkbox" value="${String(o).replace(/"/g,'&quot;')}">${o}</label>`).join('')||'<div style="padding:8px;color:var(--muted2);font-size:12px">no values</div>'}</div>`;
    host.appendChild(wrap);
    const btn=wrap.querySelector('.ms-btn'),pop=wrap.querySelector('.ms-pop');
    btn.onclick=e=>{e.stopPropagation();document.querySelectorAll('.ms-pop').forEach(p=>{if(p!==pop)p.classList.remove('open');});pop.classList.toggle('open');};
    pop.querySelectorAll('input').forEach(cb=>cb.onchange=()=>{
      cb.checked?SEL[key].add(cb.value):SEL[key].delete(cb.value);
      const n=SEL[key].size;btn.classList.toggle('active',n>0);
      btn.querySelector('.cnt').textContent=n;
      btn.querySelector('.lbl').textContent=n===0?'All':n===1?[...SEL[key]][0]:`${n} selected`;
      refresh();});
  });
  const rb=document.createElement('button');rb.className='reset';rb.textContent='reset all';
  rb.onclick=()=>{FILTERDEFS.forEach(([k])=>SEL[k].clear());DATE.from=DATE.to=null;JOBREFS.clear();buildFilters();refresh();};
  host.appendChild(rb);
}
document.addEventListener('click',()=>document.querySelectorAll('.ms-pop').forEach(p=>p.classList.remove('open')));

/* ---------- orchestration ---------- */
function refGuardMsg(g){
  const parts=[];
  if(g.outRange&&g.outRange.length)parts.push(`${g.outRange.length===1?'Job':'Jobs'} <b>${g.outRange.join(', ')}</b> ${g.outRange.length===1?'was':'were'} created outside your selected period (${isoDay(DATE.from)||'…'} → ${isoDay(DATE.to)||'…'})`);
  if(g.notFound&&g.notFound.length)parts.push(`${g.notFound.length===1?'Ref':'Refs'} <b>${g.notFound.join(', ')}</b> not found in the loaded data`);
  return parts.join(' · ');
}
function refresh(){
  const g=refGuard(), banner=document.getElementById('guard'), body=document.getElementById('reportBody');
  if(g&&g.type==='block'){
    banner.className='guardbar show';
    banner.innerHTML=`${refGuardMsg(g)}. Nothing to display — widen or clear the Job Creation Date range, or adjust the Job Ref selection.`;
    body.classList.add('off');
    return;
  }
  body.classList.remove('off');
  if(g&&g.type==='warn'){
    banner.className='guardbar warn show';
    banner.innerHTML=`Showing ${[...JOBREFS].length-(g.outRange.length+g.notFound.length)} of ${JOBREFS.size} selected jobs. Excluded: ${refGuardMsg(g)}.`;
  }else{
    banner.className='guardbar'; banner.innerHTML='';
  }
  const rows=fApps(); LASTROWS=rows; DRILL=null;
  renderKPIs(kpis(rows)); renderInsights(rows); renderCharts(rows); renderHeat(rows); renderHeat2(rows); renderRecruiters(rows); renderOnHold(rows); renderOffersNotAccepted(rows); renderTable(rows);
  ensurePngButtons(); ensureHeatButtons();
}

/* ---------- automated insights (rule-based, recomputed live) ---------- */
function renderInsights(rows){
  const host=document.getElementById('insights');
  const out=[];
  const hires=rows.filter(r=>r.hired);
  if(rows.length<20){host.innerHTML=`<div class="none">Not enough data in this selection to surface reliable insights — widen the filters or date range.</div>`;return;}
  const pct=(a,b)=>b?(a/b*100):0;
  // single-job reconciliation note
  if(JOBREFS.size){const jobs=new Set(rows.map(r=>r.jobId)).size;
    out.push(`Showing <b>${JOBREFS.size}</b> selected job${JOBREFS.size===1?'':'s'} (${jobs} in view): <b>${rows.length.toLocaleString()}</b> applications, <b>${hires.length}</b> hire${hires.length===1?'':'s'}. Cross-check these against SmartRecruiters.`);}
  // volume + conversion
  out.push(`<span><b>${rows.length.toLocaleString()}</b> applications across <b>${new Set(rows.map(r=>r.jobId)).size}</b> jobs, producing <b>${hires.length}</b> hires (${pct(hires.length,rows.length).toFixed(2)}% overall).</span>`);
  // top source + best-converting source type
  const srcCount=counts(rows,'source'); if(srcCount.labels.length){
    out.push(`Most applications arrive via <b>${srcCount.labels[0]}</b> (${pct(srcCount.data[0],rows.length).toFixed(0)}% of volume).`);}
  const byType={};rows.forEach(r=>{const t=r.sourceType||'(none)';if(!byType[t])byType[t]={a:0,h:0};byType[t].a++;if(r.hired)byType[t].h++;});
  const conv=Object.entries(byType).filter(([,v])=>v.a>=30&&v.h>0).map(([t,v])=>[t,pct(v.h,v.a)]).sort((a,b)=>b[1]-a[1]);
  if(conv.length){out.push(`Best-converting channel type is <b>${conv[0][0]}</b> at <b>${conv[0][1].toFixed(2)}%</b> application-to-hire${conv.length>1?` (vs ${conv[conv.length-1][1].toFixed(2)}% for ${conv[conv.length-1][0]})`:''}.`);}
  // top country
  const cCount=counts(rows,'country'); if(cCount.labels.length){
    out.push(`<b>${cCount.labels[0]}</b> is the largest market with ${pct(cCount.data[0],rows.length).toFixed(0)}% of applications.`);}
  // bottleneck stage
  const stAvg=STATES.map(([k,l])=>[l,mean(rows.map(r=>r[k]).filter(x=>x!=null))]).filter(x=>x[1]!=null);
  if(stAvg.length){const slow=stAvg.slice().sort((a,b)=>b[1]-a[1])[0];
    out.push(`Candidates spend longest in the <b>${slow[0]}</b> stage — on average <b>${slow[1].toFixed(1)} days</b>.`);}
  // time to hire vs fill
  const tth=mean(hires.map(r=>r.applied?(r.hired-r.applied)/86400000:null).filter(d=>d!=null&&d>=0));
  const ttf=mean(hires.map(r=>r.created?(r.hired-r.created)/86400000:null).filter(d=>d!=null&&d>=0));
  if(tth!=null&&ttf!=null){out.push(`Time to fill (<b>${ttf.toFixed(0)}d</b>) runs about <b>${(ttf-tth).toFixed(0)} days</b> longer than time to hire (${tth.toFixed(0)}d) — the gap is time a posting waits before the winning candidate applies.`);}
  // busiest month
  const mc={};rows.forEach(r=>{if(r.applied){const k=r.applied.toISOString().slice(0,7);mc[k]=(mc[k]||0)+1;}});
  const busy=Object.entries(mc).sort((a,b)=>b[1]-a[1])[0];
  if(busy){const[y,m]=busy[0].split('-');out.push(`Peak intake month is <b>${new Date(y,m-1,1).toLocaleDateString('en',{month:'long',year:'numeric'})}</b> with ${busy[1].toLocaleString()} applications.`);}
  // positions
  if(POS.length){const p=fPos();const f=p.filter(x=>['FILLED','HIRED'].includes(x.posStatus)).length;
    out.push(`<b>${f}</b> of <b>${p.length}</b> positions are filled or hired (${pct(f,p.length).toFixed(0)}%) in this selection.`);}
  // offer acceptance (date-based)
  const offers=rows.filter(r=>r.dOffer);
  if(offers.length){const acc=offers.filter(r=>r.hired).length;
    out.push(`Offer acceptance is <b>${pct(acc,offers.length).toFixed(0)}%</b> — <b>${acc}</b> of <b>${offers.length}</b> extended offers were accepted.`);}
  // steepest funnel drop-off (date-based stages)
  const has={New:r=>!!r.applied,Sub:r=>!!r.dSubmit,Int:r=>!!r.dInterview,Off:r=>!!r.dOffer,Hire:r=>!!r.hired};
  const nApp=rows.length,nSub=rows.filter(has.Sub).length,nInt=rows.filter(has.Int).length,nOff=rows.filter(has.Off).length,nHire=rows.filter(has.Hire).length;
  const both=(a,b)=>rows.filter(r=>a(r)&&b(r)).length;
  const steps=[['New → Submitted to manager',nApp?nSub/nApp:1],['Submitted → Interview',nSub?both(has.Sub,has.Int)/nSub:1],
    ['Interview → Offer',nInt?both(has.Int,has.Off)/nInt:1],['Offer → Hire',nOff?both(has.Off,has.Hire)/nOff:1]];
  const valid=steps.filter(s=>s[1]>0);
  if(valid.length){const worst=valid.slice().sort((a,b)=>a[1]-b[1])[0];
    out.push(`The steepest pipeline drop is at <b>${worst[0]}</b> (${(worst[1]*100).toFixed(1)}% advance) — the biggest lever for improving throughput.`);}
  // source of hire (channel producing most hires)
  const hs={};hires.forEach(r=>{const s=r.source||'(unknown)';hs[s]=(hs[s]||0)+1;});
  const hsE=Object.entries(hs).sort((a,b)=>b[1]-a[1]);
  if(hsE.length&&hires.length){out.push(`Most hires came through <b>${hsE[0][0]}</b> (${hsE[0][1]} of ${hires.length} hires).`);}
  // interviews per hire
  if(hires.length){const iph=mean(hires.map(r=>SUBINT.reduce((s,k)=>s+(r[k]!=null?1:0),0)));
    if(iph!=null)out.push(`Hires went through <b>${iph.toFixed(2)}</b> interview round${iph===1?'':'s'} on average (populated Video / On-Site / On-Site 2 / Final stages).`);}
  // busiest recruiter by applications
  const rc={};rows.forEach(r=>(r.recruiterList||[]).forEach(x=>{rc[x]=(rc[x]||0)+1;}));
  const rcE=Object.entries(rc).sort((a,b)=>b[1]-a[1]);
  if(rcE.length){out.push(`<b>${rcE[0][0]}</b> is handling the most applications (${rcE[0][1].toLocaleString()}) in this selection.`);}
  // month-over-month trend
  const mk2={};rows.forEach(r=>{if(r.applied){const k=r.applied.toISOString().slice(0,7);mk2[k]=(mk2[k]||0)+1;}});
  const mks=Object.keys(mk2).sort();
  if(mks.length>=2){const a=mk2[mks[mks.length-2]],b=mk2[mks[mks.length-1]];const dir=b>=a?'rose':'fell';
    const chg=a?Math.abs((b-a)/a*100):0;const lbl=k=>{const[y,m]=k.split('-');return new Date(y,m-1,1).toLocaleDateString('en',{month:'short',year:'2-digit'});};
    out.push(`Applications ${dir} <b>${chg.toFixed(0)}%</b> from ${lbl(mks[mks.length-2])} to ${lbl(mks[mks.length-1])} (${a.toLocaleString()} → ${b.toLocaleString()}).`);}
  // jobs with no applications (needs jobs export / job index)
  const appJobs=new Set(rows.map(r=>r.jobId));
  const noApp=Object.values(JOBATTR).filter(j=>passJobFilters(j)&&!appJobs.has(j.jobId));
  if(noApp.length){const cr=noApp.filter(j=>String(j.jobStatus).toUpperCase()==='CREATED').length;
    out.push(`<b>${noApp.length}</b> job${noApp.length===1?'':'s'} in this selection have no applications yet${cr?` (${cr} in Created)`:''}.`);}
  // data-hygiene flag: offer-stage declines with no withdrawal reason recorded
  const offerDeclines=rows.filter(r=>String(r.preReject||'').toUpperCase().startsWith('OFFER')&&!r.hired);
  if(offerDeclines.length){const noReason=offerDeclines.filter(r=>!r.withdrawReason).length;
    if(noReason>0)out.push(`⚠ <b>${noReason}</b> of ${offerDeclines.length} declined offer${offerDeclines.length===1?'':'s'} ${noReason===1?'has':'have'} no withdrawal reason recorded — recruiters should log a withdrawal reason when an offer is declined.`);}
  host.innerHTML=out.map(t=>`<div class="ins">${t}</div>`).join('');
}

/* ---------- per-chart PNG download + expand-to-fullscreen ---------- */
const CHART_LABELS={cTime:'applications_over_time',cStatus:'job_status',
  cSource:'applications_by_source',cHireSrc:'source_of_hire',
  cAppBreak:'applications_breakdown',cPositions:'positions_filled_vs_open',
  cRecruiter:'recruiter_capacity',cOnHold:'days_on_hold_by_job'};
function downloadPNG(id,name){
  const ch=charts[id];if(!ch)return;
  const src=ch.canvas, tmp=document.createElement('canvas');
  tmp.width=src.width;tmp.height=src.height;
  const cx=tmp.getContext('2d');cx.fillStyle='#ffffff';cx.fillRect(0,0,tmp.width,tmp.height);cx.drawImage(src,0,0);
  const a=document.createElement('a');a.href=tmp.toDataURL('image/png');a.download=(name||id)+'.png';a.click();
}
// full-data builders for the expandable (top-N) charts — no top limit, every category with its number
const EXPAND={
  cSource:{title:()=>'Applications by '+SRCDIM_LABEL[SRCDIM].toLowerCase()+' — all',build:rows=>{const c=counts(rows,SRCDIM);
    return{labels:c.labels,datasets:[{data:c.data,backgroundColor:CSS('--steel3'),borderRadius:2,datalabels:DL_BAR_H()}]};}},
  cAppBreak:{title:()=>'Applications by '+APPDIM_LABEL[APPDIM].toLowerCase()+' — all',build:rows=>{
    const ce=applicationsAgg(APPDIM);
    return{labels:ce.map(x=>x[0]),datasets:[
      {label:'Applications',data:ce.map(x=>x[1].a),backgroundColor:CSS('--steel3'),borderRadius:2,datalabels:DL_BAR_H()},
      {label:'Hires',data:ce.map(x=>x[1].h),backgroundColor:CSS('--signal'),borderRadius:2,
        datalabels:{display:true,anchor:'end',align:'right',clamp:true,color:CSS('--signal'),textStrokeColor:'rgba(255,255,255,.9)',textStrokeWidth:3,font:{size:10,weight:700},formatter:v=>v>0?v:''}}]};}},
  cPositions:{title:()=>'Positions filled vs open by '+POSDIM_META[POSDIM].label.toLowerCase()+' — all',build:rows=>{
    const pe=positionsAgg(POSDIM);
    return{stacked:true,labels:pe.map(x=>x[0]),datasets:[
      {label:'Filled / Hired',data:pe.map(x=>x[1].f),backgroundColor:CSS('--good'),borderRadius:2,stack:'s',datalabels:DL_ONFILL},
      {label:'Open',data:pe.map(x=>x[1].o),backgroundColor:CSS('--amber'),borderRadius:2,stack:'s',datalabels:DL_ONFILL}]};}},
  cTime:{title:'Applications over time — all months',build:rows=>{
    const mk2=d=>new Date(d).toISOString().slice(0,7);
    const aW={},hW={};rows.forEach(r=>{if(r.applied){const k=mk2(r.applied);aW[k]=(aW[k]||0)+1;}if(r.hired){const k=mk2(r.hired);hW[k]=(hW[k]||0)+1;}});
    const ks=[...new Set([...Object.keys(aW),...Object.keys(hW)])].sort();
    return{stacked:true,vertical:true,labels:ks.map(monLbl),datasets:[
      {label:'Applications',data:ks.map(k=>aW[k]||0),backgroundColor:CSS('--steel3'),borderRadius:2,stack:'s',datalabels:DL_STACK},
      {label:'Hires',data:ks.map(k=>hW[k]||0),backgroundColor:CSS('--signal'),borderRadius:2,stack:'s',datalabels:DL_STACK}]};}},
  cStatus:{title:'Job status — jobs & applications',build:rows=>{
    const stPipe=['CREATED','SOURCING','INTERVIEW','OFFER','FILLED'];
    const fj=filteredJobs();
    const extra=uniq([...rows.map(r=>r.jobStatus),...fj.map(j=>j.jobStatus)]).filter(s=>s&&!stPipe.includes(s));
    const st=[...stPipe,...extra];
    const jc={};fj.forEach(j=>{if(j.jobStatus)jc[j.jobStatus]=(jc[j.jobStatus]||0)+1;});
    return{stacked:true,labels:st,datasets:[
      {label:'Jobs (by Job ID)',data:st.map(s=>jc[s]||0),backgroundColor:CSS('--signal'),borderRadius:2,stack:'s',datalabels:DL_ONFILL},
      {label:'Applications',data:st.map(s=>rows.filter(r=>r.jobStatus===s).length),backgroundColor:CSS('--steel3'),borderRadius:2,stack:'s',datalabels:DL_ONFILL}]};}},
  cHireSrc:{title:()=>'Source of hire by '+SRCDIM_LABEL[HIRESRCDIM].toLowerCase()+' — all',build:rows=>{
    const c=counts(rows.filter(r=>r.hired),HIRESRCDIM);
    return{labels:c.labels,datasets:[{label:'Hires',data:c.data,backgroundColor:CSS('--signal'),borderRadius:2,datalabels:DL_BAR_H()}]};}},
  cRecruiter:{title:'Recruiter capacity — reqs + live applicants by status (all recruiters)',build:rows=>{
    const data=computeRecruiters(rows).filter(o=>o.name!=='(unassigned)')
      .sort((a,b)=>(b.reqs+b.live)-(a.reqs+a.live));
    const ds=[{label:'Reqs',data:data.map(o=>o.reqs),backgroundColor:REC_COL.Reqs,stack:'s',borderRadius:2,datalabels:DL_STACK}];
    REC_STATUSES.forEach(s=>ds.push({label:REC_STLABEL[s],data:data.map(o=>o.byStatus[s]||0),
      backgroundColor:REC_COL[s],stack:'s',borderRadius:2,datalabels:DL_STACK}));
    return{stacked:true,labels:data.map(o=>o.name),datasets:ds};}},
  cOnHold:{title:'Days on hold by job title (all)',build:rows=>{
    const arr=computeOnHold(rows);
    return{stacked:true,labels:arr.map(o=>o.title),datasets:[
      {label:'Days on hold',data:arr.map(o=>Math.round(o.onHold)),backgroundColor:CSS('--signal'),stack:'s',borderRadius:2,datalabels:DL_STACK},
      {label:'Live applicants',data:arr.map(o=>o.live),backgroundColor:CSS('--steel2'),stack:'s',borderRadius:2,datalabels:DL_STACK}]};}}
};
let modalChart=null, modalId=null;
function openExpand(id){
  const cfg=EXPAND[id];if(!cfg)return;
  const {labels,datasets,stacked,vertical}=cfg.build(LASTROWS);
  modalKind='chart'; modalId=id;
  document.getElementById('modalHtmlWrap').style.display='none';
  document.getElementById('modalCanvasWrap').style.display='block';
  const title=typeof cfg.title==='function'?cfg.title():cfg.title;
  document.getElementById('modalTitle').textContent=title+`  ·  ${labels.length} rows`;
  const ov=document.getElementById('modalOv');ov.classList.add('show');
  const cv=document.getElementById('modalCanvas');
  const wrap=document.getElementById('modalCanvasWrap');
  if(vertical){
    wrap.style.height='480px';                              // keep the panel's vertical view so labels aren't clipped
  }else{
    const perRow=datasets.length>1?34:26;                   // taller rows for grouped/stacked
    wrap.style.height=Math.max(340,labels.length*perRow+70)+'px';
  }
  if(modalChart)modalChart.destroy();
  modalChart=new Chart(cv,{type:'bar',data:{labels,datasets},options:{
    maintainAspectRatio:false,indexAxis:vertical?'x':'y',
    plugins:{legend:{display:datasets.length>1,labels:{boxWidth:10,boxHeight:10,padding:14}},
      tooltip:{enabled:true}},
    layout:{padding:vertical?{top:24,right:8,bottom:4,left:4}:{right:64,top:4,bottom:4}},
    scales:vertical
      ?{x:{...AX(),stacked:!!stacked,ticks:{color:CSS('--muted2'),autoSkip:false,maxRotation:60,minRotation:0,font:{size:10}}},
         y:{...AX(),beginAtZero:true,stacked:!!stacked}}
      :{x:{...AX(),beginAtZero:true,stacked:!!stacked},
         y:{...AX(),stacked:!!stacked,ticks:{color:CSS('--muted2'),autoSkip:false,font:{size:11}}}}}});
}
function closeExpand(){const ov=document.getElementById('modalOv');ov.classList.remove('show');
  if(modalChart){modalChart.destroy();modalChart=null;}
  document.getElementById('modalHtmlWrap').style.display='none';
  document.getElementById('modalCanvasWrap').style.display='block';}
function chartXlsx(id){
  const cfg=EXPAND[id]; if(!cfg)return;
  const {labels,datasets}=cfg.build(LASTROWS);
  const cat=(id==='cTime')?'Month':(id==='cStatus')?'Job status':
    (id==='cSource')?SRCDIM_LABEL[SRCDIM].replace(/\b\w/g,c=>c.toUpperCase()):
    (id==='cHireSrc')?SRCDIM_LABEL[HIRESRCDIM].replace(/\b\w/g,c=>c.toUpperCase()):
    (id==='cAppBreak')?APPDIM_LABEL[APPDIM].replace(/\b\w/g,c=>c.toUpperCase()):
    (id==='cPositions')?POSDIM_META[POSDIM].label.replace(/\b\w/g,c=>c.toUpperCase()):
    (id==='cRecruiter')?'Recruiter':(id==='cOnHold')?'Job title':'Category';
  const rows=labels.map((lab,i)=>{const o={[cat]:lab};
    datasets.forEach(ds=>{o[ds.label||'Value']=ds.data[i];});return o;});
  const ws=XLSX.utils.json_to_sheet(rows);
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'Data');
  XLSX.writeFile(wb,`${CHART_LABELS[id]||id}_${new Date().toISOString().slice(0,10)}.xlsx`);
}
function ensurePngButtons(){
  Object.keys(CHART_LABELS).forEach(id=>{
    const cv=document.getElementById(id);if(!cv)return;
    const panel=cv.closest('.panel');if(!panel||panel.querySelector('.chart-tools'))return;
    const tools=document.createElement('div');tools.className='chart-tools';
    if(EXPAND[id]){const e=document.createElement('button');e.className='ctbtn';e.textContent='⤢ Expand';
      e.title='View full screen with every bar';e.onclick=()=>openExpand(id);tools.appendChild(e);}
    if(EXPAND[id]){const x=document.createElement('button');x.className='ctbtn';x.textContent='⬇ Excel';
      x.title='Download this chart\u2019s data (current filters) as Excel';x.onclick=()=>chartXlsx(id);tools.appendChild(x);}
    const b=document.createElement('button');b.className='ctbtn';b.textContent='↓ PNG';
    b.title='Download this chart as a PNG image';b.onclick=()=>downloadPNG(id,CHART_LABELS[id]);tools.appendChild(b);
    panel.appendChild(tools);
  });
}
function rebuildJobAttr(){
  // unified per-job index: rich attributes from applications, overlaid with the (authoritative) jobs export.
  // When File C is present this also brings in jobs that have NO applications (e.g. Created).
  const idx={};
  APP.forEach(r=>{if(!idx[r.jobId])idx[r.jobId]={jobId:r.jobId,ref:r.ref,title:r.title,country:r.country,
    unit:r.unit,division:r.division,family:r.family,contract:r.contract,jobStatus:r.jobStatus,origin:r.origin,
    recruiter:r.recruiter,recruiterList:r.recruiterList||[],created:r.created};});
  JOBS.forEach(j=>{const e=idx[j.jobId]||(idx[j.jobId]={jobId:j.jobId,recruiterList:[]});
    const set=(k,v)=>{if(v!==undefined&&v!==null&&v!=='')e[k]=v;};
    set('ref',j.ref);set('title',j.title);set('country',j.country);set('unit',j.unit);
    set('division',j.division);set('family',j.family);set('contract',j.contract);set('created',j.created);
    if(j.jobStatus)e.jobStatus=String(j.jobStatus).toUpperCase();
    if(j.recruiterList&&j.recruiterList.length){e.recruiterList=j.recruiterList;e.recruiter=j.recruiter;}});
  JOBATTR=idx;
}
// job-level filter (mirrors passFilters but operates on a job's attributes, so no-application jobs can pass)
function passJobFilters(j){
  if(JOBREFS.size&&!JOBREFS.has(j.ref))return false;
  if(!inRange(j.created))return false;
  for(const [k] of FILTERDEFS){
    if(!SEL[k].size)continue;
    if(MULTIVAL[k]){if(!(j.recruiterList||[]).some(x=>SEL[k].has(x)))return false;}
    else if(!SEL[k].has(j[k]||''))return false;
  }
  return true;
}
function filteredJobs(){return Object.values(JOBATTR).filter(passJobFilters);}
function showJoin(){
  const jb=document.getElementById('joinbar');
  if(!APP.length){jb.classList.remove('show');return;}
  const appJobs=new Set(APP.map(r=>r.jobId));
  let msg=`<b>✓</b> Applications: ${APP.length.toLocaleString()} rows · ${appJobs.size} jobs.`;
  if(POS.length){
    const posJobs=new Set(POS.map(p=>p.jobId));
    const matched=[...posJobs].filter(j=>appJobs.has(j)).length;
    const orphanPos=[...posJobs].filter(j=>!appJobs.has(j)).length;
    const noPos=[...appJobs].filter(j=>!posJobs.has(j)).length;
    msg+=` &nbsp;<b>✓</b> Positions: ${POS.length} rows · ${posJobs.size} jobs — <b>${matched} matched on Job ID</b>`;
    if(orphanPos)msg+=` · <span class="miss">${orphanPos} positions with no applications</span>`;
    if(noPos)msg+=` · <span class="miss">${noPos} application-jobs with no position row</span>`;
  }else msg+=` &nbsp;Positions file not loaded — position metrics will show once File B is added.`;
  if(JOBS.length){
    const jm={}; JOBS.forEach(j=>{if(j.jobId)jm[j.jobId]=j.jobStatus;});
    const jobIds=Object.keys(jm);
    const matched=jobIds.filter(j=>appJobs.has(j)).length;
    const noApp=jobIds.filter(j=>!appJobs.has(j));
    const created=noApp.filter(j=>String(jm[j]).toUpperCase()==='CREATED').length;
    const full=JOBS.some(j=>j.country||j.unit||j.division);
    msg+=` &nbsp;<b>✓</b> Jobs: ${jobIds.length} jobs — <b>${matched} matched on Job ID</b>`;
    if(noApp.length)msg+=` · ${noApp.length} with no applications${created?` (${created} Created)`:''}`;
    msg+=full?` · <b>full attributes</b> — job-level views cover all jobs`:` · minimal (status only) — add unit/division/country for full job-level filtering`;
  }
  jb.innerHTML=msg;jb.classList.add('show');
}
function maybeRender(){
  if(!APP.length)return;
  rebuildJobAttr();buildFilters();
  document.getElementById('dash').classList.remove('hidden');
  refresh();
  syncStickyTop();
}

/* ---------- row mappers: SmartRecruiters JSON/CSV → internal field names ---------- */
function mapJobRow(row){
    return {
        jobId: row['Job ID'] || '',
        jobStatus: (row['Job Status'] || '').toUpperCase(),
        ref: '', title: '', country: '', unit: '', division: '', family: '', contract: '',
        recruiter: '', recruiterList: [], created: null
    };
}
function mapPosRow(row){
    return { jobId: row['Job ID'], positionId: row['Position ID'], posStatus: row['Position Status'] };
}
function mapAppRow(row){
    return {
        jobId: row['Job ID'] || '',
        ref: row['Job Ref ID'] || '',
        title: row['Job Title'] || '',
        country: row['Job Country/Region'] || '',
        recruiter: row['Recruiters'] || '',
        recruiterList: splitList(row['Recruiters']),
        jobStatus: row['Job Status'] || '',
        unit: row['Staubli unit'] || '',
        created: toDate(row['Default Job Ad Creation Date']),
        applied: toDate(row['Application State: New Date']),
        source: row['Candidate Source'] || '',
        sourceType: row['Candidate Source Type'] || '',
        sourceSub: row['Candidate Source Subtype'] || '',
        preReject: row['Application Status Before Rejection'] || '',
        offer: toDate(row['Latest Offer extended date']),
        dSubmit: toDate(row['Application Status: In-Review/Submitted to Manager Date']),
        dInterview: toDate(row['Application State: Interview Date']),
        dOffer: toDate(row['Application State: Offer Date']),
        hired: toDate(row['Application State: Hired Date']),
        division: row['Division'] || '',
        family: row['Job family'] || '',
        confidential: row['Confidential'] || '',
        contract: row['Contract type'] || '',
        origin: row['Origin'] || '(manually added)',
        rejectReason: row['Application Reason For Rejection'] || '',
        withdrawReason: row['Application Reason For Withdrawal'] || '',
        tLead: numOrNull(row['Time In Application State: Lead']),
        tNew: numOrNull(row['Time In Application State: New']),
        tReview: numOrNull(row['Time In Application State: In-Review']),
        tOffered: numOrNull(row['Time In Application State: Offered']),
        tInterview: numOrNull(row['Time In Application State: Interview']),
        tVideo: numOrNull(row['Time in Application Status: Interview/Video Interview']),
        tOnsite: numOrNull(row['Time in Application Status: Interview/On-Site Interview']),
        tOnsite2: numOrNull(row['Time in Application Status: Interview/On-Site Interview 2']),
        tFinal: numOrNull(row['Time in Application Status: Interview/Final Interview']),
        tjsCreated: numOrNull(row['Time in Job Status: CREATED']),
        tjsSourcing: numOrNull(row['Time in Job Status: SOURCING']),
        tjsInterview: numOrNull(row['Time in Job Status: INTERVIEW']),
        tjsOffer: numOrNull(row['Time in Job Status: OFFER']),
        tjsOnHold: numOrNull(row['Time in Job Status: ON HOLD'])
    };
}

async function fetchReport(kind, token){
    const res = await fetch(`/api/reports?kind=${kind}`, {
        headers: { 'Authorization': `Bearer ${token}` } 
    });
    if (!res.ok) {
        let msg = `Could not load ${kind} report (${res.status})`;
        try { const j = await res.json(); if (j?.error) msg = j.error; } catch {}
        throw new Error(msg);
    }
    const data = await res.json();
    return Array.isArray(data) ? data : (data?.content ?? data?.data ?? data?.rows ?? []);
}

async function loadAllData(token){
    const err = document.getElementById('err');
    err.classList.remove('show');

    const plText = document.querySelector('#pageLoader .pl-text');
    if (plText) plText.textContent = 'Fetching reports from SmartRecruiters…';

    try{
        const [appRows, posRows, jobRows] = await Promise.all([
            fetchReport('applications', token),
            fetchReport('positions', token),
            fetchReport('jobs', token)
        ]);
        if (!appRows.length) throw new Error('No application records returned.');

        APP = appRows.map(mapAppRow);
        POS = posRows.map(mapPosRow);
        JOBS = jobRows.map(mapJobRow);

        markLoaded('app', APP.length);
        markLoaded('pos', POS.length);
        markLoaded('jobs', JOBS.length);
        showJoin();
        maybeRender();
    }catch(ex){
        err.textContent = ex.message || 'Could not load data.';
        err.classList.add('show');
    }
}

function setLoadStatus(kind, count){
    // optional: update a loading indicator per dataset while paginating, e.g.
    const el = document.getElementById(`fileStatus_${kind}`);
    if (el) el.textContent = `Loading… ${count.toLocaleString()} rows so far`;
}
function markLoaded(kind, count){
    const ids = {app:['slotApp','fileApp'], pos:['slotPos','filePos'], jobs:['slotJobs','fileJobs']}[kind];
    const slot = document.getElementById(ids[0]), fileEl = document.getElementById(ids[1]);
    if (slot) slot.classList.add('filled');
    if (fileEl) fileEl.textContent = `✓ ${count.toLocaleString()} rows loaded`;
}

/* ---------- file wiring ---------- */
function markSlot(kind,name,rowCount){
  const ids={app:['slotApp','fileApp','reApp'],pos:['slotPos','filePos','rePos'],jobs:['slotJobs','fileJobs','reJobs']}[kind];
  const slot=document.getElementById(ids[0]),fileEl=document.getElementById(ids[1]),re=document.getElementById(ids[2]);
  slot.classList.add('filled');fileEl.textContent=`✓ ${name} · ${rowCount.toLocaleString()} rows`;re.classList.remove('hidden');
}
function loadFile(kind,file){
  const err=document.getElementById('err');err.classList.remove('show');
  const rd=new FileReader();
  rd.onload=e=>{try{
    const MAP=kind==='app'?APPMAP:(kind==='pos'?POSMAP:JOBMAP);
    const rows=parse(new Uint8Array(e.target.result),MAP,kind);
    if(kind==='app')APP=rows;else if(kind==='pos')POS=rows;else JOBS=rows;
    markSlot(kind,file.name,rows.length);showJoin();maybeRender();
  }catch(ex){err.textContent=ex.message||'Could not read this file.';err.classList.add('show');}};
  rd.onerror=()=>{err.textContent='Could not read this file.';err.classList.add('show');};
  rd.readAsArrayBuffer(file);
}
const inpApp=document.getElementById('inpApp'),inpPos=document.getElementById('inpPos'),inpJobs=document.getElementById('inpJobs');
document.getElementById('slotApp').onclick=()=>inpApp.click();
document.getElementById('slotPos').onclick=()=>inpPos.click();
document.getElementById('slotJobs').onclick=()=>inpJobs.click();
inpApp.onchange=e=>e.target.files[0]&&loadFile('app',e.target.files[0]);
inpPos.onchange=e=>e.target.files[0]&&loadFile('pos',e.target.files[0]);
inpJobs.onchange=e=>e.target.files[0]&&loadFile('jobs',e.target.files[0]);
document.getElementById('reloadAll').onclick=()=>document.getElementById('loaderSec').scrollIntoView({behavior:'smooth'});
['app','pos','jobs'].forEach(kind=>{
  const slot=document.getElementById({app:'slotApp',pos:'slotPos',jobs:'slotJobs'}[kind]);
  ['dragenter','dragover'].forEach(ev=>slot.addEventListener(ev,e=>{e.preventDefault();slot.classList.add('hot');}));
  ['dragleave','drop'].forEach(ev=>slot.addEventListener(ev,e=>{e.preventDefault();slot.classList.remove('hot');}));
  slot.addEventListener('drop',e=>{if(e.dataTransfer.files[0])loadFile(kind,e.dataTransfer.files[0]);});
});
document.body.addEventListener('dragover',e=>e.preventDefault());
document.body.addEventListener('drop',e=>e.preventDefault());

/* positions dimension toggle */
document.querySelectorAll('#posToggle button').forEach(b=>b.onclick=()=>{POSDIM=b.dataset.d;renderPositions();});
/* applications-by dimension toggle */
document.querySelectorAll('#appToggle button').forEach(b=>b.onclick=()=>{APPDIM=b.dataset.d;renderAppBreak();});
/* source dimension toggles */
document.querySelectorAll('#srcToggle button').forEach(b=>b.onclick=()=>{SRCDIM=b.dataset.d;renderSource();});
document.querySelectorAll('#hireSrcToggle button').forEach(b=>b.onclick=()=>{HIRESRCDIM=b.dataset.d;renderHireSrc();});
/* Job overview → Excel export (exports exactly what's shown, respecting filters + drill) */
document.getElementById('jobXlsx').onclick=()=>{
  if(!TABLE_EXPORT.length)return;
  const ws=XLSX.utils.json_to_sheet(TABLE_EXPORT);
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Job overview');
  const stamp=new Date().toISOString().slice(0,10);
  XLSX.writeFile(wb,`job_overview_${stamp}.xlsx`);
};
/* Stage conversion → Excel export */
document.getElementById('convXlsx').onclick=()=>{
  if(!CONV_EXPORT.length)return;
  const ws=XLSX.utils.json_to_sheet(CONV_EXPORT);
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Stage conversion');
  XLSX.writeFile(wb,`stage_conversion_${new Date().toISOString().slice(0,10)}.xlsx`);
};
/* Recruiter capacity → target control + Excel export */
document.getElementById('recTarget').addEventListener('input',()=>{if(LASTROWS.length)renderRecruiters(LASTROWS);});
document.getElementById('recXlsx').onclick=()=>{
  if(!REC_EXPORT.length)return;
  const ws=XLSX.utils.json_to_sheet(REC_EXPORT);
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Recruiter capacity');
  XLSX.writeFile(wb,`recruiter_capacity_${new Date().toISOString().slice(0,10)}.xlsx`);
};
/* Offers not accepted → Excel export */
document.getElementById('offXlsx').onclick=()=>{
  if(!OFF_EXPORT.length)return;
  const ws=XLSX.utils.json_to_sheet(OFF_EXPORT);
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Offers not accepted');
  XLSX.writeFile(wb,`offers_not_accepted_${new Date().toISOString().slice(0,10)}.xlsx`);
};

/* keep the sticky filter bar pinned just below the header, robust to wrapping */
function syncStickyTop(){const h=document.querySelector('header');const fb=document.getElementById('filterbar');
  if(h&&fb)fb.style.top=h.offsetHeight+'px';}
window.addEventListener('resize',syncStickyTop);
window.addEventListener('load',syncStickyTop);
syncStickyTop();

/* expand modal controls */
document.getElementById('modalClose').onclick=closeExpand;
document.getElementById('modalOv').addEventListener('click',e=>{if(e.target.id==='modalOv')closeExpand();});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeExpand();});
document.getElementById('modalPng').onclick=()=>{
  if(modalKind==='heat'){downloadHeatPNG(modalId);return;}
  if(!modalChart)return;
  const src=modalChart.canvas,tmp=document.createElement('canvas');
  tmp.width=src.width;tmp.height=src.height;
  const cx=tmp.getContext('2d');cx.fillStyle='#fff';cx.fillRect(0,0,tmp.width,tmp.height);cx.drawImage(src,0,0);
  const a=document.createElement('a');a.href=tmp.toDataURL('image/png');a.download=(CHART_LABELS[modalId]||'chart')+'_full.png';a.click();
};

document.getElementById('logoutBtn').addEventListener('click', async function () {
    const btn = this;
    btn.disabled = true;
    btn.textContent = '⏻ Logging out…';

    try {
      await logout();
    } catch (err) {
      console.error('Logout error:', err);
      // fall through to redirect regardless — don't trap the user on a broken session
    }

    window.location.href = './login.html';
  });