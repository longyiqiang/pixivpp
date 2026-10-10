import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { NovelContent } from "../domain/novel";
import type { RemoteQuery, SearchPage } from "../features/search/types";
import type { NovelProvider } from "../providers/novel-provider";

export interface Account {
  id: string;
  name: string;
}
export interface AccountStatus {
  account: Account | null;
  error: string | null;
}
export const nativeAvailable = isTauri();
export function asError(value: unknown): Error {
  return value instanceof Error
    ? value
    : new Error(typeof value === "string" ? value : "操作失败，请重试。");
}
async function call<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (!nativeAvailable)
    throw new Error("请在 pixivpp 独立 App 中使用 Pixiv 登录和在线功能。");
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw asError(error);
  }
}
export const accountStatus = () => call<AccountStatus>("pixiv_account");
export const login = () => call<void>("pixiv_login");
export const logout = () => call<void>("pixiv_logout");
export const importToken = (token: string) =>
  call<AccountStatus>("pixiv_import_token", { token });
export const listenAccount = (callback: (value: AccountStatus) => void) =>
  listen<AccountStatus>("pixiv-account", (event) => callback(event.payload));

// Aborting prevents stale responses from entering the UI; native requests have a 30s timeout.
async function requested<T>(
  command: string,
  args: Record<string, unknown>,
  signal: AbortSignal,
): Promise<T> {
  signal.throwIfAborted();
  const result = await call<T>(command, args);
  signal.throwIfAborted();
  return result;
}
export const pixivProvider: NovelProvider = {
  search: (query: RemoteQuery, cursor: string | null, signal: AbortSignal) =>
    requested<SearchPage>("pixiv_search", { query, cursor }, signal),
  read: (id: string, signal: AbortSignal) =>
    requested<NovelContent>("pixiv_read", { id }, signal),
};
