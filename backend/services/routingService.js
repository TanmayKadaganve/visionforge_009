export async function getDrivingRoute(from, to) {
  const coordinates = `${from.longitude},${from.latitude};${to.longitude},${to.latitude}`
  const url = `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=false`
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'RideFlow/0.1 (hackathon ride matching prototype)',
      Referer: process.env.CLIENT_URL?.split(',')[0] || 'http://localhost:5173',
    },
    signal: AbortSignal.timeout(8000),
  })
  if (!response.ok) throw new Error('Routing service is unavailable.')
  const result = await response.json()
  const route = result.code === 'Ok' ? result.routes?.[0] : null
  if (!route) throw new Error('No driving route was found between those locations.')
  return {
    distanceKm: route.distance / 1000,
    durationMinutes: route.duration / 60,
    geometry: route.geometry,
  }
}
