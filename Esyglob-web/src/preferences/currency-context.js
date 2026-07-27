import { createContext, useContext } from 'react'

export const CurrencyContext = createContext(null)
export const CURRENCY_OPTIONS = [
  ['INR','₹','Indian Rupee','🇮🇳'], ['USD','$','US Dollar','🇺🇸'], ['EUR','€','Euro','🇪🇺'],
  ['GBP','£','British Pound','🇬🇧'], ['AED','د.إ','UAE Dirham','🇦🇪'], ['SAR','﷼','Saudi Riyal','🇸🇦'],
  ['QAR','﷼','Qatari Riyal','🇶🇦'], ['KWD','د.ك','Kuwaiti Dinar','🇰🇼'], ['BHD','د.ب','Bahraini Dinar','🇧🇭'],
  ['OMR','﷼','Omani Rial','🇴🇲'], ['JPY','¥','Japanese Yen','🇯🇵'], ['CNY','¥','Chinese Yuan','🇨🇳'],
  ['KRW','₩','South Korean Won','🇰🇷'], ['AUD','A$','Australian Dollar','🇦🇺'], ['CAD','CA$','Canadian Dollar','🇨🇦'],
  ['NZD','NZ$','New Zealand Dollar','🇳🇿'], ['CHF','CHF','Swiss Franc','🇨🇭'], ['SGD','S$','Singapore Dollar','🇸🇬'],
  ['MYR','RM','Malaysian Ringgit','🇲🇾'], ['THB','฿','Thai Baht','🇹🇭'], ['IDR','Rp','Indonesian Rupiah','🇮🇩'],
  ['VND','₫','Vietnamese Dong','🇻🇳'], ['PHP','₱','Philippine Peso','🇵🇭'], ['ZAR','R','South African Rand','🇿🇦'],
  ['BRL','R$','Brazilian Real','🇧🇷'], ['MXN','MX$','Mexican Peso','🇲🇽'], ['TRY','₺','Turkish Lira','🇹🇷'],
  ['RUB','₽','Russian Ruble','🇷🇺'], ['EGP','E£','Egyptian Pound','🇪🇬'], ['PKR','₨','Pakistani Rupee','🇵🇰'],
  ['BDT','৳','Bangladeshi Taka','🇧🇩'], ['NPR','रू','Nepalese Rupee','🇳🇵'], ['LKR','Rs','Sri Lankan Rupee','🇱🇰'],
  ['HKD','HK$','Hong Kong Dollar','🇭🇰'], ['TWD','NT$','New Taiwan Dollar','🇹🇼'], ['PLN','zł','Polish Zloty','🇵🇱'],
  ['SEK','kr','Swedish Krona','🇸🇪'], ['NOK','kr','Norwegian Krone','🇳🇴'], ['DKK','kr','Danish Krone','🇩🇰'],
  ['CZK','Kč','Czech Koruna','🇨🇿'], ['HUF','Ft','Hungarian Forint','🇭🇺'], ['ILS','₪','Israeli Shekel','🇮🇱'],
  ['KES','KSh','Kenyan Shilling','🇰🇪'], ['NGN','₦','Nigerian Naira','🇳🇬'], ['GHS','₵','Ghanaian Cedi','🇬🇭'],
]
export const CURRENCIES = CURRENCY_OPTIONS.map(([code]) => code)
export const CURRENCY_META = Object.fromEntries(CURRENCY_OPTIONS.map(
  ([code, symbol, name, flag]) => [code, { code, symbol, name, flag }],
))

export function useCurrency() {
  const value = useContext(CurrencyContext)
  if (!value) throw new Error('useCurrency must be used inside CurrencyProvider')
  return value
}
