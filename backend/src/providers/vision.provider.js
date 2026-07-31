let activeProvider;

class UnavailableVisionProvider {
  constructor() {
    this.name = 'unavailable';
    this.configured = false;
  }

  async analyze() {
    throw Object.assign(new Error('Vision provider is currently unavailable'), {
      statusCode: 503,
      code: 'VISION_PROVIDER_UNAVAILABLE',
      stage: 'ai_analysis',
      retryable: false,
    });
  }
}

export function getVisionProvider() {
  if (!activeProvider) activeProvider = new UnavailableVisionProvider();
  return activeProvider;
}

export function isVisionProviderAvailable() {
  return getVisionProvider().configured === true;
}

export function setVisionProviderForTests(provider) {
  activeProvider = provider;
}

export function resetVisionProviderForTests() {
  activeProvider = undefined;
}
