import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { supabase, supabaseConfigured } from '../supabaseClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabaseConfigured) {
      setSession(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!cancelled) {
        setSession(s);
        setLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback((email, password) => {
    if (!supabaseConfigured) {
      return Promise.resolve({
        error: new Error('Supabase is not configured (missing env vars).'),
      });
    }
    return supabase.auth.signInWithPassword({ email, password });
  }, []);

  const signUp = useCallback((email, password) => {
    if (!supabaseConfigured) {
      return Promise.resolve({
        data: { user: null, session: null },
        error: new Error('Supabase is not configured (missing env vars).'),
      });
    }
    return supabase.auth.signUp({ email, password });
  }, []);

  const signOut = useCallback(() => {
    if (!supabaseConfigured) return Promise.resolve();
    return supabase.auth.signOut();
  }, []);

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      signIn,
      signUp,
      signOut,
      supabaseConfigured,
    }),
    [session, loading, signIn, signUp, signOut],
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
