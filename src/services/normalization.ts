import type { NormalizedBuildingProperties, ReadonlyDashboardData } from '../types/dashboard.ts'
import { finite, record, text } from './dataValidation.ts'
import { assertData, SolarDataError } from './dataError.ts'

/** Exact crosswalk lookup only. Unknown values remain unresolved. */
export function createNormalizers(data: ReadonlyDashboardData) {
  const regions = data.adminCrosswalk.regions
  const districts = data.adminCrosswalk.districts
  const types = data.buildingTypes.categories
  const only = <T>(matches: readonly T[]): T | null => matches.length === 1 ? matches[0]! : null
  return {
    region: (value: string) => only(regions.filter(r => r.id === value || r.wilayah === value || r.raw_name === value)),
    district: (regionId: string, value: string) => only(districts.filter(d => d.region_id === regionId &&
      (d.id === value || d.kecamatan === value || d.raw_name === value))),
    buildingType: (value: string) => only(types.filter(t => t.id === value || t.raw_labels.includes(value))),
  }
}

/** Reads measurements; never recomputes usable area, PV capacity or solar yield. */
export function adaptBuildingProperties(value: unknown, data: ReadonlyDashboardData): Readonly<NormalizedBuildingProperties> {
  try {
    const p = record(value, 'building properties'), normalize = createNormalizers(data)
    const region = normalize.region(text(p.WADMKK, 'WADMKK'))
    assertData(region, 'Unknown building region')
    const district = normalize.district(region.id, text(p.WADMKC, 'WADMKC'))
    const type = normalize.buildingType(text(p.jenis_group, 'jenis_group'))
    assertData(district, 'Unknown building district or inconsistent parent')
    assertData(type, 'Unknown building type')
    assertData(p.eligible === 1, 'Building is not explicitly eligible')
    assertData(p.pvout_status === 'Available' || p.pvout_status === 'NoData', 'Unknown PVOUT status')
    const pvout_1 = p.pvout_1 == null ? null : finite(p.pvout_1, 'pvout_1')
    const annual_kwh = p.annual_kwh == null ? null : finite(p.annual_kwh, 'annual_kwh')
    const annual_gwh = p.annual_gwh == null ? null : finite(p.annual_gwh, 'annual_gwh')
    assertData(p.pvout_status === 'NoData' ? pvout_1 === null && annual_kwh === null && annual_gwh === null :
      pvout_1 !== null && annual_kwh !== null && annual_gwh !== null, 'PVOUT status and generation fields contradict each other')
    const usable_m2 = finite(p.useable_m2, 'useable_m2')
    if (p.usable_m2 !== undefined) assertData(p.usable_m2 === usable_m2, 'Conflicting usable-area fields')
    return Object.freeze({ building_uid: text(p.building_uid, 'building_uid'),
      region_id: region.id, district_id: district.id, type_id: type.id,
      WADMKK: region.wilayah, WADMKC: district.kecamatan, jenis_group: type.jenis_group,
      area_m2: finite(p.area_m2, 'area_m2'), usable_m2,
      capacity_kwp: finite(p.capacity_kwp, 'capacity_kwp'), capacity_mwp: finite(p.capacity_mwp, 'capacity_mwp'),
      pvout_1, annual_kwh, annual_gwh, pvout_status: p.pvout_status })
  } catch (cause) {
    throw new SolarDataError('invalid-building', cause instanceof Error ? cause.message : 'Invalid building properties', { cause })
  }
}
