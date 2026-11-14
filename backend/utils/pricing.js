export const vehicleCategories = ['Bike', 'Scooter', 'Auto', 'Mini', 'Sedan', 'SUV', 'Premium', 'Electric']

const defaults = {
  Bike: [15, 8], Scooter: [18, 9], Auto: [25, 11], Mini: [30, 12],
  Sedan: [45, 15], SUV: [65, 21], Premium: [100, 30], Electric: [35, 13],
}

export function fareFor(distanceKm, vehicleType = 'Mini') {
  if (!vehicleCategories.includes(vehicleType)) throw new Error('Choose a supported vehicle category.')
  const [defaultBase, defaultRate] = defaults[vehicleType]
  const key = vehicleType.toUpperCase()
  const baseFare = Number(process.env[`FARE_${key}_BASE_INR`] || (vehicleType === 'Mini' ? process.env.FARE_BASE_INR : 0) || defaultBase)
  const ratePerKm = Number(process.env[`FARE_${key}_PER_KM_INR`] || (vehicleType === 'Mini' ? process.env.FARE_PER_KM_INR : 0) || defaultRate)
  return {
    amount: Math.round(baseFare + distanceKm * ratePerKm),
    currency: 'INR',
    vehicleType,
    baseFare,
    ratePerKm,
  }
}
