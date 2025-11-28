import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase, UserProfile } from '../lib/supabase';
import { saveQuizResultsToDatabase } from '../lib/quizStorage';

type AuthContextType = {
  user: User | null;
  profile: UserProfile | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching profile:', error);
        throw error;
      }

      if (data) {
        setProfile(data);
      } else {
        // No profile found - this might be a race condition during signup
        // Try one more time after a short delay
        await new Promise(resolve => setTimeout(resolve, 500));
        const { data: retryData, error: retryError } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle();

        if (retryData) {
          setProfile(retryData);
        } else {
          console.error('Profile not found after retry:', retryError);
          // Sign out to prevent stuck state
          await supabase.auth.signOut();
          setUser(null);
          setProfile(null);
        }
      }
    } catch (error) {
      console.error('Failed to fetch profile:', error);
      // If profile fetch fails, sign out to prevent stuck state
      await supabase.auth.signOut();
      setUser(null);
      setProfile(null);
    }
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      (async () => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          await fetchProfile(session.user.id);
        } else {
          setProfile(null);
        }
        setLoading(false);
      })();
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
      }
    });

    if (error) {
      return { error };
    }

    if (!data.user) {
      return { error: new Error('Failed to create user') };
    }

    // Check if email confirmation is required
    if (!data.session) {
      return {
        error: new Error('Email confirmation is enabled. Please check your Supabase settings to disable email confirmation for immediate signup.')
      };
    }

    // User is signed up with an active session
    const hasQuizResults = localStorage.getItem('quiz_results');

    // Insert user profile
    // If this fails, we need to clean up the auth user to prevent orphaned accounts
    const { error: profileError } = await supabase.from('user_profiles').insert({
      id: data.user.id,
      onboarding_completed: hasQuizResults ? true : false,
    });

    if (profileError) {
      console.error('Failed to create profile:', profileError);
      // Sign out the user since profile creation failed
      await supabase.auth.signOut();
      return { error: new Error('Failed to create user profile. Please try again.') };
    }

    // Save quiz results if they exist
    if (hasQuizResults) {
      try {
        await saveQuizResultsToDatabase(data.user.id);
      } catch (quizError) {
        console.error('Failed to save quiz results:', quizError);
      }
    }

    // Force a small delay to ensure profile is committed before onAuthStateChange processes
    await new Promise(resolve => setTimeout(resolve, 100));

    // The onAuthStateChange listener will handle setting user/session/profile
    // Just return success - the auth state will update automatically
    return { error: null };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        session,
        loading,
        signUp,
        signIn,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
