const providerKeys = ['dhl', 'fedex', 'shiprocket', 'delhivery']

export function getProviderKey(record) {
  const raw = record?.provider?.key
    || record?.providerKey
    || record?.shippingProviderKey
    || record?.serviceSnapshot?.provider?.key
    || record?.checkout?.logisticsSnapshot?.providerKey
    || record?.checkout?.logisticsSnapshot?.provider
    || record?.shippingMethod
    || ''
  const value = String(raw).toLowerCase()
  return providerKeys.find(key => value.includes(key)) || ''
}
