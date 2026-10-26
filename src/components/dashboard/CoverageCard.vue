<script setup lang="ts">
import { useI18n } from '../../i18n/index.ts'
import { computed } from 'vue'
import type { KpiSelection } from '../../types/dashboard.ts'
import { ratioToPercent } from '../../utils/format.ts'
import AppIcon from '../AppIcon.vue'

const { t, n } = useI18n()

const props = defineProps<{ selection: KpiSelection | { status: 'not-ready' }; scope: string }>()
const k = computed(() => props.selection.status === 'available' ? props.selection.data : null)
</script>

<template>
  <section class="coverage-card" :aria-label="t('coverage.label')">
    <div class="section-eyebrow"><span class="status-dot" /> {{ t('coverage.eyebrow') }}</div>
    <h3>{{ t('coverage.title') }}</h3>
    <template v-if="k">
      <div class="coverage-value"><strong>{{ n(ratioToPercent(k.pvout_coverage)) }}<small>%</small></strong><span>{{ t('coverage.explanation') }}</span></div>
      <div class="coverage-track" role="img" :aria-label="t('coverage.percent', { value: n(ratioToPercent(k.pvout_coverage)) })"><span :style="{ width: `${(k.pvout_coverage ?? 0) * 100}%` }" /></div>
      <div class="coverage-counts"><span><i class="legend-dot teal" />{{ t('common.available') }}<strong>{{ n(k.pvout_available, 0) }}</strong></span><span><i class="legend-dot amber" />{{ t('common.notYetAvailable') }}<strong>{{ n(k.pvout_missing, 0) }}</strong></span></div>
      <p v-if="k.capacity_coverage.status === 'available'" class="capacity-coverage">{{ t('coverage.capacity') }} <strong>{{ n(ratioToPercent(k.capacity_coverage.data.pvout_capacity_coverage)) }}%</strong></p>
      <p v-if="k.pvout_missing > 0" class="coverage-footnote"><AppIcon name="info" :size="14" />{{ t('common.energyOnly') }}</p>
    </template>
    <p v-else class="muted">{{ t('coverage.unsupported') }}</p>
    <div class="scope-footnote">{{ t('common.scope', { scope }) }}</div>
  </section>
</template>
