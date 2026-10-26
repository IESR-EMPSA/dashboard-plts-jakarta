// Continuous technical QA only: no UAT replay, page reloads, archive/statistics edits or uploads.
import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'
import { BUILDING_ARCHIVE } from '../src/map/buildingArchive.ts'
import { adaptBuildingProperties } from '../src/services/normalization.ts'
import { createSolarDataService } from '../src/services/solarDataService.ts'

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
const option=(key,fallback)=>process.argv.find(a=>a.startsWith(`--${key}=`))?.split('=').slice(1).join('=')??fallback
const label=option('label','baseline'), cycles=Number(option('cycles','4')), minimumMs=Number(option('minutes','5'))*60000, gpuMode=option('gpu','software')
assert(/^[a-z0-9-]+$/.test(label));assert(Number.isInteger(cycles)&&cycles>=1&&cycles<=12);assert(minimumMs>=0&&minimumMs<=1200000)
assert(['software','default'].includes(gpuMode))
const qa=resolve(root,'data/processed/qa/technical',label),profile=resolve(qa,`chrome-profile-${process.pid}`)
await mkdir(qa,{recursive:true});assert(profile.startsWith(qa+sep))
const service=createSolarDataService({fetch:async input=>new Response(await readFile(resolve(root,'public/data',new URL(String(input),'https://local.test').pathname.split('/').at(-1))))})
const data=await service.loadSummaries()
const acceptance=JSON.parse(await readFile(resolve(root,'data/processed/qa/archive-z13-18/delivery-acceptance.json'),'utf8'))
const head=await fetch(`http://localhost:5173${BUILDING_ARCHIVE.localUrl}`,{method:'HEAD'})
assert.equal(head.status,200);const archiveBytes=Number(head.headers.get('content-length'))
assert.equal(archiveBytes,1667964549)
const chrome=process.env.CHROME_PATH||resolve(process.env.LOCALAPPDATA,'Google/Chrome/Application/chrome.exe');await access(chrome)
const started=Date.now(), conditions={totalGiB:os.totalmem()/2**30,availableGiB:os.freemem()/2**30,logicalCpus:os.cpus().length,node:process.version}
const browser=spawn(chrome,['--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync',
  '--disable-background-timer-throttling','--disable-renderer-backgrounding',...(gpuMode==='software'?['--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]),'--remote-debugging-port=0',`--user-data-dir=${profile}`,'--window-size=1440,900','about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']})
let browserLog='',socket,command,evaluate,stepName='startup'
browser.stderr.on('data',b=>{browserLog+=b.toString()})
const pause=ms=>new Promise(r=>setTimeout(r,ms)), requests=new Map(),ranges=[],errors=[],samples=[],steps=[], integrity=[]
const percentile=(xs,p)=>xs.length?[...xs].sort((a,b)=>a-b)[Math.min(xs.length-1,Math.floor(xs.length*p))]:null
async function waitFor(expression,label,timeout=60000){const end=Date.now()+timeout;while(Date.now()<end){if(await evaluate(expression))return;await pause(200)}throw Error(`Timed out: ${label}`)}
async function memory(name){
  const metrics=await command('Performance.getMetrics'),m=Object.fromEntries(metrics.metrics.map(v=>[v.name,v.value]))
  const processes=(await command('SystemInfo.getProcessInfo',{},true)).processInfo
  const ids=processes.map(p=>Number(p.id));assert(ids.length&&ids.every(i=>Number.isSafeInteger(i)&&i>0))
  let rss=null
  try{rss=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',`Get-Process -Id ${ids.join(',')} -ErrorAction SilentlyContinue | Select-Object Id,WorkingSet64,PrivateMemorySize64 | ConvertTo-Json -Compress`],{encoding:'utf8',windowsHide:true,timeout:10000}));if(!Array.isArray(rss))rss=[rss];if(!rss.length)rss=null}catch{}
  const map=await evaluate(`(()=>{const m=window.__SOLAR_MAP__,t=m.style.tileManagers['solar-buildings'];return {zoom:m.getZoom(),inView:t._inViewTiles.getAllIds().length,cached:t._outOfViewCache.order.length,cacheLimit:t._outOfViewCache.max,webglLost:m.getCanvas().getContext('webgl2')?.isContextLost()??null}})()`)
  const result={name,elapsedMs:Date.now()-started,jsHeapUsed:m.JSHeapUsedSize,jsHeapTotal:m.JSHeapTotalSize,taskDuration:m.TaskDuration,
    browserPrivateBytes:rss?.reduce((n,p)=>n+p.PrivateMemorySize64,0)||null,browserWorkingSetSum:rss?.reduce((n,p)=>n+p.WorkingSet64,0)||null,
    systemAvailableGiB:os.freemem()/2**30,processes:rss,map}
  samples.push(result);return result
}
const route=[
  {name:'dense-west-z13',tile:[52200.5,33888.5],zoom:13.3},
  {name:'dense-west-z14',tile:[52200.5,33888.5],zoom:14.3},
  {name:'dense-west-z16',tile:[52200.5,33888.5],zoom:16.3},
  {name:'repaired-cakung-z17',center:[106.9435,-6.1935],zoom:17.3},
  {name:'repaired-cakung-z18',center:[106.9435,-6.1935],zoom:18.3},
  {name:'central-z15',center:[106.846,-6.186],zoom:15.3},
  {name:'south-z16',center:[106.825,-6.24],zoom:16.3},
  {name:'island-z16',tile:[52155.03,33824.94],zoom:16.3},
  {name:'island-z18',tile:[52155.03,33824.94],zoom:18.3},
  {name:'overview',center:[106.75,-5.85],zoom:9},
]
for(const p of route)if(p.tile){const[x,y]=p.tile;p.center=[x/2**16*360-180,Math.atan(Math.sinh(Math.PI*(1-2*y/2**16)))*180/Math.PI]}
try{
  let port
  for(let n=0;n<100;n++){try{port=Number((await readFile(resolve(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);break}catch{await pause(200)}}
  assert(port);const listing=await(await fetch(`http://127.0.0.1:${port}/json/version`)).json()
  // The browser-level socket also provides OS process IDs for this isolated instance.
  socket=new WebSocket(listing.webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j})
  let id=0,sessionId;const pending=new Map()
  socket.onmessage=e=>{
    const m=JSON.parse(e.data)
    if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result)}
    if(m.method==='Runtime.exceptionThrown')errors.push({kind:'exception',...m.params.exceptionDetails})
    if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push({kind:'console',args:m.params.args.map(a=>a.value??a.description)})
    if(m.method==='Network.requestWillBeSent')requests.set(m.params.requestId,{...m.params.request,start:m.params.timestamp,step:stepName})
    if(m.method==='Network.responseReceived'&&m.params.response.url.includes(BUILDING_ARCHIVE.localUrl)){
      const r=m.params.response,q=requests.get(m.params.requestId),header=(o,k)=>Object.entries(o??{}).find(([n])=>n.toLowerCase()===k)?.[1]
      const v={id:m.params.requestId,step:q?.step,status:r.status,range:header(q?.headers,'range'),contentRange:header(r.headers,'content-range'),bytes:Number(header(r.headers,'content-length')),etag:header(r.headers,'etag'),ttfbMs:r.timing? r.timing.receiveHeadersStart-r.timing.sendStart:null,fromDiskCache:r.fromDiskCache??false}
      ranges.push(v)
    }
    if(m.method==='Network.loadingFinished'){const v=ranges.find(r=>r.id===m.params.requestId),q=requests.get(m.params.requestId);if(v){v.elapsedMs=(m.params.timestamp-q.start)*1000;v.encodedBytes=m.params.encodedDataLength}}
    if(m.method==='Network.dataReceived'){const v=ranges.find(r=>r.id===m.params.requestId);if(v)v.observedChunkBytes=(v.observedChunkBytes??0)+m.params.encodedDataLength}
    if(m.method==='Network.loadingFailed'){const v=ranges.find(r=>r.id===m.params.requestId);if(v){v.failure=m.params.errorText;v.canceled=m.params.canceled??false}}
  }
  command=(method,params={},browserLevel=false)=>new Promise((r,j)=>{const messageId=++id;const timer=setTimeout(()=>{pending.delete(messageId);j(Error(`CDP timed out: ${method}, step=${stepName}`))},20000);pending.set(messageId,{resolve:v=>{clearTimeout(timer);r(v)},reject:e=>{clearTimeout(timer);j(e)}});socket.send(JSON.stringify({id:messageId,method,params,...(!browserLevel&&sessionId?{sessionId}:{})}))})
  const target=(await command('Target.getTargets',{},true)).targetInfos.find(t=>t.type==='page')
  sessionId=(await command('Target.attachToTarget',{targetId:target.targetId,flatten:true},true)).sessionId
  evaluate=async expression=>{const r=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value}
  await command('Runtime.enable');await command('Network.enable');await command('Performance.enable');await command('Page.enable')
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false})
  await command('Page.addScriptToEvaluateOnNewDocument',{source:`window.__QA_PERF__={longTasks:[],drifts:[],frames:[],queries:[],contextLost:0,mapErrors:[]};new PerformanceObserver(l=>{for(const e of l.getEntries())window.__QA_PERF__.longTasks.push(e.duration)}).observe({type:'longtask',buffered:true});let last=performance.now();setInterval(()=>{const now=performance.now();window.__QA_PERF__.drifts.push(Math.max(0,now-last-100));last=now},100);let frame;function tick(now){if(frame)window.__QA_PERF__.frames.push(now-frame);frame=now;requestAnimationFrame(tick)}requestAnimationFrame(tick);document.addEventListener('webglcontextlost',()=>window.__QA_PERF__.contextLost++,true);`})
  const version=await command('Browser.getVersion',{},true)
  const gpu=(await command('SystemInfo.getInfo',{},true)).gpu
  await command('Page.navigate',{url:'http://localhost:5173/'})
  await waitFor(`!!window.__SOLAR_MAP__&&!!window.__SOLAR_MAP__.getLayer('solar-building-fill')`,'initial research map')
  await evaluate(`(()=>{const m=window.__SOLAR_MAP__,original=m.queryRenderedFeatures;m.queryRenderedFeatures=function(...args){const start=performance.now(),r=original.apply(this,args);const full=args.length===1&&args[0]?.layers?.includes('solar-building-fill'),box=Array.isArray(args[0]?.[0])&&args[1]?.layers?.includes('solar-building-fill');if(full||box)window.__QA_PERF__.queries.push({ms:performance.now()-start,count:r.length,full:!!full});return r};m.on('error',e=>window.__QA_PERF__.mapErrors.push({source:e.sourceId??null,message:e.error?.message??''}));return {url:m.getSource('solar-buildings').url}})()`)
  await pause(1000);await memory('initial')
  console.log(JSON.stringify({progress:'technical-start',label,conditions,cycles,minimumMs}))
  const workStarted=Date.now()
  for(let cycle=0;cycle<cycles||Date.now()-workStarted<minimumMs;cycle++){
    for(const place of route){
      stepName=`cycle-${cycle+1}/${place.name}`;const start=Date.now(),rangeStart=ranges.length
      await evaluate(`void window.__SOLAR_MAP__.easeTo({center:${JSON.stringify(place.center)},zoom:${place.zoom},padding:0,bearing:0,pitch:0,duration:300})`)
      await pause(400)
      const expected=Math.min(18,Math.floor(place.zoom))
      await waitFor(`(()=>{const m=window.__SOLAR_MAP__,t=m.style.tileManagers['solar-buildings'];if(m.isMoving()||!m.isSourceLoaded('solar-buildings'))return false;return ${place.zoom}<13||t.getRenderableIds().some(id=>t.getTileByID(id).tileID.canonical.z===${expected})})()`,stepName)
      const settled=Date.now()-start
      // Hover stress uses real pointer events, never a full-viewport QA feature scan.
      if(place.zoom>=13){const bounds=await evaluate(`(()=>{const r=window.__SOLAR_MAP__.getCanvas().getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`)
        for(let i=0;i<8;i++){await command('Input.dispatchMouseEvent',{type:'mouseMoved',x:bounds.x+(i%4)*8,y:bounds.y+Math.floor(i/4)*8});await pause(70)}
        const props=await evaluate(`(()=>{const m=window.__SOLAR_MAP__,c=m.getCanvas();for(const dx of [0,20,-20,50,-50])for(const dy of [0,20,-20,50,-50]){const f=m.queryRenderedFeatures([c.clientWidth/2+dx,c.clientHeight/2+dy],{layers:['solar-building-fill']})[0];if(f)return f.properties}return null})()`)
        if(props){const b=adaptBuildingProperties(props,data);integrity.push({step:stepName,uid:b.building_uid,status:b.pvout_status,nullEnergy:b.annual_gwh===null})}
      }
      const beforeProbe=Date.now();await evaluate('1+1');const probeMs=Date.now()-beforeProbe
      const row={name:stepName,settleMs:settled,probeMs,requests:ranges.length-rangeStart,bytes:ranges.slice(rangeStart).reduce((n,r)=>n+r.bytes,0)}
      steps.push(row);if(steps.length%5===0)console.log(JSON.stringify({progress:'technical-navigation',steps:steps.length,...row}))
      if(place.name==='dense-west-z13'||place.name==='overview')await memory(stepName)
      await pause(200)
    }
    const m=await memory(`cycle-${cycle+1}-complete`)
    await writeFile(resolve(qa,'checkpoint.json'),JSON.stringify({conditions,steps,samples,ranges,errors,integrity},null,2)+'\n')
    if(m.systemAvailableGiB<0.12)throw Error('System memory guard: less than 0.12 GiB available; no leak conclusion can be drawn')
  }
  stepName='rapid-navigation'
  for(let i=0;i<24;i++){const p=route[i%route.length];await evaluate(`void window.__SOLAR_MAP__.jumpTo({center:${JSON.stringify(p.center)},zoom:${p.zoom},padding:0})`);await pause(120)}
  await evaluate(`void window.__SOLAR_MAP__.jumpTo({center:[106.9435,-6.1935],zoom:18.3,padding:0})`)
  await pause(400)
  await waitFor(`window.__SOLAR_MAP__.isSourceLoaded('solar-buildings')&&!window.__SOLAR_MAP__.isMoving()`,'rapid navigation recovery')
  await pause(3000);await memory('end-before-diagnostic-gc')
  const beforeRepaints=await evaluate('window.__QA_PERF__.queries.length')
  for(let i=0;i<10;i++){await evaluate('void window.__SOLAR_MAP__.triggerRepaint()');await pause(80)}
  const redundantChecks=await evaluate(`window.__QA_PERF__.queries.length-${beforeRepaints}`)
  assert.equal(redundantChecks,0,'Repainting an unchanged view must not rescan buildings')
  stepName='empty-water-technical-regression'
  await evaluate(`void window.__SOLAR_MAP__.jumpTo({center:[106.72,-5.93],zoom:16.3,padding:0})`);await pause(400)
  await waitFor(`window.__SOLAR_MAP__.isSourceLoaded('solar-buildings')&&!!document.querySelector('.map-empty')`,'real empty-water state')
  const emptyState={waterCorrectlyEmpty:true,unchangedRepaintRescans:redundantChecks}
  await evaluate(`void window.__SOLAR_MAP__.jumpTo({center:[106.9435,-6.1935],zoom:18.3,padding:0})`);await pause(400)
  await waitFor(`window.__SOLAR_MAP__.isSourceLoaded('solar-buildings')&&!document.querySelector('.map-empty')`,'return to populated view')
  emptyState.populatedViewRestored=true
  await command('HeapProfiler.collectGarbage');await memory('end-after-diagnostic-gc')
  const probe=await evaluate('window.__QA_PERF__')
  assert.equal(probe.contextLost,0);assert.equal(errors.length,0);assert(!probe.mapErrors.some(e=>e.source==='solar-buildings'))
  assert(ranges.length>0&&ranges.every(r=>r.status===206&&r.range&&r.bytes<=16*1024*1024&&r.contentRange?.endsWith(`/${archiveBytes}`)))
  assert(!ranges.some(r=>r.failure&&r.failure!=='net::ERR_ABORTED'),'Unexpected archive transport failure')
  assert(integrity.some(i=>i.status==='NoData'&&i.nullEnergy),'Missing PVOUT sample remains null')
  const seen=new Set();let duplicateRequests=0,duplicateBytes=0
  for(const r of ranges){if(seen.has(r.contentRange)){duplicateRequests++;duplicateBytes+=r.bytes}seen.add(r.contentRange)}
  const result={status:'completed',label,conditions,browser:version,gpuMode,gpu,elapsedMs:Date.now()-started,cycles:steps.length/route.length,steps,samples,ranges,integrity,errors,probe,emptyState,
    summary:{navigationP50Ms:percentile(steps.map(s=>s.settleMs),.5),navigationP95Ms:percentile(steps.map(s=>s.settleMs),.95),probeP95Ms:percentile(steps.map(s=>s.probeMs),.95),
      timerDriftP95Ms:percentile(probe.drifts,.95),timerDriftMaxMs:Math.max(0,...probe.drifts),longTasks:probe.longTasks.length,longTaskMaxMs:Math.max(0,...probe.longTasks),
      fullViewportQueries:probe.queries.filter(q=>q.full).length,existenceQueries:probe.queries.length,fullQueryMs:probe.queries.reduce((n,q)=>n+q.ms,0),fullQueryMaxMs:Math.max(0,...probe.queries.map(q=>q.ms)),
      rangeRequests:ranges.length,rangeBytes:ranges.reduce((n,r)=>n+r.bytes,0),rangeBytesMeaning:'Advertised Content-Length including canceled requests; not actual wire transfer',completedWireBytes:ranges.reduce((n,r)=>n+(r.encodedBytes??0),0),canceledRequests:ranges.filter(r=>r.failure==='net::ERR_ABORTED').length,unexpectedRangeFailures:ranges.filter(r=>r.failure&&r.failure!=='net::ERR_ABORTED').length,duplicateRequests,duplicateBytes,ttfbP95Ms:percentile(ranges.map(r=>r.ttfbMs).filter(Number.isFinite),.95)},
    archive:{...BUILDING_ARCHIVE,bytes:archiveBytes,sha256:acceptance.output,etag:head.headers.get('etag')},
    limitations:['Headless Chrome; GPU mode is recorded, Vite development serving and local disk/loopback; not physical mobile or remote CDN certification','Working-set sum includes shared pages; private bytes are process commit, not JS heap; unavailable/zero OS samples are not a memory baseline','No page reload or forced GC during navigation; GC only once after stress to distinguish retained main-thread heap','No agreed production performance budget; measurements are observations, not a release SLA']}
  await writeFile(resolve(qa,'report.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({progress:'technical-complete',label,elapsedMs:result.elapsedMs,...result.summary,samples:samples.map(s=>({name:s.name,heapMiB:s.jsHeapUsed/2**20,privateMiB:s.browserPrivateBytes/2**20,cached:s.map.cached}))}))
}catch(error){let probe=null;try{probe=await evaluate?.('window.__QA_PERF__')}catch{}
  await writeFile(resolve(qa,'failure.json'),JSON.stringify({label,error:String(error),step:stepName,conditions,elapsedMs:Date.now()-started,steps,samples,ranges,errors,integrity,probe,browserLog:browserLog.slice(-2000)},null,2)+'\n');console.log(JSON.stringify({progress:'technical-failed',label,error:String(error),steps:steps.length}));process.exitCode=1
}finally{if(command)await command('Browser.close',{},true).catch(()=>{});socket?.close();if(browser.exitCode===null)browser.kill();await pause(500);assert(profile.startsWith(qa+sep));await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:200}).catch(()=>{})}
