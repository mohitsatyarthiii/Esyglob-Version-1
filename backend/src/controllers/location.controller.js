import AddressAutocompleteService from '../services/address-autocomplete.service.js';

class LocationController {
  static async autocomplete(req, res) {
    try {
      return res.json(await AddressAutocompleteService.search(req.query));
    } catch (error) {
      return res.status(error.statusCode || error.response?.status || 502).json({ error: error.message });
    }
  }

  static async resolveAddress(req, res) {
    try {
      return res.json(await AddressAutocompleteService.resolve(req.query));
    } catch (error) {
      return res.status(error.statusCode || error.response?.status || 502).json({ error: error.message });
    }
  }

  static async reverseAddress(req, res) {
    try {
      return res.json(await AddressAutocompleteService.reverse(req.query));
    } catch (error) {
      return res.status(error.statusCode || error.response?.status || 502).json({ error: error.message });
    }
  }

  static async autocompleteCapabilities(req, res) {
    return res.json(AddressAutocompleteService.capabilities());
  }
}

export default LocationController;
