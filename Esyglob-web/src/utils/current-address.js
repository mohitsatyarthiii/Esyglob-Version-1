import { reverseAddressCoordinates, updateCurrentAddress } from '../api/account'

export function getDeviceCoordinates(options = {}) {
  if (!navigator.geolocation) return Promise.reject(new Error('Unable to detect your current location. Please search manually.'))
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(
    ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy }),
    error => reject(new Error(error.code === 1 ? 'Location permission was denied. Please enter your location manually.' : 'Unable to detect your current location. Please search manually.')),
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000, ...options },
  ))
}

export async function detectCurrentAddress({ persist = false } = {}) {
  const coordinates = await getDeviceCoordinates()
  let location
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await reverseAddressCoordinates(coordinates.latitude, coordinates.longitude, attempt > 0)
      location = normalizeLocation(result.location, coordinates)
      if (!getMissingAddressFields(location).length) break
    }
  } catch { throw new Error('Unable to detect your current location. Please search manually.') }
  const missing = getMissingAddressFields(location)
  if (missing.length) throw new Error('Unable to detect your current location. Please search manually.')
  if (persist) {
    await updateCurrentAddress({
      ...coordinates,
      address: {
        formatted: location.formattedAddress,
        line1: location.line1,
        street: location.street,
        city: location.city,
        district: location.district,
        state: location.state,
        country: location.country,
        countryCode: location.countryCode,
        postalCode: location.postalCode,
        placeId: location.placeId,
      },
    })
    window.dispatchEvent(new CustomEvent('esyglob-address-change'))
  }
  return { ...location, ...coordinates }
}

export function getMissingAddressFields(value = {}) {
  const missing = []
  if (!Number.isFinite(Number(value.latitude)) || Number(value.latitude) < -90 || Number(value.latitude) > 90) missing.push('latitude')
  if (!Number.isFinite(Number(value.longitude)) || Number(value.longitude) < -180 || Number(value.longitude) > 180) missing.push('longitude')
  if (!/^[A-Z]{2}$/.test(String(value.countryCode || '').trim().toUpperCase())) missing.push('countryCode')
  for (const field of ['country', 'state', 'city', 'formattedAddress']) {
    if (!String(value[field] || '').trim()) missing.push(field)
  }
  return missing
}

function normalizeLocation(value = {}, coordinates = {}) {
  return {
    ...value,
    ...coordinates,
    formattedAddress: String(value.formattedAddress || value.formatted || value.line1 || '').trim(),
    countryCode: String(value.countryCode || '').trim().toUpperCase(),
  }
}
