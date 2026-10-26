import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { dashboardKey } from './composables/useDashboard.ts'
import { createDashboardStore } from './stores/dashboard.ts'
import { createSolarDataService } from './services/solarDataService.ts'

const app = createApp(App)
app.provide(dashboardKey, createDashboardStore(createSolarDataService({ baseUrl: `${import.meta.env.BASE_URL}data/` })))
app.mount('#app')
