import { createContext, useCallback, useContext, useEffect, useState } from 'react'

/**
 * Theme state.
 *
 * Starts from the operating system preference, then remembers an
 * explicit choice. The value is written to data-theme on the document
 * element; every colour in the product is a token redefined under that
 * selector, so nothing else has to know which theme is active.
 */

const STORAGE_KEY = 'harborline:theme'

const ThemeContext = createContext({ theme: 'light', toggle: () => {} })

function preferred() {
  if (typeof window === 'undefined') return 'light'

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // Private mode and blocked storage both throw; fall through.
  }

  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(preferred)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      window.localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // Not being able to remember the choice is not worth failing over.
    }
  }, [theme])

  const toggle = useCallback(() => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
  }, [])

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  return useContext(ThemeContext)
}
