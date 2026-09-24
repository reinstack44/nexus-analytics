/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../config/supabaseClient';

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null); // { id, email, role: 'admin' | 'user', is_active: boolean }
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId) => {
    if (!userId) return null;
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (error || !data) return null;
      return data;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    let isMounted = true;

    const checkSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;
        
        const currentUser = session?.user ?? null;
        if (isMounted) {
          setUser(currentUser);
          if (currentUser) {
            const userProfile = await fetchProfile(currentUser.id);
            if (isMounted) setProfile(userProfile);
          } else {
            if (isMounted) setProfile(null);
          }
        }
      } catch (err) {
        console.error("Auth Session Handshake Error:", err.message);
        if (isMounted) {
          setUser(null);
          setProfile(null);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };
    
    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (isMounted) {
        const currentUser = session?.user ?? null;
        setUser(currentUser);
        if (currentUser) {
          const userProfile = await fetchProfile(currentUser.id);
          if (isMounted) setProfile(userProfile);
        } else {
          if (isMounted) setProfile(null);
        }
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const isAdmin = profile?.role === 'admin';

  return (
    <AuthContext.Provider value={{ user, profile, isAdmin, loading, setProfile }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  return useContext(AuthContext);
};