<script setup lang="ts">
withDefaults(defineProps<{ name: string; size?: number }>(), { size: 20 })
const paths: Record<string, string> = {
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5',
  building: 'M4 21V7l8-4v18M12 9h8v12M2 21h20M7 9v2m0 3v2m3-8v2m0 3v2m6-1v2m3-2v2',
  bolt: 'M13 2 4 14h7l-1 8 10-13h-7l0-7Z',
  chart: 'M4 3v17h17M8 16v-5m5 5V7m5 9V4',
  filter: 'M3 5h18M6 12h12m-8 7h4M8 3v4m8 3v4m-4 3v4',
  reset: 'M4 10a8 8 0 1 1 1 8M4 3v7h7',
  arrow: 'M5 12h14m-5-5 5 5-5 5',
  layers: 'm3 8 9-5 9 5-9 5-9-5Zm0 5 9 5 9-5M3 18l9 5 9-5',
  close: 'm6 6 12 12M18 6 6 18',
  info: 'M12 17v-6m0-4v.01M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20',
  pin: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
  expand: 'M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5',
  extent: 'M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5M8 8h8v8H8Z',
  cursor: 'm4 3 5 18 3-8 8-3L4 3Z',
  check: 'm5 12 4 4L19 6',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
  globe: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20M2 12h20M12 2c-5 5-5 15 0 20 5-5 5-15 0-20',
}
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="paths[name] || paths.info" /></svg>
</template>
