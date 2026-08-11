import AddressAutocompleteService from '../services/address-autocomplete.service.js';

class LocationController {
  static async autocomplete(req, res) {
    try {
      return res.json(await AddressAutocompleteService.search(req.query));
    } catch (error) {
      return locationError(res, error);
    }
  }

  static async resolveAddress(req, res) {
    try {
      return res.json(await AddressAutocompleteService.resolve(req.query));
    } catch (error) {
      return locationError(res, error);
    }
  }

  static async reverseAddress(req, res) {
    try {
      return res.json(await AddressAutocompleteService.reverse(req.query));
    } catch (error) {
      return locationError(res, error);
    }
  }

  static async autocompleteCapabilities(req, res) {
    return res.json(AddressAutocompleteService.capabilities());
  }
}

function locationError(res, error) {
  if (error.statusCode && error.statusCode < 500) return res.status(error.statusCode).json({ error: error.message, code: error.code });
  return res.status(error.statusCode || 502).json({ error: 'Address lookup is temporarily unavailable', code: error.code || 'ADDRESS_PROVIDER_UNAVAILABLE' });
}

export default LocationController;
