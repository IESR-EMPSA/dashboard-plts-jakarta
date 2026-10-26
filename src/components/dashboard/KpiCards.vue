<script setup lang="ts">
import { computed } from 'vue'
import type { KpiSelection } from '../../types/dashboard.ts'
import { mwpToGwp, gwhToTwh, ratioToPercent } from '../../utils/format.ts'
import { numberId } from '../../utils/presentation.ts'
import AppIcon from '../AppIcon.vue'

const props = defineProps<{ selection: KpiSelection | { status: 'not-ready' }; loading: boolean }>()
const kpis = computed(() => props.selection.status === 'available' ? props.selection.data : null)
const cards = computed(() => [
  { key: 'eligible', icon: 'building', label: 'Bangunan layak', value: kpis.value ? numberId(kpis.value.eligible_buildings, 0) : '—', unit: 'bangunan',
    note: 'Memenuhi kriteria pemodelan', accent: 'teal' },
  { key: 'capacity', icon: 'sun', label: 'Potensi kapasitas surya', value: kpis.value ? numberId(mwpToGwp(kpis.value.capacity_mwp)) : '—', unit: 'GWp',
    note: kpis.value ? `${numberId(kpis.value.capacity_mwp, 3)} MWp kapasitas potensial` : 'Statistik tidak tersedia', accent: 'orange' },
  { key: 'generation', icon: 'bolt', label: 'Estimasi listrik tahunan', value: kpis.value ? kpis.value.annual_gwh === null ? 'Tidak tersedia' : numberId(gwhToTwh(kpis.value.annual_gwh)) : '—', unit: 'TWh/tahun',
    note: 'Hanya bangunan dengan PVOUT', accent: 'blue' },
  { key: 'eligibility', icon: 'chart', label: 'Tingkat kelayakan', value: kpis.value ? numberId(ratioToPercent(kpis.value.eligibility_rate)) : '—', unit: '%',
    note: kpis.value ? `Dari ${numberId(kpis.value.total_buildings, 0)} bangunan dianalisis` : 'Menggunakan seluruh populasi bangunan', accent: 'teal' },
])
</script>

<template>
  <section class="kpi-grid" aria-label="Indikator utama">
    <article v-for="card in cards" :key="card.key" class="kpi-card" :class="[card.accent, { 'is-loading': loading }]" :data-testid="`kpi-${card.key}`">
      <div class="kpi-heading"><span>{{ card.label }}</span><span class="metric-icon"><AppIcon :name="card.icon" :size="19" /></span></div>
      <div class="kpi-number" :class="{ 'unavailable-value': card.value === 'Tidak tersedia' }"><strong>{{ card.value }}</strong><span>{{ card.unit }}</span></div>
      <p><span class="tiny-dot" />{{ card.note }}</p>
    </article>
  </section>
</template>
