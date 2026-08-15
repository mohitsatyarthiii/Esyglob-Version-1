import 'dotenv/config';
import AddressAutocompleteService from '../src/services/address-autocomplete.service.js';

const capabilities = AddressAutocompleteService.capabilities();
const search = await AddressAutocompleteService.search({ input: 'Delhi', countryCodes: 'in', languageCode: 'en', sessionToken: `address-qa-${Date.now()}` });
const suggestion = search.suggestions?.[0];
if (!suggestion?.placeId) throw new Error('Google Places returned no Delhi suggestions');
const resolved = await AddressAutocompleteService.resolve({ placeId: suggestion.placeId, languageCode: 'en' });
const reverse = await AddressAutocompleteService.reverse({ latitude: 27.565, longitude: 77.659, languageCode: 'en', refresh: true });

console.log(JSON.stringify({
  configured: capabilities.configured,
  provider: capabilities.provider,
  suggestionsReturned: search.suggestions.length,
  selectedAddressComplete: Boolean(resolved.location?.formattedAddress && resolved.location?.countryCode && resolved.location?.latitude && resolved.location?.longitude),
  reverseAddressComplete: Boolean(reverse.location?.formattedAddress && reverse.location?.countryCode && reverse.location?.latitude && reverse.location?.longitude),
  translationApiConfigured: Boolean(process.env.GOOGLE_TRANSLATION_API_KEY || process.env.GOOGLE_CLOUD_TRANSLATION_API_KEY),
}, null, 2));
