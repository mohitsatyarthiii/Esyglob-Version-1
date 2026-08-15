export const SUPPORTED_LANGUAGES = [
  { code: 'en', short: 'EN', name: 'English', country: 'gb' },
  { code: 'hi', short: 'HI', name: 'हिन्दी', country: 'in' },
  { code: 'ar', short: 'AR', name: 'العربية', country: 'ae', direction: 'rtl' },
  { code: 'es', short: 'ES', name: 'Español', country: 'es' },
  { code: 'fr', short: 'FR', name: 'Français', country: 'fr' },
  { code: 'de', short: 'DE', name: 'Deutsch', country: 'de' },
  { code: 'pt', short: 'PT', name: 'Português', country: 'pt' },
  { code: 'ru', short: 'RU', name: 'Русский', country: 'ru' },
  { code: 'zh', short: 'ZH', name: '中文', country: 'cn' },
  { code: 'ja', short: 'JA', name: '日本語', country: 'jp' },
]

const en = {
  'common.loading': 'Loading…', 'common.save': 'Save', 'common.cancel': 'Cancel', 'common.retry': 'Retry',
  'preferences.language': 'Language', 'preferences.currency': 'Currency', 'preferences.search': 'Search language or currency',
  'preferences.noMatch': 'No matching preference', 'preferences.hint': 'Language and currency are saved to your account.',
  'nav.marketplace': 'Marketplace', 'nav.categories': 'Categories', 'nav.products': 'Products', 'nav.manufacturers': 'Manufacturers',
  'nav.explore': 'Explore', 'nav.services': 'Trade services', 'nav.messages': 'Messages', 'nav.account': 'Account',
  'checkout.shipping': 'Shipping', 'checkout.standard': 'EsyGlob Logistics Standard', 'checkout.premium': 'EsyGlob Logistics Premium',
  'checkout.pro': 'EsyGlob Logistics Pro', 'checkout.unavailable': 'This service is temporarily unavailable for this route.',
  'checkout.estimated': 'Estimated delivery: {{eta}}', 'checkout.deliveryAddress': 'Delivery address', 'checkout.orderSummary': 'Order summary',
  'settings.languageTitle': 'Language', 'settings.languageBody': 'Choose the language used across EsyGlob. Your preference follows your account on other devices.',
}

const translations = {
  en,
  hi: { 'common.save':'सहेजें','common.cancel':'रद्द करें','common.retry':'पुनः प्रयास','preferences.language':'भाषा','preferences.currency':'मुद्रा','nav.marketplace':'मार्केटप्लेस','nav.categories':'श्रेणियाँ','nav.products':'उत्पाद','nav.manufacturers':'निर्माता','nav.services':'व्यापार सेवाएँ','nav.messages':'संदेश','nav.account':'खाता','checkout.shipping':'शिपिंग','checkout.deliveryAddress':'डिलीवरी पता','checkout.orderSummary':'ऑर्डर सारांश','settings.languageTitle':'भाषा' },
  ar: { 'common.save':'حفظ','common.cancel':'إلغاء','common.retry':'إعادة المحاولة','preferences.language':'اللغة','preferences.currency':'العملة','nav.marketplace':'السوق','nav.categories':'الفئات','nav.products':'المنتجات','nav.manufacturers':'المصنّعون','nav.services':'خدمات التجارة','nav.messages':'الرسائل','nav.account':'الحساب','checkout.shipping':'الشحن','checkout.deliveryAddress':'عنوان التسليم','checkout.orderSummary':'ملخص الطلب','settings.languageTitle':'اللغة' },
  es: { 'common.save':'Guardar','common.cancel':'Cancelar','common.retry':'Reintentar','preferences.language':'Idioma','preferences.currency':'Moneda','nav.marketplace':'Mercado','nav.categories':'Categorías','nav.products':'Productos','nav.manufacturers':'Fabricantes','nav.services':'Servicios comerciales','nav.messages':'Mensajes','nav.account':'Cuenta','checkout.shipping':'Envío','checkout.deliveryAddress':'Dirección de entrega','checkout.orderSummary':'Resumen del pedido','settings.languageTitle':'Idioma' },
  fr: { 'common.save':'Enregistrer','common.cancel':'Annuler','common.retry':'Réessayer','preferences.language':'Langue','preferences.currency':'Devise','nav.marketplace':'Marché','nav.categories':'Catégories','nav.products':'Produits','nav.manufacturers':'Fabricants','nav.services':'Services commerciaux','nav.messages':'Messages','nav.account':'Compte','checkout.shipping':'Livraison','settings.languageTitle':'Langue' },
  de: { 'common.save':'Speichern','common.cancel':'Abbrechen','common.retry':'Erneut versuchen','preferences.language':'Sprache','preferences.currency':'Währung','nav.marketplace':'Marktplatz','nav.categories':'Kategorien','nav.products':'Produkte','nav.manufacturers':'Hersteller','nav.services':'Handelsdienste','nav.messages':'Nachrichten','nav.account':'Konto','checkout.shipping':'Versand','settings.languageTitle':'Sprache' },
  pt: { 'common.save':'Salvar','common.cancel':'Cancelar','common.retry':'Tentar novamente','preferences.language':'Idioma','preferences.currency':'Moeda','nav.marketplace':'Mercado','nav.categories':'Categorias','nav.products':'Produtos','nav.manufacturers':'Fabricantes','nav.services':'Serviços comerciais','nav.messages':'Mensagens','nav.account':'Conta','checkout.shipping':'Envio','settings.languageTitle':'Idioma' },
  ru: { 'common.save':'Сохранить','common.cancel':'Отмена','common.retry':'Повторить','preferences.language':'Язык','preferences.currency':'Валюта','nav.marketplace':'Маркетплейс','nav.categories':'Категории','nav.products':'Товары','nav.manufacturers':'Производители','nav.services':'Торговые услуги','nav.messages':'Сообщения','nav.account':'Аккаунт','checkout.shipping':'Доставка','settings.languageTitle':'Язык' },
  zh: { 'common.save':'保存','common.cancel':'取消','common.retry':'重试','preferences.language':'语言','preferences.currency':'货币','nav.marketplace':'市场','nav.categories':'分类','nav.products':'产品','nav.manufacturers':'制造商','nav.services':'贸易服务','nav.messages':'消息','nav.account':'账户','checkout.shipping':'配送','settings.languageTitle':'语言' },
  ja: { 'common.save':'保存','common.cancel':'キャンセル','common.retry':'再試行','preferences.language':'言語','preferences.currency':'通貨','nav.marketplace':'マーケット','nav.categories':'カテゴリー','nav.products':'商品','nav.manufacturers':'メーカー','nav.services':'貿易サービス','nav.messages':'メッセージ','nav.account':'アカウント','checkout.shipping':'配送','settings.languageTitle':'言語' },
}

export function translate(language, key, variables = {}) {
  const template = translations[language]?.[key] ?? en[key] ?? ''
  return Object.entries(variables).reduce((text, [name, value]) => text.replaceAll(`{{${name}}}`, String(value)), template)
}
