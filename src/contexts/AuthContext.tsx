// Auth context — wraps Supabase Auth and exposes the current session/user plus
// sign-in/up/out helpers. Also resolves the caller's personal organization id,
// which captures are scoped to (see captureService + RLS).
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthResult {
  error: string | null;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  /** The user's personal organization id (captures are created under this). */
  personalOrgId: string | null;
  /** True until the initial session has been resolved. */
  loading: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string) => Promise<AuthResult>;
  signInWithGoogle: () => Promise<AuthResult>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [personalOrgId, setPersonalOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Look up the personal org the user owns. The signup trigger guarantees one
  // exists; we cache the id so createCapture can stamp it without re-querying.
  const loadPersonalOrg = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from("memberships")
      .select("org_id, organizations!inner(is_personal)")
      .eq("user_id", userId);

    if (error) {
      console.error("Failed to load personal org:", error);
      setPersonalOrgId(null);
      return;
    }

    const personal = data?.find((m) => m.organizations?.is_personal);
    setPersonalOrgId(personal?.org_id ?? null);
  }, []);

  useEffect(() => {
    // Subscribe first so we never miss an auth event, then hydrate the initial
    // session. Keep the callback synchronous and defer Supabase calls to avoid
    // deadlocks (per supabase-js guidance).
    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession);
        if (nextSession?.user) {
          setTimeout(() => loadPersonalOrg(nextSession.user.id), 0);
        } else {
          setPersonalOrgId(null);
        }
      }
    );

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) {
        loadPersonalOrg(data.session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.subscription.unsubscribe();
  }, [loadPersonalOrg]);

  const signIn = useCallback(
    async (email: string, password: string): Promise<AuthResult> => {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      return { error: error?.message ?? null };
    },
    []
  );

  const signUp = useCallback(
    async (email: string, password: string): Promise<AuthResult> => {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        // "/" is the public landing page (PR7) — confirmed users belong in the app.
        options: { emailRedirectTo: `${window.location.origin}/app` },
      });
      return { error: error?.message ?? null };
    },
    []
  );

  const signInWithGoogle = useCallback(async (): Promise<AuthResult> => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      // Land OAuth returns on the app, not the public landing page (PR7).
      options: { redirectTo: `${window.location.origin}/app` },
    });
    return { error: error?.message ?? null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    personalOrgId,
    loading,
    signIn,
    signUp,
    signInWithGoogle,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
