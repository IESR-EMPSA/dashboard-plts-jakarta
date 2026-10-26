import type {
  AdminBoundaries, AdminCrosswalkDataset, BuildingTileProperties, BuildingTypeDataset,
  CapacityCoverage, CoverageDataset, DataManifest, DistrictDataset, RegionDataset,
  SummaryMeasures, TypeDataset,
} from './solar.ts'

export type DeepReadonly<T> = { readonly [K in keyof T]: DeepReadonly<T[K]> }
export interface DashboardData {
  manifest: DataManifest
  regions: RegionDataset
  districts: DistrictDataset
  types: TypeDataset
  coverage: CoverageDataset
  adminCrosswalk: AdminCrosswalkDataset
  buildingTypes: BuildingTypeDataset
}
export type ReadonlyDashboardData = DeepReadonly<DashboardData>
export type BoundaryLevel = 'region' | 'district'
export type ReadonlyBoundaries = DeepReadonly<AdminBoundaries>
export interface DashboardFilters {
  regionId: string | null
  districtId: string | null
  typeId: string | null
}
export type StatisticalScope =
  | { kind: 'dki' }
  | { kind: 'region'; regionId: string }
  | { kind: 'district'; regionId: string; districtId: string }
  | { kind: 'building-type'; typeId: string }
export type CapacityCoverageResult =
  | { status: 'available'; data: Readonly<CapacityCoverage> }
  | { status: 'unsupported'; reason: 'capacity-breakdown-unavailable' }
export interface DashboardKpis extends SummaryMeasures {
  generation_availability: 'complete' | 'partial' | 'unavailable'
  capacity_coverage: CapacityCoverageResult
}
export type KpiSelection = DeepReadonly<
  | { status: 'available'; scope: StatisticalScope; data: DashboardKpis }
  | { status: 'unsupported'; selection: Readonly<DashboardFilters>; reason: 'admin-type-aggregate-unavailable'; requiredAggregate: 'summary_kecamatan_jenis' }
  | { status: 'invalid'; reason: string }>
export type DataStatus = 'idle' | 'loading' | 'ready' | 'error'
export interface SolarDataService {
  loadSummaries(): Promise<ReadonlyDashboardData>
  loadBoundaries(level: BoundaryLevel): Promise<ReadonlyBoundaries>
  /** Clears this instance's release cache. Existing callers may finish their old requests. */
  clearCache(): void
}
export interface NormalizedBuildingProperties extends BuildingTileProperties {
  region_id: string
  district_id: string
  type_id: string
}
