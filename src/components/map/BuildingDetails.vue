<script setup lang="ts">
import type { NormalizedBuildingProperties } from '../../types/dashboard.ts'
import { numberId } from '../../utils/presentation.ts'
import AppIcon from '../AppIcon.vue'
defineProps<{ building: Readonly<NormalizedBuildingProperties> }>()
defineEmits<{ close: [] }>()
</script>

<template>
  <aside class="building-details" data-testid="building-details" aria-label="Detail bangunan terpilih" aria-live="polite">
    <header><div><span class="section-eyebrow">INSPEKSI BANGUNAN</span><h3>Potensi di satu atap.</h3></div><button class="icon-button" aria-label="Tutup detail bangunan" @click="$emit('close')"><AppIcon name="close" :size="18" /></button></header>
    <div class="detail-body">
      <div class="building-id"><span>ID BANGUNAN</span><strong data-testid="building-id">{{ building.building_uid }}</strong><span class="category-tag">{{ building.jenis_group }}</span></div>
      <p class="detail-location"><AppIcon name="pin" :size="17" /><span>{{ building.WADMKC }}<small>{{ building.WADMKK }}</small></span></p>
      <div class="detail-capacity"><span>Potensi kapasitas</span><strong>{{ numberId(building.capacity_kwp) }} <small>kWp</small></strong></div>
      <dl class="detail-metrics">
        <div><dt>Luas tapak bangunan</dt><dd>{{ numberId(building.area_m2) }} <small>m²</small></dd></div>
        <div><dt>Luas atap efektif</dt><dd>{{ numberId(building.usable_m2) }} <small>m²</small></dd></div>
        <div><dt>Hasil spesifik PVOUT</dt><dd>{{ numberId(building.pvout_1) }}<small v-if="building.pvout_1 !== null">kWh/kWp/tahun</small></dd></div>
        <div><dt>Estimasi listrik tahunan</dt><dd data-testid="building-generation">{{ numberId(building.annual_kwh) }}<small v-if="building.annual_kwh !== null">kWh/tahun</small></dd></div>
      </dl>
      <p v-if="building.pvout_status === 'NoData'" class="coverage-warning"><AppIcon name="info" :size="16" />PVOUT belum tersedia. Kapasitas tetap dimodelkan; listrik tahunan tidak dianggap nol.</p>
      <p class="detail-disclaimer">Estimasi berbasis pemodelan. Kelayakan struktur, bayangan, dan koneksi jaringan memerlukan kajian tapak.</p>
    </div>
  </aside>
</template>
