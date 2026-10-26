import type { CapacityCoverage, SummaryMeasures } from '../types/solar.ts'
import type { DashboardFilters, DashboardKpis, KpiSelection, ReadonlyDashboardData, StatisticalScope } from '../types/dashboard.ts'
import { countRatio, deepFreeze } from '../services/dataValidation.ts'

export function selectDkiKpis(data: ReadonlyDashboardData): KpiSelection {
  return available(data.regions.overall, { kind: 'dki' }, data.regions.overall)
}
function available(m: Readonly<SummaryMeasures>, scope: StatisticalScope, capacity?: Readonly<CapacityCoverage>): KpiSelection {
  const kpis: DashboardKpis = {
    total_buildings: m.total_buildings, eligible_buildings: m.eligible_buildings,
    capacity_mwp: m.capacity_mwp, annual_gwh: m.annual_gwh,
    pvout_available: m.pvout_available, pvout_missing: m.pvout_missing,
    eligibility_rate: countRatio(m.eligible_buildings, m.total_buildings),
    pvout_coverage: countRatio(m.pvout_available, m.eligible_buildings),
    generation_availability: m.annual_gwh === null ? 'unavailable' : m.pvout_missing > 0 ? 'partial' : 'complete',
    capacity_coverage: capacity ? { status: 'available', data: {
      capacity_with_pvout_mwp: capacity.capacity_with_pvout_mwp,
      capacity_without_pvout_mwp: capacity.capacity_without_pvout_mwp,
      pvout_capacity_coverage: capacity.pvout_capacity_coverage,
    } } : { status: 'unsupported', reason: 'capacity-breakdown-unavailable' } }
  const result: KpiSelection = { status: 'available', scope, data: kpis }
  return deepFreeze(result)
}
export function selectRegionKpis(data: ReadonlyDashboardData, regionId: string): KpiSelection {
  const r = data.regions.regions.find(r => r.id === regionId)
  return r ? available(r, { kind: 'region', regionId }, r) : { status: 'invalid', reason: 'Unknown region ID' }
}
export function selectDistrictKpis(data: ReadonlyDashboardData, districtId: string): KpiSelection {
  const d = data.districts.districts.find(d => d.id === districtId)
  return d ? available(d, { kind: 'district', regionId: d.region_id, districtId }) : { status: 'invalid', reason: 'Unknown district ID' }
}
export function selectTypeKpis(data: ReadonlyDashboardData, typeId: string): KpiSelection {
  const t = data.types.types.find(t => t.id === typeId)
  return t ? available(t, { kind: 'building-type', typeId }) : { status: 'invalid', reason: 'Unknown building type ID' }
}
export function validateFilterSelection(data: ReadonlyDashboardData, f: Readonly<DashboardFilters>): string | null {
  if (f.regionId !== null && !data.regions.regions.some(r => r.id === f.regionId)) return 'Unknown region ID'
  if (f.typeId !== null && !data.types.types.some(t => t.id === f.typeId)) return 'Unknown building type ID'
  if (f.districtId !== null) {
    const district = data.districts.districts.find(d => d.id === f.districtId)
    if (!district) return 'Unknown district ID'
    if (district.region_id !== f.regionId) return 'District requires its selected parent region'
  }
  return null
}
export function selectKpis(data: ReadonlyDashboardData, filters: Readonly<DashboardFilters>): KpiSelection {
  const invalid = validateFilterSelection(data, filters)
  if (invalid) return { status: 'invalid', reason: invalid }
  if (filters.typeId !== null && filters.regionId !== null) return {
    status: 'unsupported', selection: { ...filters }, reason: 'admin-type-aggregate-unavailable', requiredAggregate: 'summary_kecamatan_jenis',
  }
  if (filters.districtId !== null) return selectDistrictKpis(data, filters.districtId)
  if (filters.regionId !== null) return selectRegionKpis(data, filters.regionId)
  if (filters.typeId !== null) return selectTypeKpis(data, filters.typeId)
  return selectDkiKpis(data)
}

/** These marginal charts always advertise their actual scope, even under a combined filter. */
export function selectTypeStatistics(data: ReadonlyDashboardData) {
  return { scope: { kind: 'dki' as const }, types: data.types.types }
}
/** Raw aliases for future tile filtering; no MapLibre layer/expression is created here. */
export function selectBuildingTypeLabels(data: ReadonlyDashboardData, typeId: string | null) {
  if (typeId === null) return { status: 'available' as const, labels: null }
  const type = data.buildingTypes.categories.find(t => t.id === typeId)
  return type ? { status: 'available' as const, labels: type.raw_labels } : { status: 'invalid' as const, reason: 'Unknown building type ID' }
}
export function selectRegionStatistics(data: ReadonlyDashboardData) {
  return { scope: { kind: 'dki' as const }, regions: data.regions.regions }
}
export function selectDistrictStatistics(data: ReadonlyDashboardData, regionId: string | null) {
  if (regionId !== null && !data.regions.regions.some(r => r.id === regionId)) return { status: 'invalid' as const, reason: 'Unknown region ID' }
  return { status: 'available' as const, scope: regionId === null ? { kind: 'dki' as const } : { kind: 'region' as const, regionId },
    districts: data.districts.districts.filter(d => regionId === null || d.region_id === regionId) }
}
