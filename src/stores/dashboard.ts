import { computed, reactive, shallowReadonly, shallowRef } from 'vue'
import type { BoundaryLevel, DashboardFilters, DataStatus, KpiSelection, ReadonlyBoundaries, ReadonlyDashboardData, SolarDataService } from '../types/dashboard.ts'
import { asDataError, SolarDataError } from '../services/dataError.ts'
import { createSolarDataService } from '../services/solarDataService.ts'
import { selectDistrictStatistics, selectKpis, selectRegionStatistics, selectTypeStatistics, validateFilterSelection } from '../selectors/dashboard.ts'

function resource<T>(loader: () => Promise<T>, onReady?: (data: T) => void) {
  const data = shallowRef<T | null>(null), status = shallowRef<DataStatus>('idle'), error = shallowRef<SolarDataError | null>(null)
  let generation = 0, pending: Promise<boolean> | null = null
  function load(): Promise<boolean> {
    if (pending) return pending
    if (status.value === 'ready') return Promise.resolve(true)
    const token = generation
    status.value = 'loading'; error.value = null
    const request = Promise.resolve().then(loader).then(value => {
      if (token !== generation) return false
      onReady?.(value)
      data.value = value; status.value = 'ready'
      return true
    }).catch(cause => {
      if (token === generation) { data.value = null; error.value = asDataError(cause); status.value = 'error' }
      return false
    }).finally(() => { if (token === generation) pending = null })
    pending = request
    return request
  }
  function reset() {
    generation++; pending = null; data.value = null; error.value = null; status.value = 'idle'
  }
  return { data, status, error, load, reset,
    view: { data: shallowReadonly(data), status: shallowReadonly(status), error: shallowReadonly(error) } }
}

/** One instance per application/provider; no process-global state or new store dependency. */
export function createDashboardStore(service: SolarDataService = createSolarDataService()) {
  const filters = reactive<DashboardFilters>({ regionId: null, districtId: null, typeId: null })
  const summaries = resource<ReadonlyDashboardData>(() => service.loadSummaries(), next => {
    if (!next.regions.regions.some(r => r.id === filters.regionId)) filters.regionId = null
    if (!next.districts.districts.some(d => d.id === filters.districtId && d.region_id === filters.regionId)) filters.districtId = null
    if (!next.types.types.some(t => t.id === filters.typeId)) filters.typeId = null
  })
  const boundaries = { region: boundaryResource('region'), district: boundaryResource('district') }
  function boundaryResource(level: BoundaryLevel) {
    return resource<ReadonlyBoundaries>(async () => {
      if (!await summaries.load()) throw summaries.error.value ?? new SolarDataError('network', 'Summary release is unavailable')
      const geo = await service.loadBoundaries(level)
      if (geo.metadata.data_version !== summaries.data.value?.manifest.metadata.data_version)
        throw new SolarDataError('version', 'Boundary release differs from current summaries')
      return geo
    })
  }
  function change(next: DashboardFilters): void {
    if (!summaries.data.value) throw new SolarDataError('invalid-filter', 'Load the summary release before choosing filters')
    const reason = validateFilterSelection(summaries.data.value, next)
    if (reason) throw new SolarDataError('invalid-filter', reason)
    Object.assign(filters, next)
  }
  function setRegion(regionId: string | null): void {
    const compatible = summaries.data.value?.districts.districts.some(d => d.id === filters.districtId && d.region_id === regionId)
    change({ ...filters, regionId, districtId: compatible ? filters.districtId : null })
  }
  function setDistrict(districtId: string | null): void { change({ ...filters, districtId }) }
  function setBuildingType(typeId: string | null): void { change({ ...filters, typeId }) }
  function resetFilters(): void { Object.assign(filters, { regionId: null, districtId: null, typeId: null }) }
  function refresh(): Promise<boolean> {
    summaries.reset(); boundaries.region.reset(); boundaries.district.reset(); service.clearCache()
    return summaries.load()
  }
  const kpis = computed<KpiSelection | { status: 'not-ready' }>(() => summaries.data.value ? selectKpis(summaries.data.value, filters) : { status: 'not-ready' })
  const districtOptions = computed(() => summaries.data.value?.districts.districts.filter(d => d.region_id === filters.regionId) ?? [])
  const regionOptions = computed(() => summaries.data.value?.regions.regions ?? [])
  const typeOptions = computed(() => summaries.data.value?.types.types ?? [])
  const typeStatistics = computed(() => summaries.data.value ? selectTypeStatistics(summaries.data.value) : null)
  const regionStatistics = computed(() => summaries.data.value ? selectRegionStatistics(summaries.data.value) : null)
  const districtStatistics = computed(() => summaries.data.value ? selectDistrictStatistics(summaries.data.value, filters.regionId) : null)
  return { ...summaries.view, filters: shallowReadonly(filters), kpis, districtOptions, regionOptions, typeOptions,
    typeStatistics, regionStatistics, districtStatistics,
    boundaries: { region: boundaries.region.view, district: boundaries.district.view },
    load: summaries.load, refresh, loadBoundaries: (level: BoundaryLevel) => boundaries[level].load(),
    setRegion, setDistrict, setBuildingType, resetFilters }
}
export type DashboardStore = ReturnType<typeof createDashboardStore>
