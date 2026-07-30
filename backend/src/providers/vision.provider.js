import HuggingFaceVisionProvider from './huggingface-vision.provider.js';

let activeProvider;

export function getVisionProvider() {
  if (!activeProvider) activeProvider = new HuggingFaceVisionProvider();
  return activeProvider;
}

export function setVisionProviderForTests(provider) {
  activeProvider = provider;
}

export function resetVisionProviderForTests() {
  activeProvider = undefined;
}
