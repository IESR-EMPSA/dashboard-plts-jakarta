<script setup lang="ts">
import { useI18n } from '../../i18n/index.ts'
import { ref } from 'vue'
import AppIcon from '../AppIcon.vue'

const { t } = useI18n()

const dialog = ref<HTMLDialogElement | null>(null)
defineExpose({ open: () => dialog.value?.showModal() })
</script>

<template>
  <dialog ref="dialog" class="methodology-dialog" aria-labelledby="methodology-title" @click="event => { if (event.target === dialog) dialog?.close() }">
    <header><div><span class="section-eyebrow">{{ t('method.eyebrow') }}</span><h2 id="methodology-title">{{ t('method.title') }}</h2></div><button class="icon-button" :aria-label="t('method.close')" @click="dialog?.close()"><AppIcon name="close" /></button></header>
    <div class="methodology-content">
      <p class="methodology-lead">{{ t('method.lead') }}</p>
      <h3>{{ t('method.process') }}</h3>
      <ol class="method-steps"><li><strong>{{ t('method.selection') }}</strong><span>{{ t('method.selectionText') }}</span></li><li><strong>{{ t('method.capacity') }}</strong><span>{{ t('method.capacityText') }}</span></li><li><strong>{{ t('method.energy') }}</strong><span>{{ t('method.energyText') }}</span></li></ol>
      <h3>{{ t('method.coverage') }}</h3>
      <p>{{ t('method.nulls') }}</p>
      <p>{{ t('method.scopes') }}</p>
    </div>
  </dialog>
</template>
