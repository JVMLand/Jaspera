import japanese from './generated/locales/ja.js';
export type MessageKey = keyof typeof japanese;
export function msg(key: MessageKey, values?: unknown[]): string;
export function setDisplayCatalog(catalog: Record<string, string>): void;
export function displayText(text: string): string;
export function displayMessage(key: MessageKey, values?: unknown[]): string;
