import { createContext, useContext, useEffect, useState } from 'react'

/**
 * Currency handling.
 *
 * The engine computes in US dollars because that is how dry bulk freight
 * is quoted worldwide: a Capesize fixture from Port Hedland is agreed in
 * $/tonne, not rupees. Converting the quoted rate away from its market
 * unit would misrepresent it.
 *
 * So the market figure stays in USD and every value is also shown in
 * rupees, which is what an Indian procurement desk budgets and reports
 * in. The live rate and its date are displayed rather than buried, since
 * a converted total is only meaningful alongside the rate used.
 *
 * Rupees are grouped the Indian way (lakh, crore) by the en-IN locale,
 * so 40,30,614 rather than 4,030,614.
 */

const FALLBACK = { rate: 95.82, date: '2026-09-21', source: 'pinned fallback', stale: true }

const FxContext = createContext(FALLBACK)

export function FxProvider({ children }) {
  const [fx, setFx] = useState(FALLBACK)

  useEffect(() => {
    let cancelled = false

    fetch('/api/fx')
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled && data && Number.isFinite(data.rate)) setFx(data)
      })
      .catch(() => {
        /* keep the fallback; the UI marks it stale */
      })

    return () => {
      cancelled = true
    }
  }, [])

  return <FxContext.Provider value={fx}>{children}</FxContext.Provider>
}

export function useFx() {
  return useContext(FxContext)
}
