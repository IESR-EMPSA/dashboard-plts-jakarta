export type DataErrorCode = 'network' | 'http' | 'timeout' | 'parse' | 'validation' |
  'integrity' | 'version' | 'invalid-filter' | 'invalid-building'

export class SolarDataError extends Error {
  readonly code: DataErrorCode
  readonly resource: string | undefined
  readonly status: number | undefined

  constructor(code: DataErrorCode, message: string, options: { resource?: string; status?: number; cause?: unknown } = {}) {
    super(message, { cause: options.cause })
    this.name = 'SolarDataError'
    this.code = code
    this.resource = options.resource
    this.status = options.status
  }
}

export function assertData(condition: unknown, message: string): asserts condition {
  if (!condition) throw new SolarDataError('validation', message)
}

export function asDataError(error: unknown): SolarDataError {
  return error instanceof SolarDataError ? error : new SolarDataError('network',
    error instanceof Error ? error.message : 'Unable to load solar data', { cause: error })
}
