<script setup lang="ts">
import { useI18n } from '../../i18n/index.ts'
import { useDashboard } from '../../composables/useDashboard.ts'
import AppIcon from '../AppIcon.vue'

const { t, regionName, districtName, typeName } = useI18n()

defineEmits<{ reset: []; methodology: [] }>()
const { filters, regionOptions, districtOptions, typeOptions, status, setRegion, setDistrict, setBuildingType } = useDashboard()
const value = (event: Event) => (event.target as HTMLSelectElement).value || null
</script>

<template>
  <section class="filter-card" aria-labelledby="area-filters-title">
    <h2 id="area-filters-title" class="section-eyebrow"><AppIcon name="filter" :size="16" /> {{ t('filter.eyebrow') }}</h2>
    <label class="field-label" for="region">{{ t('filter.region') }}</label>
    <select id="region" data-testid="region-filter" :aria-label="t('filter.region')" :value="filters.regionId || ''" :disabled="status !== 'ready'" @change="setRegion(value($event))">
      <option value="">{{ t('common.allJakarta') }}</option><option v-for="r in regionOptions" :key="r.id" :value="r.id">{{ regionName(r.wilayah) }}</option>
    </select>
    <label class="field-label" for="district">{{ t('filter.district') }}</label>
    <select id="district" data-testid="district-filter" :aria-label="t('filter.district')" :value="filters.districtId || ''" :disabled="!filters.regionId || status !== 'ready'" @change="setDistrict(value($event))">
      <option value="">{{ filters.regionId ? t('filter.allDistricts') : t('filter.chooseRegion') }}</option><option v-for="d in districtOptions" :key="d.id" :value="d.id">{{ districtName(d.kecamatan) }}</option>
    </select>
    <div class="filter-divider" />
    <label class="field-label" for="building-type">{{ t('filter.type') }} <span class="small-badge">{{ t('filter.optional') }}</span></label>
    <select id="building-type" data-testid="type-filter" :aria-label="t('filter.type')" :value="filters.typeId || ''" :disabled="status !== 'ready'" @change="setBuildingType(value($event))">
      <option value="">{{ t('filter.allTypes') }}</option><option v-for="type in typeOptions" :key="type.id" :value="type.id">{{ typeName(type.jenis_group) }}</option>
    </select>
    <button class="button button-quiet reset-filters" @click="$emit('reset')"><AppIcon name="reset" :size="16" /> {{ t('filter.reset') }}</button>
    <div class="research-note"><AppIcon name="info" :size="18" /><p>{{ t('filter.note') }}</p></div>
    <button class="text-button methodology-link" @click="$emit('methodology')">{{ t('filter.methodology') }} <AppIcon name="arrow" :size="15" /></button>
  </section>
</template>
