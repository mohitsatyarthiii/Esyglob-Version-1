export function getTradeAssuranceProvider() {
  const provider = process.env.TRADE_ASSURANCE_PROVIDER || 'manual';
  const apiKey = process.env.TRADE_ASSURANCE_API_KEY;

  return {
    name: provider,
    configured: provider === 'manual' || Boolean(apiKey),
    async createProtection() {
      if (provider === 'manual') {
        return { provider: 'manual', status: 'draft' };
      }
      if (!apiKey) {
        throw new Error('Trade assurance provider is not configured');
      }
      throw new Error(
        `${provider} trade assurance adapter has not been enabled`
      );
    },
    async fund() {
      throw new Error('Escrow funding requires a configured provider');
    },
    async release() {
      throw new Error('Escrow release requires a configured provider');
    },
    async refund() {
      throw new Error('Escrow refund requires a configured provider');
    },
  };
}