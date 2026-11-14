export function validCoordinates(latitude, longitude) {
  return Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
    && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180
}

export function distanceKm(fromLat, fromLng, toLat, toLng) {
  const radians = degrees => degrees * Math.PI / 180
  const dLat = radians(toLat - fromLat)
  const dLng = radians(toLng - fromLng)
  const value = Math.sin(dLat / 2) ** 2
    + Math.cos(radians(fromLat)) * Math.cos(radians(toLat)) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value))
}
