<script setup lang="ts">
import { computed } from 'vue'
import type { KpiSelection } from '../../types/dashboard.ts'
import { numberId } from '../../utils/presentation.ts'
import { ratioToPercent } from '../../utils/format.ts'
import AppIcon from '../AppIcon.vue'
const props = defineProps<{ selection: KpiSelection | { status: 'not-ready' }; scope: string }>()
const k = computed(() => props.selection.status === 'available' ? props.selection.data : null)
</script>

<template>
  <section class="coverage-card" aria-label="Cakupan data PVOUT">
    <div class="section-eyebrow"><span class="status-dot" /> KUALITAS CAKUPAN</div>
    <h3>Di balik estimasi energi.</h3>
    <template v-if="k">
      <div class="coverage-value"><strong>{{ numberId(ratioToPercent(k.pvout_coverage)) }}<small>%</small></strong><span>bangunan layak<br>memiliki PVOUT</span></div>
      <div class="coverage-track" role="img" :aria-label="`${numberId(ratioToPercent(k.pvout_coverage))}% memiliki PVOUT`"><span :style="{ width: `${(k.pvout_coverage ?? 0) * 100}%` }" /></div>
      <div class="coverage-counts"><span><i class="legend-dot teal" />Tersedia<strong>{{ numberId(k.pvout_available, 0) }}</strong></span><span><i class="legend-dot amber" />Belum tersedia<strong>{{ numberId(k.pvout_missing, 0) }}</strong></span></div>
      <p v-if="k.capacity_coverage.status === 'available'" class="capacity-coverage">Cakupan menurut kapasitas <strong>{{ numberId(ratioToPercent(k.capacity_coverage.data.pvout_capacity_coverage)) }}%</strong></p>
      <p v-if="k.pvout_missing > 0" class="coverage-footnote"><AppIcon name="info" :size="14" />Energi hanya mencakup bangunan dengan PVOUT.</p>
    </template>
    <p v-else class="muted">Cakupan statistik tidak tersedia untuk kombinasi ini.</p>
    <div class="scope-footnote">Cakupan: {{ scope }}</div>
  </section>
</template>
