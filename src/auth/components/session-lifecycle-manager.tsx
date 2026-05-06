"use client";

import { useEffect, useRef } from "react";

export const AUTH_CHANNEL = "auth_sync_channel";

interface SessionLifecycleProps {
  timeoutMs?: number;
  onIdle: () => void;
  onSync: () => void;
}

export function SessionLifecycleManager({
  timeoutMs = 15 * 60 * 1000,
  onIdle,
  onSync,
}: SessionLifecycleProps) {
  // Use refs to maintain callback stability without re-triggering the main effect
  const onIdleRef = useRef(onIdle);
  const onSyncRef = useRef(onSync);

  useEffect(() => {
    onIdleRef.current = onIdle;
    onSyncRef.current = onSync;
  }, [onIdle, onSync]);

  useEffect(() => {
    const channel = new BroadcastChannel(AUTH_CHANNEL);
    let timeout: ReturnType<typeof setTimeout>;

    const resetIdleTimer = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        onIdleRef.current();
      }, timeoutMs);
    };

    channel.onmessage = (e) => {
      if (e.data === "LOGOUT") onSyncRef.current();
      if (e.data === "ACTIVE") resetIdleTimer();
    };

    let lastActivity = 0;
    const handleActivity = () => {
      const now = Date.now();
      // Strict 1-second throttle for DOM events to eliminate main-thread lag
      if (now - lastActivity > 1000) {
        lastActivity = now;
        resetIdleTimer();
        channel.postMessage("ACTIVE");
      }
    };

    // Passive listeners for maximum scroll/interaction performance
    window.addEventListener("mousemove", handleActivity, { passive: true });
    window.addEventListener("keydown", handleActivity, { passive: true });

    resetIdleTimer();

    return () => {
      clearTimeout(timeout);
      channel.close();
      window.removeEventListener("mousemove", handleActivity);
      window.removeEventListener("keydown", handleActivity);
    };
  }, [timeoutMs]);

  return null;
}

// Utility for manual logouts to use without retaining channel instances
export const broadcastLogout = () => {
  const channel = new BroadcastChannel(AUTH_CHANNEL);
  channel.postMessage("LOGOUT");
  channel.close();
};
