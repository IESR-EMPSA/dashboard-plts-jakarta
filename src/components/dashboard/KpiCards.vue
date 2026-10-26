<script setup lang="ts">
import { useI18n } from '../../i18n/index.ts'
import { computed } from 'vue'
import type { KpiSelection } from '../../types/dashboard.ts'
import { mwpToGwp, gwhToTwh, ratioToPercent } from '../../utils/format.ts'
import AppIcon from '../AppIcon.vue'

const { t, n } = useI18n()

const props = defineProps<{ selection: KpiSelection | { status: 'not-ready' }; loading: boolean }>()
const kpis = computed(() => props.selection.status === 'available' ? props.selection.data : null)
const cards = computed(() => [
  { key: 'eligible', icon: 'building', label: t('kpi.eligible'), value: kpis.value ? n(kpis.value.eligible_buildings, 0) : '—', unit: t('common.buildings'),
    note: t('kpi.eligibleNote'), accent: 'teal' },
  { key: 'capacity', icon: 'sun', label: t('kpi.capacity'), value: kpis.value ? n(mwpToGwp(kpis.value.capacity_mwp)) : '—', unit: 'GWp',
    note: kpis.value ? t('kpi.capacityNote', { value: n(kpis.value.capacity_mwp, 3) }) : t('kpi.statsUnavailable'), accent: 'orange' },
  { key: 'generation', icon: 'bolt', label: t('kpi.generation'), value: kpis.value ? kpis.value.annual_gwh === null ? t('common.unavailable') : n(gwhToTwh(kpis.value.annual_gwh)) : '—', unit: t('unit.twhYear'),
    note: t('kpi.generationNote'), accent: 'blue' },
  { key: 'eligibility', icon: 'chart', label: t('kpi.eligibility'), value: kpis.value ? n(ratioToPercent(kpis.value.eligibility_rate)) : '—', unit: '%',
    note: kpis.value ? t('kpi.denominator', { count: n(kpis.value.total_buildings, 0) }) : t('kpi.population'), accent: 'teal' },
])
</script>

<template>
  <section class="kpi-grid" :aria-label="t('kpi.label')">
    <article v-for="card in cards" :key="card.key" class="kpi-card" :class="[card.accent, { 'is-loading': loading }]" :data-testid="`kpi-${card.key}`">
      <div class="kpi-heading"><span>{{ card.label }}</span><span class="metric-icon"><AppIcon :name="card.icon" :size="19" /></span></div>
      <div class="kpi-number" :class="{ 'unavailable-value': card.value === t('common.unavailable') }"><strong>{{ card.value }}</strong><span>{{ card.unit }}</span></div>
      <p><span class="tiny-dot" />{{ card.note }}</p>
    </article>
  </section>
</template>
