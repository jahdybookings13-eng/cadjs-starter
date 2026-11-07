// useSessionSnapshot — the React read side of the live session.
//
// Surfaces that render presence (the 2D strip, future seat list) just call
// this; it re-renders when a peer joins, leaves, switches surface or changes
// what it is touching.

import { useSyncExternalStore } from "react";
import {
  getSessionSnapshot,
  subscribeSession,
  type SessionSnapshot,
} from "./sessionRuntime";

export function useSessionSnapshot(): SessionSnapshot | null {
  return useSyncExternalStore(subscribeSession, getSessionSnapshot, () => null);
}
