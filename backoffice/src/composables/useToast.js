export function useToast() {
  function toast(msg, type = 'success') {
    const c = document.getElementById('toastContainer')
    if (!c) return
    const t = document.createElement('div')
    t.className = 'toast ' + type
    t.textContent = msg
    c.appendChild(t)
    requestAnimationFrame(() => t.classList.add('show'))
    setTimeout(() => {
      t.classList.remove('show')
      setTimeout(() => t.remove(), 350)
    }, 3000)
  }
  return { toast }
}
