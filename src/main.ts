import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { dashboardKey } from './composables/useDashboard.ts'
import { createDashboardStore } from './stores/dashboard.ts'
import { createSolarDataService } from './services/solarDataService.ts'
import { createI18n, i18nKey } from './i18n/index.ts'

const app = createApp(App)
let storage: Storage | undefined
try { storage = window.localStorage } catch { /* Optional in private or restricted browsers. */ }
app.provide(i18nKey, createI18n(storage))
app.provide(dashboardKey, createDashboardStore(createSolarDataService({ baseUrl: `${import.meta.env.BASE_URL}data/` })))
app.mount('#app')
