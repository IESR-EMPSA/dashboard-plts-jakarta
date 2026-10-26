<script setup lang="ts">
import { useI18n } from '../../i18n/index.ts'
import { computed, ref } from 'vue'
import { useDashboard } from '../../composables/useDashboard.ts'
import { ratioToPercent } from '../../utils/format.ts'
import AppIcon from '../AppIcon.vue'

const { t, n, regionName, districtName, typeName } = useI18n()

defineProps<{ scope: string }>()
const dashboard = useDashboard()
const { data, filters, kpis, regionStatistics, districtStatistics, typeStatistics } = dashboard
const comparisonMetric = ref<'capacity_mwp' | 'annual_gwh'>('capacity_mwp')
const comparison = computed(() => filters.regionId && districtStatistics.value?.status === 'available' ? districtStatistics.value.districts : regionStatistics.value?.regions ?? [])
const sortedRows = computed(() => [...comparison.value].sort((a, b) => (b[comparisonMetric.value] ?? -1) - (a[comparisonMetric.value] ?? -1)))
const max = computed(() => Math.max(0.000001, ...sortedRows.value.map(r => r[comparisonMetric.value] ?? 0)))
const comparisonScope = computed(() => {
  const region = data.value?.regions.regions.find(r => r.id === filters.regionId)
  return region ? regionName(region.wilayah) : t('common.allJakarta')
})
const types = computed(() => [...(typeStatistics.value?.types ?? [])].sort((a, b) => b.capacity_mwp - a.capacity_mwp))
const typeMax = computed(() => Math.max(0.000001, ...types.value.map(r => r.capacity_mwp)))
const active = computed(() => kpis.value.status === 'available' ? kpis.value.data : null)
const circumference = 2 * Math.PI * 48
function chooseRow(id: string) { filters.regionId ? dashboard.setDistrict(id) : dashboard.setRegion(id) }
const rowLabel = (row: typeof comparison.value[number]) => 'kecamatan' in row ? districtName(row.kecamatan) : regionName(row.wilayah)
const valueLabel = (value: number | null) => value === null ? t('common.unavailable') : n(value / 1000)
</script>

<template>
  <section id="analisis" class="analytics-section" aria-labelledby="analytics-title">
    <header class="section-title-row"><div><span id="analytics-title" class="section-eyebrow">{{ t('chart.eyebrow') }}</span></div><span class="scope-pill"><AppIcon name="chart" :size="15" />{{ t('chart.summary') }}</span></header>
    <div class="analytics-grid">
      <article class="chart-card region-chart" data-testid="regional-chart">
        <header><div><h3>{{ t('chart.regionTitle') }}</h3><p>{{ filters.regionId ? t('chart.districtComparison') : t('chart.regionComparison') }}</p></div><span class="chart-unit">{{ comparisonMetric === 'capacity_mwp' ? 'GWp' : t('unit.twhYear') }}</span></header>
        <div class="segmented chart-tabs" :aria-label="t('chart.metric')"><button :aria-pressed="comparisonMetric === 'capacity_mwp'" @click="comparisonMetric = 'capacity_mwp'">{{ t('chart.capacity') }}</button><button :aria-pressed="comparisonMetric === 'annual_gwh'" data-testid="generation-chart-tab" @click="comparisonMetric = 'annual_gwh'">{{ t('chart.energy') }}</button></div>
        <div class="bar-chart" :class="{ 'many-rows': sortedRows.length > 8, 'has-unavailable': sortedRows.some(row => row[comparisonMetric] === null) }">
          <button v-for="row in sortedRows" :key="row.id" class="chart-row" :class="{ 'selected-row': row.id === filters.districtId }" :title="t('chart.click', { name: rowLabel(row), value: valueLabel(row[comparisonMetric]), unit: comparisonMetric === 'capacity_mwp' ? 'GWp' : t('unit.twhYear') })" @click="chooseRow(row.id)">
            <span class="chart-label">{{ rowLabel(row) }}</span><span class="bar-track" :class="{ 'no-data-bar': row[comparisonMetric] === null }" aria-hidden="true"><i :style="{ width: row[comparisonMetric] === null ? '100%' : `${row[comparisonMetric]! / max * 100}%` }" /></span><strong>{{ valueLabel(row[comparisonMetric]) }}</strong>
          </button>
        </div>
        <p v-if="comparisonMetric === 'annual_gwh'" class="chart-caveat">{{ t('chart.energyNote') }}</p>
        <footer class="comparison-footer"><span class="chart-footer-scope"><span class="tiny-dot" />{{ t('common.scope', { scope: comparisonScope }) }}</span><span class="chart-interaction-hint">{{ t(filters.regionId ? 'chart.selectDistrict' : 'chart.selectRegion') }}</span></footer>
      </article>

      <article class="chart-card type-chart" data-testid="type-chart">
        <header><div><h3>{{ t('chart.typeTitle') }}</h3><p>{{ t('chart.typeSubtitle') }}</p></div><span class="chart-unit">MWp</span></header>
        <div class="chart-scope-note"><AppIcon name="globe" :size="14" />{{ t('chart.typeScope') }}</div>
        <div class="bar-chart type-bars">
          <div v-for="(type, i) in types" :key="type.id" class="chart-row" :title="t('chart.typeTooltip', { name: typeName(type.jenis_group), capacity: n(type.capacity_mwp, 3), count: n(type.eligible_buildings, 0) })" tabindex="0">
            <span class="chart-label"><i class="type-dot" :class="`type-${i}`" />{{ typeName(type.jenis_group) }}</span><span class="bar-track" aria-hidden="true"><i :class="`type-${i}`" :style="{ width: `${type.capacity_mwp / typeMax * 100}%` }" /></span><strong>{{ n(type.capacity_mwp, 3) }}</strong>
          </div>
        </div>
        <footer><span class="tiny-dot" />{{ t('chart.categories', { count: n(types.length, 0) }) }}</footer>
      </article>

      <article class="chart-card eligibility-chart" data-testid="eligibility-chart">
        <header><div><h3>{{ t('chart.eligibilityTitle') }}</h3><p>{{ t('chart.population') }}</p></div></header>
        <template v-if="active">
          <div class="donut-layout"><div class="donut"><svg viewBox="0 0 120 120" role="img" :aria-label="t('chart.eligiblePercent', { value: n(ratioToPercent(active.eligibility_rate)) })"><circle cx="60" cy="60" r="48" class="donut-track" /><circle cx="60" cy="60" r="48" class="donut-fill" :stroke-dasharray="`${(active.eligibility_rate ?? 0) * circumference} ${circumference}`" /></svg><div><strong>{{ n(ratioToPercent(active.eligibility_rate)) }}<small>%</small></strong><span>{{ t('kpi.eligible') }}</span></div></div>
          <div class="donut-key"><span><i class="legend-dot teal" />{{ t('chart.eligible') }}<strong>{{ n(active.eligible_buildings, 0) }}</strong></span><span><i class="legend-dot pale" />{{ t('chart.ineligible') }}<strong>{{ n(active.total_buildings - active.eligible_buildings, 0) }}</strong></span></div></div>
          <div class="energy-availability"><span><i class="legend-dot teal" />{{ t('chart.pvout') }}</span><strong>{{ n(ratioToPercent(active.pvout_coverage)) }}%</strong><div class="coverage-track"><span :style="{ width: `${(active.pvout_coverage ?? 0) * 100}%` }" /></div><small>{{ t('chart.missing', { count: n(active.pvout_missing, 0) }) }}</small></div>
        </template>
        <div v-else class="chart-empty"><AppIcon name="info" :size="25" /><p>{{ t('chart.unsupported') }}</p><button class="text-button" @click="dashboard.setBuildingType(null)">{{ t('app.regionalStats') }} <AppIcon name="arrow" :size="14" /></button></div>
        <footer><span class="tiny-dot" />{{ t('common.scope', { scope }) }}</footer>
      </article>
    </div>
  </section>
</template>
