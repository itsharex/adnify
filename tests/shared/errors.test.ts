/**
 * 错误处理模块测试
 */

import { describe, it, expect } from 'vitest'
import {
  AppError,
  ErrorCode,
  ERROR_MESSAGES,
  isRetryableError,
  formatErrorMessage,
  createErrorHandler,
} from '../../src/shared/errors'

describe('AppError', () => {
  describe('constructor', () => {
    it('should create error with code', () => {
      const error = new AppError(ErrorCode.FILE_NOT_FOUND)
      expect(error.code).toBe(ErrorCode.FILE_NOT_FOUND)
      expect(error.message).toBe(ERROR_MESSAGES[ErrorCode.FILE_NOT_FOUND].description)
    })

    it('should create error with custom message', () => {
      const error = new AppError(ErrorCode.FILE_NOT_FOUND, 'Custom message')
      expect(error.message).toBe('Custom message')
    })

    it('should create error with details', () => {
      const error = new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid', {
        details: { field: 'name' },
      })
      expect(error.details).toEqual({ field: 'name' })
    })

    it('should set retryable flag', () => {
      const error = new AppError(ErrorCode.TIMEOUT, 'Timeout', { retryable: true })
      expect(error.retryable).toBe(true)
    })

    it('should set timestamp', () => {
      const before = Date.now()
      const error = new AppError(ErrorCode.UNKNOWN)
      const after = Date.now()
      expect(error.timestamp).toBeGreaterThanOrEqual(before)
      expect(error.timestamp).toBeLessThanOrEqual(after)
    })
  })

  describe('getUserMessage', () => {
    it('should return user-friendly message', () => {
      const error = new AppError(ErrorCode.LLM_RATE_LIMIT)
      const msg = error.getUserMessage()
      expect(msg.title).toBe('Rate Limited')
      expect(msg.description).toBeDefined()
      expect(msg.suggestion).toBeDefined()
    })

    it('should use custom message as description', () => {
      const error = new AppError(ErrorCode.FILE_NOT_FOUND, 'File xyz.ts not found')
      const msg = error.getUserMessage()
      expect(msg.description).toBe('File xyz.ts not found')
    })
  })

  describe('toJSON', () => {
    it('should serialize to JSON', () => {
      const error = new AppError(ErrorCode.NETWORK_ERROR, 'Connection failed', {
        details: { url: 'http://example.com' },
        retryable: true,
      })
      const json = error.toJSON()
      expect(json.name).toBe('AppError')
      expect(json.code).toBe(ErrorCode.NETWORK_ERROR)
      expect(json.message).toBe('Connection failed')
      expect(json.details).toEqual({ url: 'http://example.com' })
      expect(json.retryable).toBe(true)
    })
  })

  describe('fromError', () => {
    it('should return same AppError if already AppError', () => {
      const original = new AppError(ErrorCode.TIMEOUT)
      const result = AppError.fromError(original)
      expect(result).toBe(original)
    })

    it('should convert Error to AppError', () => {
      const original = new Error('Something went wrong')
      const result = AppError.fromError(original)
      expect(result).toBeInstanceOf(AppError)
      expect(result.message).toBe('Something went wrong')
    })

    it('should infer error code from message', () => {
      const networkError = AppError.fromError(new Error('Network error occurred'))
      expect(networkError.code).toBe(ErrorCode.NETWORK_ERROR)

      const rateLimitError = AppError.fromError(new Error('Rate limit exceeded'))
      expect(rateLimitError.code).toBe(ErrorCode.LLM_RATE_LIMIT)

      const apiKeyError = AppError.fromError(new Error('Invalid API key'))
      expect(apiKeyError.code).toBe(ErrorCode.LLM_INVALID_API_KEY)
    })

    it('should convert string to AppError', () => {
      const result = AppError.fromError('Simple error message')
      expect(result).toBeInstanceOf(AppError)
      expect(result.message).toBe('Simple error message')
    })

    it('should use default code when cannot infer', () => {
      const result = AppError.fromError(new Error('Random error'))
      expect(result.code).toBe(ErrorCode.UNKNOWN)
    })
  })
})

describe('isRetryableError', () => {
  it('should return true for retryable AppError', () => {
    const error = new AppError(ErrorCode.TIMEOUT, 'Timeout', { retryable: true })
    expect(isRetryableError(error)).toBe(true)
  })

  it('should return false for non-retryable AppError', () => {
    const error = new AppError(ErrorCode.FILE_NOT_FOUND)
    expect(isRetryableError(error)).toBe(false)
  })

  it('should infer retryable from Error message', () => {
    expect(isRetryableError(new Error('Connection timeout'))).toBe(true)
    expect(isRetryableError(new Error('Network error'))).toBe(true)
    expect(isRetryableError(new Error('Rate limit exceeded'))).toBe(true)
  })

  it('should return false for non-retryable errors', () => {
    expect(isRetryableError(new Error('File not found'))).toBe(false)
    expect(isRetryableError(new Error('Invalid syntax'))).toBe(false)
  })
})

describe('formatErrorMessage', () => {
  it('should format AppError', () => {
    const error = new AppError(ErrorCode.LLM_INVALID_API_KEY)
    const message = formatErrorMessage(error)
    expect(message).toContain('Invalid API Key')
    expect(message).toContain('💡')
  })

  it('should format regular Error', () => {
    const error = new Error('Something went wrong')
    const message = formatErrorMessage(error)
    expect(message).toContain('❌')
    expect(message).toContain('Something went wrong')
  })

  it('should format string error', () => {
    const message = formatErrorMessage('Simple error')
    expect(message).toContain('Simple error')
  })
})

describe('createErrorHandler', () => {
  it('should call onError with AppError', () => {
    let capturedError: AppError | null = null
    const handler = createErrorHandler((error) => {
      capturedError = error
    })

    handler(new Error('Test error'))

    expect(capturedError).toBeInstanceOf(AppError)
    expect(capturedError?.message).toBe('Test error')
  })

  it('should rethrow when option is set', () => {
    const handler = createErrorHandler(() => {}, { rethrow: true })

    expect(() => handler(new Error('Test'))).toThrow(AppError)
  })

  it('should not rethrow by default', () => {
    const handler = createErrorHandler(() => {})

    expect(() => handler(new Error('Test'))).not.toThrow()
  })
})

describe('ERROR_MESSAGES', () => {
  it('should have message for all error codes', () => {
    const codes = Object.values(ErrorCode).filter(v => typeof v === 'number') as ErrorCode[]
    
    for (const code of codes) {
      expect(ERROR_MESSAGES[code]).toBeDefined()
      expect(ERROR_MESSAGES[code].title).toBeDefined()
      expect(ERROR_MESSAGES[code].description).toBeDefined()
    }
  })
})
