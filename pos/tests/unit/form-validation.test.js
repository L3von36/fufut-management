import { describe, it, expect, beforeEach } from 'vitest'
import { useFormValidation } from '../../src/composables/useFormValidation'

describe('useFormValidation', () => {
  it('should return no errors for valid data', () => {
    const schema = {
      name: { required: true, label: 'Name', max: 50 },
      age: { required: true, label: 'Age', min: 0, maxVal: 150 }
    }
    const { errors, validate } = useFormValidation(schema)
    expect(validate({ name: 'Abebe', age: 30 })).toBe(true)
    expect(Object.keys(errors).length).toBe(0)
  })

  it('should catch required field missing', () => {
    const schema = { name: { required: true, label: 'Name' } }
    const { errors, validate } = useFormValidation(schema)
    expect(validate({ name: '' })).toBe(false)
    expect(errors.name).toBe('Name is required')
  })

  it('should catch whitespace-only required field', () => {
    const schema = { name: { required: true, label: 'Name' } }
    const { errors, validate } = useFormValidation(schema)
    expect(validate({ name: '   ' })).toBe(false)
    expect(errors.name).toBe('Name is required')
  })

  it('should enforce max length', () => {
    const schema = { name: { label: 'Name', max: 5 } }
    const { errors, validate } = useFormValidation(schema)
    expect(validate({ name: 'Very Long Name' })).toBe(false)
    expect(errors.name).toBe('Name must be at most 5 characters')
  })

  it('should enforce min value for numbers', () => {
    const schema = { wage: { label: 'Wage', min: 0 } }
    const { errors, validate } = useFormValidation(schema)
    expect(validate({ wage: -5 })).toBe(false)
    expect(errors.wage).toBe('Wage must be at least 0')
  })

  it('should enforce maxVal for numbers', () => {
    const schema = { amount: { label: 'Amount', maxVal: 1000 } }
    const { errors, validate } = useFormValidation(schema)
    expect(validate({ amount: 5000 })).toBe(false)
    expect(errors.amount).toBe('Amount must be at most 1000')
  })

  it('should enforce regex pattern', () => {
    const schema = { phone: { label: 'Phone', pattern: /^\+?\d{8,15}$/, message: 'Invalid phone' } }
    const { errors, validate } = useFormValidation(schema)
    expect(validate({ phone: 'abc' })).toBe(false)
    expect(errors.phone).toBe('Invalid phone')
    expect(validate({ phone: '+251911123456' })).toBe(true)
  })

  it('should support custom validator', () => {
    const schema = {
      password: {
        label: 'Password',
        custom: (v) => v.length < 8 ? 'Must be 8+ chars' : null
      }
    }
    const { errors, validate } = useFormValidation(schema)
    expect(validate({ password: 'short' })).toBe(false)
    expect(errors.password).toBe('Must be 8+ chars')
    expect(validate({ password: 'longenough' })).toBe(true)
  })

  it('should skip optional empty fields', () => {
    const schema = { notes: { label: 'Notes', max: 200 } }
    const { errors, validate } = useFormValidation(schema)
    expect(validate({ notes: '' })).toBe(true)
    expect(validate({ notes: null })).toBe(true)
    expect(validate({ notes: undefined })).toBe(true)
  })

  it('should clear previous errors on re-validation', () => {
    const schema = { name: { required: true, label: 'Name' } }
    const { errors, validate } = useFormValidation(schema)
    validate({ name: '' })
    expect(errors.name).toBeDefined()
    validate({ name: 'Abebe' })
    expect(errors.name).toBeUndefined()
  })

  it('should validate multiple fields', () => {
    const schema = {
      firstName: { required: true, label: 'First Name', max: 50 },
      lastName: { required: true, label: 'Last Name', max: 50 },
      phone: { label: 'Phone', pattern: /^[+]?[\d\s\-]{8,20}$/ }
    }
    const { errors, validate } = useFormValidation(schema)
    expect(validate({ firstName: '', lastName: '', phone: 'abc' })).toBe(false)
    expect(errors.firstName).toBeDefined()
    expect(errors.lastName).toBeDefined()
    expect(errors.phone).toBeDefined()
  })
})
