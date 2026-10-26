<script setup lang="ts">
import AppIcon from '../AppIcon.vue'
defineProps<{ error?: Error | null }>()
const reload = () => window.location.reload()
</script>

<template>
  <div class="map-placeholder" :role="error ? 'alert' : 'status'">
    <AppIcon name="globe" :size="45" />
    <strong>{{ error ? 'Peta belum dapat dimuat' : 'Menyiapkan eksplorasi Jakarta…' }}</strong>
    <span>{{ error ? error.message : 'Memuat peta dan lapisan penelitian' }}</span>
    <button v-if="error" class="button button-outline" @click="reload">Muat ulang</button>
  </div>
</template>
