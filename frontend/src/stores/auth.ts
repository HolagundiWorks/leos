import { create } from 'zustand';
import { login as apiLogin, request, type ApiUser } from '../api/client';

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

// Sessions are process-local and intentionally not persisted. Reloading or
// reopening the desktop application requires authentication again.
export const useAuth = create<AuthState>()(
    (set, get) => ({
      token: null,
      user: null,
      schoolOpened:
        !window.leosDesktop &&
        window.location.protocol.startsWith('http') &&
        window.location.pathname.startsWith('/app'),
      setSchoolOpened: (v) => set({ schoolOpened: v }),
      signIn: async (username, password) => {
        const { token, user } = await apiLogin(username, password);
        set({ token, user });
      },
      signOut: () => {
        const token = get().token;
        if (token) {
          if (window.leosDesktop) void window.leosDesktop.logout(token);
          else void request('/auth/logout', { method: 'POST', token });
        }
        set({ token: null, user: null });
      },
    }),
);
