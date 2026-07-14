type Role = 'buyer' | 'seller';

const activeChatIds: Partial<Record<Role, string>> = {};

export function getActiveAIChatId(role: Role): string | undefined {
  return activeChatIds[role];
}

export function setActiveAIChatId(role: Role, chatId?: string): void {
  if (chatId) activeChatIds[role] = chatId;
  else delete activeChatIds[role];
}

export function clearAISessions(): void {
  delete activeChatIds.buyer;
  delete activeChatIds.seller;
}
