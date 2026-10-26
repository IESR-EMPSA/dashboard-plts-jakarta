<script setup lang="ts">
import { computed, ref } from 'vue'
import { useDashboard } from '../../composables/useDashboard.ts'
import { numberId, shortRegionName } from '../../utils/presentation.ts'
import { ratioToPercent } from '../../utils/format.ts'
import AppIcon from '../AppIcon.vue'

defineProps<{ scope: string }>()
const dashboard = useDashboard()
const { data, filters, kpis, regionStatistics, districtStatistics, typeStatistics } = dashboard
const comparisonMetric = ref<'capacity_mwp' | 'annual_gwh'>('capacity_mwp')
const comparison = computed(() => filters.regionId && districtStatistics.value?.status === 'available' ? districtStatistics.value.districts : regionStatistics.value?.regions ?? [])
const sortedRows = computed(() => [...comparison.value].sort((a, b) => (b[comparisonMetric.value] ?? -1) - (a[comparisonMetric.value] ?? -1)))
const max = computed(() => Math.max(0.000001, ...sortedRows.value.map(r => r[comparisonMetric.value] ?? 0)))
const comparisonScope = computed(() => data.value?.regions.regions.find(r => r.id === filters.regionId)?.wilayah ?? 'Seluruh DKI Jakarta')
const types = computed(() => [...(typeStatistics.value?.types ?? [])].sort((a, b) => b.capacity_mwp - a.capacity_mwp))
const typeMax = computed(() => Math.max(0.000001, ...types.value.map(r => r.capacity_mwp)))
const active = computed(() => kpis.value.status === 'available' ? kpis.value.data : null)
const circumference = 2 * Math.PI * 48
function chooseRow(id: string) { filters.regionId ? dashboard.setDistrict(id) : dashboard.setRegion(id) }
const rowLabel = (row: typeof comparison.value[number]) => 'kecamatan' in row ? row.kecamatan : shortRegionName(row.wilayah)
const valueLabel = (value: number | null) => value === null ? 'Tidak tersedia' : numberId(value / 1000)
</script>

<template>
  <section id="analisis" class="analytics-section" aria-labelledby="analytics-title">
    <header class="section-title-row"><div><span class="section-eyebrow">PERSPEKTIF DARI DATA</span></div><span class="scope-pill"><AppIcon name="chart" :size="15" />Ringkasan pemodelan</span></header>
    <div class="analytics-grid">
      <article class="chart-card region-chart" data-testid="regional-chart">
        <header><div><h3>Di mana potensi terbesarnya?</h3><p>{{ filters.regionId ? 'Perbandingan kecamatan' : 'Perbandingan kabupaten / kota' }}</p></div><span class="chart-unit">{{ comparisonMetric === 'capacity_mwp' ? 'GWp' : 'TWh/tahun' }}</span></header>
        <div class="segmented chart-tabs" aria-label="Metrik perbandingan"><button :aria-pressed="comparisonMetric === 'capacity_mwp'" @click="comparisonMetric = 'capacity_mwp'">Kapasitas surya</button><button :aria-pressed="comparisonMetric === 'annual_gwh'" data-testid="generation-chart-tab" @click="comparisonMetric = 'annual_gwh'">Energi tahunan</button></div>
        <div class="bar-chart" :class="{ 'many-rows': sortedRows.length > 8 }">
          <button v-for="row in sortedRows" :key="row.id" class="chart-row" :class="{ 'selected-row': row.id === filters.districtId }" :title="`${rowLabel(row)}: ${valueLabel(row[comparisonMetric])} ${comparisonMetric === 'capacity_mwp' ? 'GWp' : 'TWh/tahun'}. Klik untuk menganalisis.`" @click="chooseRow(row.id)">
            <span class="chart-label">{{ rowLabel(row) }}</span><span class="bar-track" :class="{ 'no-data-bar': row[comparisonMetric] === null }" aria-hidden="true"><i :style="{ width: row[comparisonMetric] === null ? '100%' : `${row[comparisonMetric]! / max * 100}%` }" /></span><strong>{{ valueLabel(row[comparisonMetric]) }}</strong>
          </button>
        </div>
        <p v-if="comparisonMetric === 'annual_gwh'" class="chart-caveat">Energi hanya untuk bangunan dengan PVOUT; arsiran menandai data tidak tersedia.</p>
        <footer><span class="tiny-dot" />Cakupan: {{ comparisonScope }}<small>Klik bar untuk menjelajah <AppIcon name="arrow" :size="13" /></small></footer>
      </article>

      <article class="chart-card type-chart" data-testid="type-chart">
        <header><div><h3>Atap untuk beragam aktivitas.</h3><p>Distribusi kapasitas menurut jenis bangunan</p></div><span class="chart-unit">MWp</span></header>
        <div class="chart-scope-note"><AppIcon name="globe" :size="14" />Seluruh DKI Jakarta · tidak mengikuti filter wilayah</div>
        <div class="bar-chart type-bars">
          <div v-for="(type, i) in types" :key="type.id" class="chart-row" :title="`${type.jenis_group}: ${numberId(type.capacity_mwp, 3)} MWp; ${numberId(type.eligible_buildings, 0)} bangunan layak`" tabindex="0">
            <span class="chart-label"><i class="type-dot" :class="`type-${i}`" />{{ type.jenis_group }}</span><span class="bar-track" aria-hidden="true"><i :class="`type-${i}`" :style="{ width: `${type.capacity_mwp / typeMax * 100}%` }" /></span><strong>{{ numberId(type.capacity_mwp, 3) }}</strong>
          </div>
        </div>
        <footer><span class="tiny-dot" />{{ types.length }} kategori, termasuk jenis tidak diketahui</footer>
      </article>

      <article class="chart-card eligibility-chart" data-testid="eligibility-chart">
        <header><div><h3>Seberapa banyak yang layak?</h3><p>Seluruh populasi bangunan dianalisis</p></div></header>
        <template v-if="active">
          <div class="donut-layout"><div class="donut"><svg viewBox="0 0 120 120" role="img" :aria-label="`${numberId(ratioToPercent(active.eligibility_rate))}% bangunan memenuhi kriteria`"><circle cx="60" cy="60" r="48" class="donut-track" /><circle cx="60" cy="60" r="48" class="donut-fill" :stroke-dasharray="`${(active.eligibility_rate ?? 0) * circumference} ${circumference}`" /></svg><div><strong>{{ numberId(ratioToPercent(active.eligibility_rate)) }}<small>%</small></strong><span>bangunan layak</span></div></div>
          <div class="donut-key"><span><i class="legend-dot teal" />Layak<strong>{{ numberId(active.eligible_buildings, 0) }}</strong></span><span><i class="legend-dot pale" />Tidak layak<strong>{{ numberId(active.total_buildings - active.eligible_buildings, 0) }}</strong></span></div></div>
          <div class="energy-availability"><span><i class="legend-dot teal" />Cakupan PVOUT</span><strong>{{ numberId(ratioToPercent(active.pvout_coverage)) }}%</strong><div class="coverage-track"><span :style="{ width: `${(active.pvout_coverage ?? 0) * 100}%` }" /></div><small>{{ numberId(active.pvout_missing, 0) }} bangunan layak tanpa PVOUT</small></div>
        </template>
        <div v-else class="chart-empty"><AppIcon name="info" :size="25" /><p>Statistik gabungan belum tersedia.</p><button class="text-button" @click="dashboard.setBuildingType(null)">Lihat statistik wilayah <AppIcon name="arrow" :size="14" /></button></div>
        <footer><span class="tiny-dot" />Cakupan: {{ scope }}</footer>
      </article>
    </div>
  </section>
</template>
