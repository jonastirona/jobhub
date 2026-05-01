import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as Sentry from '@sentry/react';
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
        if (s?.user) Sentry.setUser({ id: s.user.id, email: s.user.email });
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user) {
        Sentry.setUser({ id: s.user.id, email: s.user.email });
      } else {
        Sentry.setUser(null);
      }
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

  const resetPassword = useCallback((email) => {
    if (!supabaseConfigured) {
      return Promise.resolve({
        error: new Error('Supabase is not configured (missing env vars).'),
      });
    }
    return supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
  }, []);

  const updatePassword = useCallback((newPassword) => {
    if (!supabaseConfigured) {
      return Promise.resolve({
        error: new Error('Supabase is not configured (missing env vars).'),
      });
    }
    return supabase.auth.updateUser({ password: newPassword });
  }, []);

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      signIn,
      signUp,
      signOut,
      resetPassword,
      updatePassword,
      supabaseConfigured,
    }),
    [session, loading, signIn, signUp, signOut, resetPassword, updatePassword]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
