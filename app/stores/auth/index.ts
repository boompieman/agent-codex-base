import { defineStore } from "pinia";
import { useLocalStorage } from "@vueuse/core";

export const AUTH_STORAGE_KEY = "codex-gateway-auth-token";

export const useAuthStore = defineStore("auth", () => {
  const token = ref("");
  const username = ref("");
  const initialized = ref(false);
  const sessionEpoch = ref(0);
  const storedToken = useLocalStorage<string | null>(AUTH_STORAGE_KEY, null);
  const storedUsername = useLocalStorage<string | null>(`${AUTH_STORAGE_KEY}:username`, null);

  const isAuthenticated = computed(() => token.value !== "");

  function hydrate() {
    if (!import.meta.client || initialized.value) {
      return;
    }
    replaceSession(storedToken.value ?? "", storedUsername.value ?? "");
    initialized.value = true;
  }

  async function login(input: { username: string; password: string }) {
    const session = await $fetch<{
      token: string;
      expiresAt: string;
      user: { id: number; username: string };
    }>("/api/auth/login", {
      method: "POST",
      body: input,
    });
    setSession(session.token, session.user.username);
    return session;
  }

  function setSession(nextToken: string, nextUsername: string) {
    replaceSession(nextToken, nextUsername);
    initialized.value = true;
    storedToken.value = nextToken;
    storedUsername.value = nextUsername;
  }

  async function logout() {
    const currentToken = token.value;
    if (currentToken !== "") {
      try {
        await $fetch("/api/auth/logout", {
          method: "POST",
          headers: { authorization: `Bearer ${currentToken}` },
        });
      } finally {
        clearSession();
      }
      return;
    }
    clearSession();
  }

  function clearSession() {
    replaceSession("", "");
    initialized.value = true;
    storedToken.value = null;
    storedUsername.value = null;
  }

  function replaceSession(nextToken: string, nextUsername: string) {
    if (token.value !== nextToken) sessionEpoch.value += 1;
    token.value = nextToken;
    username.value = nextUsername;
  }

  function isCurrentSession(epoch: number) {
    return sessionEpoch.value === epoch;
  }

  return {
    token,
    username,
    initialized,
    sessionEpoch,
    isAuthenticated,
    hydrate,
    login,
    logout,
    isCurrentSession,
  };
});
