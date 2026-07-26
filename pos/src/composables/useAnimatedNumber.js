// Animated counter composable
import { ref, watch } from 'vue'

export function useAnimatedNumber(duration = 600) {
  const displayValue = ref(0)
  let animFrame = null

  function animateTo(target) {
    if (animFrame) cancelAnimationFrame(animFrame)
    const start = displayValue.value
    const diff = target - start
    const startTime = performance.now()

    function step(now) {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      displayValue.value = start + diff * eased
      if (progress < 1) {
        animFrame = requestAnimationFrame(step)
      }
    }
    animFrame = requestAnimationFrame(step)
  }

  return { displayValue, animateTo }
}
