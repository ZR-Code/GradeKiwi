import { useEffect, useState } from 'react'

/**
 * Keeps an element mounted for `exitMs` after `open` turns false so it can play an exit animation.
 * Returns whether to render, and whether it is currently leaving.
 */
export function usePresence(open: boolean, exitMs = 170): { mounted: boolean; leaving: boolean } {
  const [mounted, setMounted] = useState(open)
  useEffect(() => {
    if (open) {
      setMounted(true)
      return
    }
    const t = window.setTimeout(() => setMounted(false), exitMs)
    return () => window.clearTimeout(t)
  }, [open, exitMs])
  return { mounted: open || mounted, leaving: !open && mounted }
}
