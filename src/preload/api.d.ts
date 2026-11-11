import type { GradeKiwiApi } from '../shared/ipc'
declare global {
  interface Window {
    gk: GradeKiwiApi
  }
}
export {}
