<script setup lang="ts">
import { ref } from 'vue'
import AppIcon from '../AppIcon.vue'
const dialog = ref<HTMLDialogElement | null>(null)
defineExpose({ open: () => dialog.value?.showModal() })
</script>

<template>
  <dialog ref="dialog" class="methodology-dialog" aria-labelledby="methodology-title" @click="event => { if (event.target === dialog) dialog?.close() }">
    <header><div><span class="section-eyebrow">DI BALIK ANGKA</span><h2 id="methodology-title">Data, metode, dan batasannya.</h2></div><button class="icon-button" aria-label="Tutup metodologi" @click="dialog?.close()"><AppIcon name="close" /></button></header>
    <div class="methodology-content">
      <p class="methodology-lead">Dashboard ini mengeksplorasi <strong>potensi teknis PLTS atap</strong> dari hasil analisis GIS. Angka ini bukan inventaris instalasi dan bukan jaminan kelayakan setiap lokasi.</p>
      <h3>Dari tapak bangunan menjadi potensi surya</h3>
      <ol class="method-steps"><li><strong>Seleksi bangunan</strong><span>Metode terdokumentasi menggunakan setback 1 m dan ambang luas tersedia 28 m². Rincian algoritme sumber masih memerlukan verifikasi akhir.</span></li><li><strong>Kapasitas potensial</strong><span>Roof Utilization Factor 0,33 diterapkan pada tapak bangunan layak, dengan asumsi kebutuhan area 4,8 m²/kWp.</span></li><li><strong>Estimasi listrik</strong><span>Kapasitas dikombinasikan dengan hasil spesifik PVOUT Global Solar Atlas. Hanya bangunan dengan PVOUT yang memiliki estimasi energi.</span></li></ol>
      <h3>Cakupan yang perlu dibaca bersama angkanya</h3>
      <p>Bangunan tanpa PVOUT tetap memiliki kapasitas potensial, tetapi energi tahunan ditampilkan sebagai tidak tersedia. Tingkat kelayakan menggunakan seluruh bangunan yang dianalisis, termasuk bangunan tidak layak yang tidak ditampilkan di peta.</p>
      <p>Statistik kabupaten/kota, kecamatan, dan jenis bangunan berasal dari ringkasan yang telah dihitung. Statistik gabungan wilayah × jenis belum tersedia. Grafik jenis bangunan tetap berlingkup DKI Jakarta.</p>
    </div>
  </dialog>
</template>
