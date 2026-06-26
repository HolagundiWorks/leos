import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { login as apiLogin, type ApiUser } from '../api/client';

interface AuthState {
  token: string | null;
  user: ApiUser | null;
  // Whether a school file has been opened this session (Tally-style gate).
  // Not persisted — you open your school file each launch.
  schoolOpened: boolean;
  setSchoolOpened: (v: boolean) => void;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => void;
}

// Token + user are persisted to localStorage so a reload keeps the session.
// schoolOpened is intentionally excluded from persistence. The query layer
// signs out automatically on a 401 (expired token) — see lib/queryClient.ts.
export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      schoolOpened: false,
      setSchoolOpened: (v) => set({ schoolOpened: v }),
      signIn: async (username, password) => {
        const { token, user } = await apiLogin(username, password);
        set({ token, user });
      },
      signOut: () => set({ token: null, user: null }),
    }),
    {
      name: 'leos-auth',
      partialize: (s) => ({ token: s.token, user: s.user }),
    },
  ),
);
