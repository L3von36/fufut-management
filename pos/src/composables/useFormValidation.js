// Shared form validation composable
// Returns validation errors for a given form data against a schema.
// Usage:
//   const { errors, validate } = useFormValidation({
//     firstName: { required: true, label: 'First Name', max: 50 },
//     wage: { required: true, label: 'Wage', min: 0 },
//     phone: { label: 'Phone', pattern: /^\+?\d{8,15}$/ }
//   })
//   const ok = validate(formData)  // returns true/false, populates errors

import { reactive } from 'vue'

export function useFormValidation(schema) {
  const errors = reactive({})

  function validate(data) {
    // Clear previous errors
    Object.keys(errors).forEach(k => delete errors[k])

    let valid = true

    for (const [field, rules] of Object.entries(schema)) {
      const value = data[field]
      const label = rules.label || field

      // Required check
      if (rules.required) {
        if (value === undefined || value === null || value === '' ||
            (typeof value === 'string' && value.trim() === '')) {
          errors[field] = `${label} is required`
          valid = false
          continue
        }
      }

      // Skip further checks if empty and not required
      if (value === undefined || value === null || value === '') continue

      // Min length (for strings)
      if (rules.minLen !== undefined && typeof value === 'string' && value.length < rules.minLen) {
        errors[field] = `${label} must be at least ${rules.minLen} characters`
        valid = false
        continue
      }

      // Max length (for strings)
      if (rules.max !== undefined && typeof value === 'string' && value.length > rules.max) {
        errors[field] = `${label} must be at most ${rules.max} characters`
        valid = false
        continue
      }

      // Min value (for numbers)
      if (rules.min !== undefined && typeof value === 'number' && value < rules.min) {
        errors[field] = `${label} must be at least ${rules.min}`
        valid = false
        continue
      }

      // Max value (for numbers)
      if (rules.maxVal !== undefined && typeof value === 'number' && value > rules.maxVal) {
        errors[field] = `${label} must be at most ${rules.maxVal}`
        valid = false
        continue
      }

      // Regex pattern
      if (rules.pattern && typeof value === 'string' && !rules.pattern.test(value)) {
        errors[field] = rules.message || `${label} format is invalid`
        valid = false
        continue
      }

      // Custom validator function
      if (rules.custom && typeof rules.custom === 'function') {
        const errMsg = rules.custom(value, data)
        if (errMsg) {
          errors[field] = errMsg
          valid = false
          continue
        }
      }
    }

    return valid
  }

  return { errors, validate }
}
