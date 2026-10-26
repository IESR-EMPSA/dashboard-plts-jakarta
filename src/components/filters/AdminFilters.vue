<script setup lang="ts">
import { useDashboard } from '../../composables/useDashboard.ts'
import AppIcon from '../AppIcon.vue'

defineEmits<{ reset: []; methodology: [] }>()
const { filters, regionOptions, districtOptions, typeOptions, status, setRegion, setDistrict, setBuildingType } = useDashboard()
const value = (event: Event) => (event.target as HTMLSelectElement).value || null
</script>

<template>
  <section class="filter-card">
    <div class="section-eyebrow"><AppIcon name="filter" :size="16" /> EKSPLORASI WILAYAH</div>
    <h2>Mulai dari sebuah area.</h2>
    <p class="muted filter-intro">Bandingkan potensi surya di seluruh Jakarta hingga tingkat kecamatan.</p>
    <label class="field-label" for="region">Kabupaten / kota</label>
    <select id="region" data-testid="region-filter" aria-label="Kabupaten/kota" :value="filters.regionId || ''" :disabled="status !== 'ready'" @change="setRegion(value($event))">
      <option value="">Seluruh DKI Jakarta</option><option v-for="r in regionOptions" :key="r.id" :value="r.id">{{ r.wilayah }}</option>
    </select>
    <label class="field-label" for="district">Kecamatan</label>
    <select id="district" data-testid="district-filter" aria-label="Kecamatan" :value="filters.districtId || ''" :disabled="!filters.regionId || status !== 'ready'" @change="setDistrict(value($event))">
      <option value="">{{ filters.regionId ? 'Semua kecamatan' : 'Pilih kabupaten / kota dahulu' }}</option><option v-for="d in districtOptions" :key="d.id" :value="d.id">{{ d.kecamatan }}</option>
    </select>
    <div class="filter-divider" />
    <label class="field-label" for="building-type">Jenis bangunan <span class="small-badge">Opsional</span></label>
    <select id="building-type" data-testid="type-filter" aria-label="Jenis bangunan" :value="filters.typeId || ''" :disabled="status !== 'ready'" @change="setBuildingType(value($event))">
      <option value="">Semua jenis bangunan</option><option v-for="t in typeOptions" :key="t.id" :value="t.id">{{ t.jenis_group }}</option>
    </select>
    <p class="field-hint">Statistik gabungan wilayah × jenis belum tersedia. Pilihan jenis tetap menyaring peta.</p>
    <button class="button button-quiet reset-filters" @click="$emit('reset')"><AppIcon name="reset" :size="16" /> Reset semua filter</button>
    <div class="research-note"><AppIcon name="info" :size="18" /><p>Yang ditampilkan adalah <strong>potensi teknis</strong>, bukan kapasitas PLTS yang sudah terpasang.</p></div>
    <button class="text-button methodology-link" @click="$emit('methodology')">Tentang data & metodologi <AppIcon name="arrow" :size="15" /></button>
  </section>
</template>
