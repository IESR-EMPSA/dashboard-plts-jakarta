// Read-only source/delivery audit. These counts never supply dashboard statistics.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { adaptBuildingProperties, createNormalizers } from '../src/services/normalization.ts'
import { createSolarDataService } from '../src/services/solarDataService.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repaired = process.argv.includes('--repaired')
const input = repaired ? 'data/processed/buildings_eligible_pvout_z13_z18_repaired.mbtiles' : 'data/processed/buildings_eligible_pvout_z13_z18.mbtiles'
const output = repaired ? 'data/processed/buildings_eligible_dki_z13-18_repaired.pmtiles' : 'data/processed/buildings_eligible_dki_z13-18.pmtiles'
const previousInput = 'data/raw/buildings_eligible_pvout.mbtiles'
const previousOutput = 'data/processed/buildings_eligible_dki.pmtiles'
const qa = resolve(root, 'data/processed/qa/archive-z13-18')
const reportName = repaired ? 'archive-repaired-report.json' : 'archive-report.json'
const investigation = repaired ? JSON.parse(await readFile(resolve(qa, 'attribute-investigation.json'), 'utf8')) : null
await mkdir(qa, { recursive: true })
const cli = resolve(root, '.tools/pmtiles/pmtiles.exe')
const run = args => execFileSync(cli, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
const require = createRequire(import.meta.url)
const mapRequire = createRequire(require.resolve('maplibre-gl/package.json'))
const { VectorTile } = await import(pathToFileURL(mapRequire.resolve('@mapbox/vector-tile')))
const { PbfReader } = await import(pathToFileURL(mapRequire.resolve('pbf')))
const decode = bytes => new VectorTile(new PbfReader(gunzipSync(bytes)))
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
async function hashFile(path) {
  const h = createHash('sha256')
  for await (const chunk of createReadStream(resolve(root, path))) h.update(chunk)
  return h.digest('hex')
}
const service = createSolarDataService({ fetch: async input => {
  const name = new URL(String(input), 'https://local.test').pathname.split('/').at(-1)
  return new Response(await readFile(resolve(root, 'public/data', name)), { headers: { 'Content-Type': 'application/json' } })
} })
const data = await service.loadSummaries()
const normalize = createNormalizers(data)
const expected = data.regions.overall
const manifest = JSON.parse(await readFile(resolve(root, 'public/data/data_manifest.json'), 'utf8'))
const baseline = new DatabaseSync(resolve(root, previousInput), { readOnly: true })
const db = new DatabaseSync(resolve(root, input), { readOnly: true })
const fields = ['building_uid','WADMKK','WADMKC','jenis_group','eligible','area_m2','useable_m2','capacity_kwp','capacity_mwp','pvout_status','pvout_1','annual_kwh','annual_gwh','Shape_Area','Shape_Length','setback_m2']
const numericFields = ['area_m2','useable_m2','capacity_kwp','capacity_mwp','pvout_1','annual_kwh','annual_gwh','Shape_Area','Shape_Length','setback_m2']
const applicationNumericFields = new Set(['area_m2','useable_m2','capacity_kwp','capacity_mwp','pvout_1','annual_kwh','annual_gwh'])
const stringFields = ['WADMKK','WADMKC','jenis_group','pvout_status']
const propertyTolerance = { absolute:1e-9, relative:1e-12 }
const normalizedGroups = new Map()
const groupKey = p => {
  const raw = JSON.stringify(stringFields.map(key => p[key]))
  if (!normalizedGroups.has(raw)) {
    const region=normalize.region(p.WADMKK)
    assert(region,'Unknown administrative region')
    const district=normalize.district(region.id,p.WADMKC),type=normalize.buildingType(p.jenis_group)
    assert(district,'Unknown district');assert(type,'Unknown building type')
    assert(['Available','NoData'].includes(p.pvout_status),'Invalid PVOUT status')
    normalizedGroups.set(raw,JSON.stringify([region.id,district.id,type.id,p.pvout_status]))
  }
  return normalizedGroups.get(raw)
}
try {
  const metadata = Object.fromEntries(db.prepare('SELECT name,value FROM metadata').all().map(r => [r.name, r.value]))
  const header = JSON.parse(run(['show', resolve(root, output), '--header-json']))
  const outputMetadata = JSON.parse(run(['show', resolve(root, output), '--metadata']))
  const layerName = JSON.parse(metadata.json).vector_layers[0].id
  assert.equal(layerName, 'buildings_eligible_pvout')
  assert.equal(Number(metadata.minzoom), 13); assert.equal(Number(metadata.maxzoom), 18)
  assert.equal(header.minzoom, 13); assert.equal(header.maxzoom, 18)
  assert.equal(header.tile_type, 'mvt'); assert.equal(header.tile_compression, 'gzip')
  assert.deepEqual(header.bounds, metadata.bounds.split(',').map(Number))
  assert.deepEqual(outputMetadata.vector_layers, JSON.parse(metadata.json).vector_layers)
  for (const [key, value] of Object.entries(metadata)) if (!['json','bounds'].includes(key)) assert.deepEqual(outputMetadata[key], value, key)
  assert.deepEqual(db.prepare('PRAGMA quick_check').all().map(r => r.quick_check), ['ok'])
  const previousInputSha = await hashFile(previousInput)
  assert.equal(previousInputSha, manifest.metadata.sources.find(s => s.role === 'building_visualization').sha256)
  const previousOutputSha = await hashFile(previousOutput)
  assert.equal(previousOutputSha, '622e785b2dae369530976a1a0a7c1671b3f51589e4ef9c56abbfd47f3eecdb02')
  const newShaBefore = await hashFile(input)
  console.log(JSON.stringify({ progress:'metadata-and-baseline-fingerprints-verified', sourceSha256:newShaBefore }))

  // Exhaustive overlap comparison establishes that the existing audited zooms are unchanged.
  const getTile = db.prepare('SELECT tile_data FROM tiles WHERE zoom_level=? AND tile_column=? AND tile_row=?')
  const overlap = []
  for (const z of [14,15,16]) {
    let tiles = 0
    for (const row of baseline.prepare('SELECT tile_column,tile_row,tile_data FROM tiles WHERE zoom_level=?').iterate(z)) {
      const other = getTile.get(z,row.tile_column,row.tile_row)
      assert(other, `Missing overlap tile ${z}/${row.tile_column}/${row.tile_row}`)
      assert(Buffer.from(row.tile_data).equals(Buffer.from(other.tile_data)), `Changed overlap tile ${z}/${row.tile_column}/${row.tile_row}`)
      tiles++
    }
    assert.equal(db.prepare('SELECT count(*) AS n FROM tiles WHERE zoom_level=?').get(z).n, tiles)
    overlap.push({ zoom:z,tiles,all_compressed_payloads_identical:true })
  }
  console.log(JSON.stringify({ progress:'all-overlapping-tiles-identical',overlap }))

  // Compact typed columns retain exact baseline values for tolerance-aware comparisons.
  const identities = new Map(), groups = new Map()
  const baselineGroups = new Uint16Array(expected.eligible_buildings)
  const measurements = numericFields.map(() => new Float64Array(expected.eligible_buildings))
  let available = 0, missing = 0, capacity = 0, energy = 0
  for (const tile of baseline.prepare('SELECT tile_data FROM tiles WHERE zoom_level=16').iterate()) {
    const layer = decode(tile.tile_data).layers[layerName]
    for (let i=0;i<layer.length;i++) {
      const p = layer.feature(i).properties
      if (identities.has(p.building_uid)) continue
      assert.equal(typeof p.building_uid,'string'); assert.equal(p.eligible,1)
      const index=identities.size,key=groupKey(p)
      assert(index<expected.eligible_buildings,'Too many baseline identities')
      if(!groups.has(key))groups.set(key,groups.size)
      baselineGroups[index]=groups.get(key)
      numericFields.forEach((field,column)=>{measurements[column][index]=p[field]??NaN})
      identities.set(p.building_uid,index)
      if (p.pvout_status==='NoData') missing++; else available++
      capacity += p.capacity_mwp; energy += p.annual_gwh ?? 0
    }
  }
  assert.equal(identities.size,expected.eligible_buildings)
  assert.equal(available,expected.pvout_available); assert.equal(missing,expected.pvout_missing)
  assert(Math.abs(capacity-expected.capacity_mwp)<0.000001)
  assert(Math.abs(energy-expected.annual_gwh)<0.000001)
  console.log(JSON.stringify({ progress:'baseline-property-index-ready',distinctUids:identities.size }))

  const sampleTiles = new Map(), zooms = [], sourceIssues = new Map()
  const canonicalGroups = [...groups.keys()]
  const addSample = (z,x,tmsY,reason) => {
    const y=2**z-1-tmsY,key=`${z}/${x}/${y}`
    if (!sampleTiles.has(key)) sampleTiles.set(key,{z,x,y,reasons:[]})
    sampleTiles.get(key).reasons.push(reason)
  }
  for (const z of [13,14,15,16,17,18]) {
    const largest=db.prepare('SELECT tile_column,tile_row,length(tile_data) AS bytes FROM tiles WHERE zoom_level=? ORDER BY length(tile_data) DESC LIMIT 1').get(z)
    assert(largest.bytes<=16*1024*1024,'A tile exceeds the local Range bound')
    addSample(z,largest.tile_column,largest.tile_row,'largest compressed tile')
    if ([14,15,16].includes(z)) {
      const row=db.prepare('SELECT tile_column,tile_row FROM tiles WHERE zoom_level=? ORDER BY tile_column,tile_row LIMIT 1').get(z)
      addSample(z,row.tile_column,row.tile_row,'overlap payload sample')
      continue
    }
    const seen=new Set(), polygons=new Set(), scopes=new Set(), types={}
    let tiles=0,emptyTiles=0,instances=0,withoutGeometry=0,pvoutMissing=0,capacitySum=0,energySum=0
    const maximumDifferences=Object.fromEntries(numericFields.map(field=>[field,0]))
    const issue = (kind,uid,field,before,after,row) => {
      const key=JSON.stringify([z,uid,field,kind,after])
      if(!sourceIssues.has(key))sourceIssues.set(key,{zoom:z,uid,field,kind,used_by_application:!numericFields.includes(field)||applicationNumericFields.has(field),before:before??null,after:after??null,after_type:typeof after,instances:0,example_tile:{z,x:row.tile_column,y:2**z-1-row.tile_row}})
      sourceIssues.get(key).instances++
    }
    for (const row of db.prepare('SELECT tile_column,tile_row,tile_data FROM tiles WHERE zoom_level=? ORDER BY tile_column,tile_row').iterate(z)) {
      tiles++
      const decoded=decode(row.tile_data),layer=decoded.layers[layerName]
      if(!layer) { assert.equal(Object.keys(decoded.layers).length,0,'Unexpected nonempty source layer');emptyTiles++;continue }
      for(let i=0;i<layer.length;i++) {
        const feature=layer.feature(i),p=feature.properties
        instances++; types[feature.type]=(types[feature.type]??0)+1
        if(typeof p.building_uid!=='string')issue('identity-type',String(p.building_uid),'building_uid','string',p.building_uid,row)
        if(p.eligible!==1)issue('eligibility',String(p.building_uid),'eligible',1,p.eligible,row)
        const index=identities.get(p.building_uid)
        if(index===undefined)issue('unknown-identity',String(p.building_uid),'building_uid','existing baseline UID',p.building_uid,row)
        let canonical
        try {canonical=groupKey(p)}catch(error){issue('unresolved-label',String(p.building_uid),'administrative/type/status',index===undefined?null:canonicalGroups[baselineGroups[index]],JSON.stringify(stringFields.map(k=>p[k])),row)}
        if(index!==undefined&&canonical&&groups.get(canonical)!==baselineGroups[index])issue('changed-label',p.building_uid,'administrative/type/status',canonicalGroups[baselineGroups[index]],canonical,row)
        for(let column=0;column<numericFields.length;column++) {
          if(index===undefined)continue
          const field=numericFields[column],before=measurements[column][index],after=p[field]
          if(Number.isNaN(before)){if(after!=null)issue('missingness',p.building_uid,field,null,after,row)}
          else {
            if(!Number.isFinite(after)){issue('invalid-numeric',p.building_uid,field,before,after,row);continue}
            const difference=Math.abs(after-before)
            maximumDifferences[field]=Math.max(maximumDifferences[field],difference)
            if(difference>Math.max(propertyTolerance.absolute,Math.abs(before)*propertyTolerance.relative))issue('changed-numeric',p.building_uid,field,before,after,row)
          }
        }
        if(!seen.has(p.building_uid)) {seen.add(p.building_uid);if(p.pvout_status==='NoData')pvoutMissing++;if(Number.isFinite(p.capacity_mwp))capacitySum+=p.capacity_mwp;if(Number.isFinite(p.annual_gwh))energySum+=p.annual_gwh}
        if(feature.type===3) { assert(feature._geometry>=0,'Polygon has no geometry field');polygons.add(p.building_uid) }
        else {assert.equal(feature.type,0,'Unexpected geometry type');assert(feature._geometry<0,'Unexpected type-0 geometry');withoutGeometry++}
        const scope=`${p.WADMKK}|${p.pvout_status}`
        if(!scopes.has(scope)) { scopes.add(scope);addSample(z,row.tile_column,row.tile_row,scope) }
      }
      if(tiles%4000===0)console.log(JSON.stringify({progress:'scanning-added-zoom',zoom:z,tiles,distinctUids:seen.size}))
    }
    const issues=[...sourceIssues.values()].filter(i=>i.zoom===z)
    const applicationIssues=issues.filter(i=>i.used_by_application)
    const compatible=applicationIssues.length===0&&seen.size===expected.eligible_buildings&&polygons.size===expected.eligible_buildings&&pvoutMissing===expected.pvout_missing&&Math.abs(capacitySum-expected.capacity_mwp)<0.000001&&Math.abs(energySum-expected.annual_gwh)<0.000001
    const result={zoom:z,tiles,empty_tiles:emptyTiles,instances,distinct_uids:seen.size,polygon_uids:polygons.size,geometry_types:types,empty_type0_instances:withoutGeometry,pvout_missing:pvoutMissing,application_properties_compatible:compatible,affected_uids:new Set(issues.map(i=>i.uid)).size,application_affected_uids:new Set(applicationIssues.map(i=>i.uid)).size,property_issue_records:issues.length,maximum_property_differences:maximumDifferences,capacity_mwp:capacitySum,annual_gwh:energySum,largest_tile_bytes:largest.bytes}
    zooms.push(result);console.log(JSON.stringify({progress:'added-zoom-audited',...result}))
  }
  if (investigation) for (const bad of investigation.bad_instances) addSample(bad.z,bad.x,2**bad.z-1-bad.y,'GeoPackage-verified repaired attribute')
  const comparisons=[],sampleErrors=[]
  for(const s of sampleTiles.values()) {
    const row=getTile.get(s.z,s.x,2**s.z-1-s.y)
    const bytes=execFileSync(cli,['tile',resolve(root,output),String(s.z),String(s.x),String(s.y)],{maxBuffer:32*1024*1024})
    assert(Buffer.from(row.tile_data).equals(bytes),`Conversion changed tile ${s.z}/${s.x}/${s.y}`)
    const layer=decode(bytes).layers[layerName],examples=[]
    const repairedIndices = investigation?.bad_instances.filter(i=>i.z===s.z&&i.x===s.x&&i.y===s.y).map(i=>i.feature_index) ?? []
    for(const index of new Set([0,Math.floor(layer.length/2),layer.length-1,...repairedIndices])) {
      const f=layer.feature(index)
      try {
        const building=adaptBuildingProperties(f.properties,data)
        examples.push({uid:building.building_uid,pvout_status:building.pvout_status,capacity_kwp:building.capacity_kwp,annual_gwh:building.annual_gwh,geometry_type:f.type})
      }catch(error){sampleErrors.push({tile:s,uid:f.properties.building_uid,message:error.message})}
      if(f.type===3)assert(f.loadGeometry().length>0,'Empty sampled polygon')
    }
    comparisons.push({...s,bytes:bytes.length,sha256:hash(bytes),compressed_payload_identical:true,examples})
  }
  const verify=run(['verify',resolve(root,output)]).trim()
  assert.equal(await hashFile(input),newShaBefore,'Input changed while auditing')
  const report={purpose:'Offline delivery/compatibility QA; never a dashboard statistics source',data_version:data.regions.metadata.data_version,
    cli:run(['version']).trim(),source:{path:input,bytes:(await stat(resolve(root,input))).size,sha256:newShaBefore,sqlite_quick_check:'ok',metadata},
    previous:{input:previousInput,input_sha256:previousInputSha,output:previousOutput,output_sha256:previousOutputSha},
    output:{path:output,bytes:(await stat(resolve(root,output))).size,sha256:await hashFile(output),header,metadata:outputMetadata,verify_exit_code:0,verify},
    baseline:{distinct_uids:identities.size,pvout_available:available,pvout_missing:missing,capacity_mwp:capacity,annual_gwh:energy},
    compatibility_passed:sourceIssues.size===0&&zooms.every(z=>z.application_properties_compatible)&&sampleErrors.length===0,
    overlap,added_zoom_scans:zooms,source_attribute_issues:[...sourceIssues.values()],sample_adapter_errors:sampleErrors,compared_property_fields:fields,property_tolerance:propertyTolerance,normalized_label_groups:Object.fromEntries(normalizedGroups),representative_tiles:comparisons,
    limits:['Container conversion does not repair empty geometry instances','Original GIS model, exhaustive topology and publication rights remain separate gates']}
  await writeFile(resolve(qa,reportName),JSON.stringify(report,null,2)+'\n')
  console.log(JSON.stringify({progress:'archive-update-audited',compatibilityPassed:report.compatibility_passed,output:report.output,affectedUids:new Set(report.source_attribute_issues.map(i=>i.uid)).size,representativeTiles:comparisons.length,report:`data/processed/qa/archive-z13-18/${reportName}`}))
  if(!report.compatibility_passed)process.exitCode=2
} finally {db.close();baseline.close()}
