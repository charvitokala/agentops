/** Observed DOM hooks, not an official WhatsApp API. Keep layout updates here. */
export const SELECTORS = {
  conversationRoot: '#main, [data-testid="conversation-panel-wrapper"]',
  conversationTitle: [
    'header [data-testid="conversation-info-header-chat-title"]',
    'header [data-testid="conversation-title"]',
    'header span[title][dir="auto"]',
    'header [title][dir="auto"]',
    'header span[dir="auto"]',
  ],
  messageContainers: [
    '[data-testid="conversation-panel-messages"]',
    '[data-testid="conversation-panel-body"]',
    '[role="application"]',
  ],
  message: '.message-in, .message-out, [data-testid="msg-container"]',
  messageText:
    '[data-testid="msg-text"], [data-testid="selectable-text"], .selectable-text',
  excluded:
    'footer, [contenteditable="true"], [role="menu"], [data-testid="quoted-message"], [data-testid="quoted-message-preview"], [data-testid="quoted-message-container"], [data-testid="msg-meta"], [data-verdictai-note]',
  composer:
    'footer, [contenteditable="true"], [data-testid="conversation-compose-box-input"]',
} as const;
