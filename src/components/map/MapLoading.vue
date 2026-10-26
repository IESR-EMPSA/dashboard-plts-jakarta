<script setup lang="ts">
import { useI18n } from '../../i18n/index.ts'
import AppIcon from '../AppIcon.vue'

const { t, errorMessage } = useI18n()

defineProps<{ error?: Error | null }>()
const reload = () => window.location.reload()
</script>

<template>
  <div class="map-placeholder" :role="error ? 'alert' : 'status'">
    <AppIcon name="globe" :size="45" />
    <strong>{{ error ? t('loading.mapError') : t('loading.preparing') }}</strong>
    <span>{{ error ? errorMessage(error) : t('loading.layers') }}</span>
    <button v-if="error" class="button button-outline" @click="reload">{{ t('loading.reload') }}</button>
  </div>
</template>
