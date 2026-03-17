import { AsyncLocalStorage } from "node:async_hooks";
export const toolContextStorage = new AsyncLocalStorage<{
  sessionId: string;
}>();
