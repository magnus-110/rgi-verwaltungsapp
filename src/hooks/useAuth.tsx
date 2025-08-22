import React, { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface Profile {
  id: string;
  user_id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  role: 'admin' | 'weg_owner' | 'tenant';
  force_password_change: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: any }>;
  signOut: () => Promise<void>;
  updatePassword: (newPassword: string) => Promise<{ error?: any }>;
  fetchProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async () => {
    if (!user) return;
    
    console.log('Fetching profile for user:', user.id);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error) {
        console.error('Error fetching profile:', error);
        setLoading(false); // Stop loading even on error
        return;
      }

      console.log('Profile fetched successfully:', data);
      setProfile(data);
      setLoading(false); // Profile loaded successfully
    } catch (error) {
      console.error('Error fetching profile:', error);
      setLoading(false); // Stop loading on error
    }
  };

  useEffect(() => {
    let mounted = true;
    
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!mounted) return;
        console.log('Auth state change:', event, !!session?.user);
        
        // Handle different auth events
        if (event === 'SIGNED_OUT') {
          setSession(null);
          setUser(null);
          setProfile(null);
          setLoading(false);
        } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          setSession(session);
          setUser(session?.user ?? null);
          // Don't stop loading until profile is fetched
        } else if (event === 'INITIAL_SESSION') {
          setSession(session);
          setUser(session?.user ?? null);
          // Only stop loading if no user, otherwise wait for profile
          if (!session?.user) {
            setLoading(false);
          }
        }
      }
    );

    // Check for existing session only once
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      console.log('Initial session check:', !!session?.user);
      setSession(session);
      setUser(session?.user ?? null);
      
      // Only stop loading if no user, otherwise wait for profile
      if (!session?.user) {
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (user && !profile) {
      console.log('User exists but no profile, fetching...');
      setTimeout(() => {
        fetchProfile();
      }, 0);
    } else if (!user) {
      setProfile(null);
    }
  }, [user, profile]);

  const signIn = async (email: string, password: string) => {
    try {
      console.log('Attempting to sign in...');
      
      // Clean up any existing auth state first
      cleanupAuthState();
      
      // Try to sign out any existing session
      try {
        await supabase.auth.signOut({ scope: 'global' });
      } catch (err) {
        console.warn('Global sign out failed:', err);
      }
      
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error('Sign in error:', error);
        toast({
          title: "Anmeldung fehlgeschlagen",
          description: error.message,
          variant: "destructive",
        });
        return { error };
      }

      console.log('Sign in successful, redirecting...');
      // Force page reload for clean state
      setTimeout(() => {
        window.location.href = '/';
      }, 100);
      
      return {};
    } catch (error) {
      console.error('Sign in catch error:', error);
      return { error };
    }
  };

  const cleanupAuthState = () => {
    // Remove all Supabase auth keys from localStorage
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith('supabase.auth.') || key.includes('sb-')) {
        localStorage.removeItem(key);
      }
    });
    // Remove from sessionStorage if in use
    Object.keys(sessionStorage || {}).forEach((key) => {
      if (key.startsWith('supabase.auth.') || key.includes('sb-')) {
        sessionStorage.removeItem(key);
      }
    });
  };

  const signOut = async () => {
    try {
      // Clean up auth state first
      cleanupAuthState();
      
      // Attempt global sign out
      try {
        await supabase.auth.signOut({ scope: 'global' });
      } catch (err) {
        // Continue even if this fails
        console.warn('Global sign out failed:', err);
      }
      
      setProfile(null);
      setUser(null);
      setSession(null);
      
      // Force page reload for completely clean state
      window.location.href = '/login';
    } catch (error) {
      console.error('Error signing out:', error);
      // Force reload even if there's an error
      window.location.href = '/login';
    }
  };

  const updatePassword = async (newPassword: string) => {
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) {
        toast({
          title: "Passwort-Änderung fehlgeschlagen",
          description: error.message,
          variant: "destructive",
        });
        return { error };
      }

      // Update force_password_change flag
      if (profile) {
        await supabase
          .from('profiles')
          .update({ force_password_change: false })
          .eq('user_id', user?.id);
        
        await fetchProfile();
      }

      toast({
        title: "Passwort erfolgreich geändert",
        description: "Ihr Passwort wurde erfolgreich aktualisiert.",
      });

      return {};
    } catch (error) {
      return { error };
    }
  };

  const value = {
    user,
    session,
    profile,
    loading,
    signIn,
    signOut,
    updatePassword,
    fetchProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};