import React, { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";


interface Profile {
  id: string;
  user_id: string;
  email: string;
  username?: string | null;
  first_name?: string;
  last_name?: string;
  role: 'admin' | 'weg_owner' | 'tenant' | 'employee';
  force_password_change: boolean;
  must_change_password?: boolean | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (identifier: string, password: string) => Promise<{ error?: any }>;
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
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async () => {
    if (!user) return;
    
    
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
        
        // Keep realtime auth in sync so RLS-filtered postgres_changes are delivered
        try {
          supabase.realtime.setAuth(session?.access_token ?? null);
        } catch (e) {
          console.warn("realtime.setAuth failed", e);
        }

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
      
      try {
        supabase.realtime.setAuth(session?.access_token ?? null);
      } catch (e) {
        console.warn("realtime.setAuth failed", e);
      }

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
      
      setTimeout(() => {
        fetchProfile();
      }, 0);
    } else if (!user) {
      setProfile(null);
    }
  }, [user, profile]);

  const signIn = async (identifier: string, password: string) => {
    try {
      const trimmed = identifier.trim();

      // Resolve identifier (username OR email) -> auth email
      let loginEmail = trimmed;
      try {
        const { data: resolved, error: resolveErr } = await supabase.functions.invoke(
          'resolve-login-identifier',
          { body: { identifier: trimmed } }
        );
        if (!resolveErr && resolved?.email) {
          loginEmail = resolved.email;
        } else if (!trimmed.includes('@')) {
          // No @ and no resolution -> definitely invalid
          toast({
            title: "Anmeldung fehlgeschlagen",
            description: "Benutzername nicht gefunden.",
            variant: "destructive",
          });
          return { error: new Error('username_not_found') };
        }
      } catch {
        // Fallback: try as-is
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password,
      });

      if (error) {
        toast({
          title: "Anmeldung fehlgeschlagen",
          description: error.message,
          variant: "destructive",
        });
        return { error };
      }

      setTimeout(() => {
        navigate('/');
      }, 100);

      return {};
    } catch (error) {
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
        
      }
      
      setProfile(null);
      setUser(null);
      setSession(null);
      
      // Use React Router navigation instead of window.location
      navigate('/login');
    } catch (error) {
      console.error('Error signing out:', error);
      // Use React Router navigation even if there's an error
      navigate('/login');
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

      // Clear forced password change flags
      if (profile) {
        await supabase
          .from('profiles')
          .update({ force_password_change: false, must_change_password: false })
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