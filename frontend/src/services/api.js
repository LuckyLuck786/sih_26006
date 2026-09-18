import mockResponse from '../mock/mockResponse.json'

const wait = (duration) => new Promise((resolve) => setTimeout(resolve, duration))

export async function analyzeShipment(payload) {
  if (import.meta.env.VITE_USE_MOCK === 'true') {
    await wait(800)
    const quantityFactor = Math.max(0.92, Math.min(1.08, Number(payload.cargo_quantity || 50000) / 50000))
    const currentRate = Math.round(mockResponse.decision.current_rate * quantityFactor)
    const expectedRate = Math.round(mockResponse.forecast.expected * quantityFactor)

    return {
      ...mockResponse,
      forecast: { ...mockResponse.forecast, expected: expectedRate },
      decision: {
        ...mockResponse.decision,
        current_rate: currentRate,
        expected_saving: currentRate - expectedRate,
        net_expected_saving: currentRate - expectedRate - mockResponse.decision.waiting_cost,
      },
      forecast_series: mockResponse.forecast_series.map((point) => ({
        ...point,
        expected: Math.round(point.expected * quantityFactor),
        lower: Math.round(point.lower * quantityFactor),
        upper: Math.round(point.upper * quantityFactor),
      })),
    }
  }

  const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
  try {
    const response = await fetch(`${baseUrl}/forecast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!response.ok) {
      throw new Error(`Forecast request failed (${response.status})`)
    }
    return await response.json()
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error('Unable to reach the forecast service. Check that the API is running.')
    }
    throw new Error(error.message || 'The forecast service returned an unexpected error.')
  }
}