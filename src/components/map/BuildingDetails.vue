<script setup lang="ts">
import { useI18n } from '../../i18n/index.ts'
import type { NormalizedBuildingProperties } from '../../types/dashboard.ts'
import AppIcon from '../AppIcon.vue'

const { t, n, regionName, districtName, typeName } = useI18n()

defineProps<{ building: Readonly<NormalizedBuildingProperties> }>()
defineEmits<{ close: [] }>()
</script>

<template>
  <aside class="building-details" data-testid="building-details" :aria-label="t('detail.label')" aria-live="polite">
    <header><div><span class="section-eyebrow">{{ t('detail.eyebrow') }}</span><h3>{{ t('detail.title') }}</h3></div><button class="icon-button" :aria-label="t('detail.close')" @click="$emit('close')"><AppIcon name="close" :size="18" /></button></header>
    <div class="detail-body">
      <div class="building-id"><span>{{ t('detail.id') }}</span><strong data-testid="building-id">{{ building.building_uid }}</strong><span class="category-tag">{{ typeName(building.jenis_group) }}</span></div>
      <p class="detail-location"><AppIcon name="pin" :size="17" /><span>{{ districtName(building.WADMKC) }}<small>{{ regionName(building.WADMKK) }}</small></span></p>
      <div class="detail-capacity"><span>{{ t('detail.capacity') }}</span><strong>{{ n(building.capacity_kwp) }} <small>kWp</small></strong></div>
      <dl class="detail-metrics">
        <div><dt>{{ t('detail.footprint') }}</dt><dd>{{ n(building.area_m2) }} <small>m²</small></dd></div>
        <div><dt>{{ t('detail.usable') }}</dt><dd>{{ n(building.usable_m2) }} <small>m²</small></dd></div>
        <div><dt>{{ t('detail.pvout') }}</dt><dd>{{ n(building.pvout_1) }}<small v-if="building.pvout_1 !== null">{{ t('unit.pvoutYear') }}</small></dd></div>
        <div><dt>{{ t('kpi.generation') }}</dt><dd data-testid="building-generation">{{ n(building.annual_kwh) }}<small v-if="building.annual_kwh !== null">{{ t('unit.kwhYear') }}</small></dd></div>
      </dl>
      <p v-if="building.pvout_status === 'NoData'" class="coverage-warning"><AppIcon name="info" :size="16" />{{ t('common.pvoutMissing') }}</p>
      <p class="detail-disclaimer">{{ t('detail.disclaimer') }}</p>
    </div>
  </aside>
</template>
