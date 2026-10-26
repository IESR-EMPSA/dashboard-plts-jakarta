import type { FeatureCollection, MultiPolygon } from 'geojson'

/** Publication contract v1. Units are encoded in field names; ratios are 0–1. */
export interface SourceFingerprint {
  path: string
  bytes: number
  sha256: string
  role: 'statistics' | 'boundaries' | 'crosswalk' | 'building_visualization'
}

export interface DataMetadata {
  schema_version: '1.0.0'
  data_version: string
  producer: { name: string; version: string; sha256: string }
  coverage: 'DKI Jakarta'
  units: { capacity: 'MWp'; generation: 'GWh/year'; area: 'm2'; ratios: '0–1' }
  generation_scope: 'PVOUT-covered eligible buildings only'
  verification: 'export_arithmetic_validated; source_model_topology_and_rights_pending'
  sources: SourceFingerprint[]
}

export interface SummaryMeasures {
  total_buildings: number
  eligible_buildings: number
  eligibility_rate: number | null
  capacity_mwp: number
  annual_gwh: number | null
  pvout_available: number
  pvout_missing: number
  pvout_coverage: number | null
}

export interface CapacityCoverage {
  capacity_with_pvout_mwp: number
  capacity_without_pvout_mwp: number
  pvout_capacity_coverage: number | null
}

export interface RegionSummary extends SummaryMeasures, CapacityCoverage {
  id: string
  wilayah: string
}

export interface DistrictSummary extends SummaryMeasures {
  id: string
  region_id: string
  wilayah: string
  kecamatan: string
  join_key: string
}

export interface TypeSummary extends SummaryMeasures {
  id: string
  jenis_group: string
}

export interface PvoutCoverage extends CapacityCoverage {
  eligible_buildings: number
  pvout_available: number
  pvout_missing: number
  pvout_coverage: number | null
  capacity_mwp: number
}

export interface RegionCrosswalk {
  id: string
  raw_name: string
  wilayah: string
}

export interface DistrictAlias {
  region_id: string
  raw_name: string
  kecamatan: string
}

export interface AdminCrosswalkConfig {
  regions: RegionCrosswalk[]
  district_aliases: DistrictAlias[]
}

export interface DistrictCrosswalk extends DistrictAlias {
  id: string
  wilayah: string
  join_key: string
  alias_applied: boolean
}

export interface BuildingTypeConfig {
  categories: { id: string; jenis_group: string; raw_labels: string[] }[]
}

export interface AdminProperties {
  id: string
  region_id: string
  wilayah: string
  kecamatan?: string
  join_key?: string
}

export interface AdminBoundaries extends FeatureCollection<MultiPolygon, AdminProperties> {
  metadata: DataMetadata
}

export interface RegionDataset {
  metadata: DataMetadata
  overall: SummaryMeasures & CapacityCoverage
  regions: RegionSummary[]
}

export interface DistrictDataset { metadata: DataMetadata; districts: DistrictSummary[] }
export interface TypeDataset { metadata: DataMetadata; types: TypeSummary[] }
export interface CoverageDataset {
  metadata: DataMetadata
  overall: PvoutCoverage
  regions: (PvoutCoverage & { region_id: string; wilayah: string })[]
}
export interface AdminCrosswalkDataset extends AdminCrosswalkConfig {
  metadata: DataMetadata
  districts: DistrictCrosswalk[]
}
export interface BuildingTypeDataset extends BuildingTypeConfig { metadata: DataMetadata }

/** Future adapter target, not a frontend service or recalculated model. */
export interface BuildingTileProperties {
  building_uid: string
  WADMKK: string
  WADMKC: string
  jenis_group: string
  area_m2: number
  usable_m2: number // read from raw useable_m2
  capacity_kwp: number
  capacity_mwp: number
  pvout_1: number | null
  annual_kwh: number | null
  annual_gwh: number | null
  pvout_status: 'Available' | 'NoData'
}

export interface DataManifest {
  metadata: DataMetadata
  validation: {
    regions: number
    districts: number
    building_types: number
    district_aliases_applied: number
    unmatched_administrative_joins: number
    total_buildings: number
    eligible_buildings: number
    pvout_available: number
    pvout_missing: number
    capacity_mwp: number
    annual_gwh: number | null
    tolerance: number
  }
  outputs: { path: string; bytes: number; sha256: string; records: number }[]
}
