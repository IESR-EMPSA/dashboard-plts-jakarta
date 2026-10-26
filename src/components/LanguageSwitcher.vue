<script setup lang="ts">
import { useI18n } from '../i18n/index.ts'
const { locale, setLocale, t } = useI18n()
</script>

<template>
  <div class="language-switcher" role="group" :aria-label="t('language.label')">
    <button type="button" :lang="locale" data-testid="language-id" :aria-label="t('language.id')" :title="t('language.id')" :aria-pressed="locale === 'id'" @click="setLocale('id')">ID</button>
    <button type="button" :lang="locale" data-testid="language-en" :aria-label="t('language.en')" :title="t('language.en')" :aria-pressed="locale === 'en'" @click="setLocale('en')">EN</button>
  </div>
</template>
