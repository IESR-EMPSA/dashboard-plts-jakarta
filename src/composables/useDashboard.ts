import { inject } from 'vue'
import type { InjectionKey } from 'vue'
import type { DashboardStore } from '../stores/dashboard.ts'

export const dashboardKey: InjectionKey<DashboardStore> = Symbol('jakarta-solar-dashboard')

/** Provide a single store at the app/root level; components share cache and filter state. */
export function useDashboard(): DashboardStore {
  const store = inject(dashboardKey)
  if (!store) throw new Error('Provide a DashboardStore using dashboardKey before calling useDashboard()')
  return store
}
