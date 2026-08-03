import { reverseAddressCoordinates, updateCurrentAddress } from '../api/account'

export function getDeviceCoordinates(options = {}) {
  if (!navigator.geolocation) return Promise.reject(new Error('Current location is not supported by this browser.'))
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(
    ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy }),
    error => reject(new Error(error.code === 1 ? 'Allow location access to use your current address.' : 'Unable to read your current location.')),
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000, ...options },
  ))
}

export async function detectCurrentAddress({ persist = false } = {}) {
  const coordinates = await getDeviceCoordinates()
  const result = await reverseAddressCoordinates(coordinates.latitude, coordinates.longitude)
  const location = result.location
  if (!location) throw new Error('No address was found for your current location.')
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
