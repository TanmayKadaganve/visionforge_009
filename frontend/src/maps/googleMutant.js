let googleMapSetup

function loadScript(src, id) {
  const existing = document.getElementById(id)
  if (existing?.dataset.loaded === 'true') return Promise.resolve()
  return new Promise((resolve, reject) => {
    const script = existing || document.createElement('script')
    script.id = id
    script.src = src
    script.async = true
    script.defer = true
    script.onload = () => { script.dataset.loaded = 'true'; resolve() }
    script.onerror = () => reject(new Error('Google Maps could not load.'))
    if (!existing) document.head.appendChild(script)
  })
}

export function googleMapsKeyAvailable() {
  return Boolean(import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim())
}

export function loadGoogleMutant(leaflet) {
  if (!googleMapsKeyAvailable()) return Promise.reject(new Error('Add VITE_GOOGLE_MAPS_API_KEY to enable the Google map layer.'))
  window.L = leaflet
  if (!googleMapSetup) {
    const key = encodeURIComponent(import.meta.env.VITE_GOOGLE_MAPS_API_KEY.trim())
    googleMapSetup = loadScript(`https://maps.googleapis.com/maps/api/js?key=${key}&v=weekly`, 'rideflow-google-maps-api')
      .then(() => loadScript('https://cdn.jsdelivr.net/npm/leaflet.gridlayer.googlemutant@0.16.0/Leaflet.GoogleMutant.js', 'rideflow-google-mutant'))
      .then(() => {
        if (!window.L?.gridLayer?.googleMutant) throw new Error('The Leaflet Google layer could not initialize.')
      })
      .catch(error => { googleMapSetup = undefined; throw error })
  }
  return googleMapSetup
}
