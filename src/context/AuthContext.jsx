/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../config/supabaseClient';

// 1. Context create karna
const AuthContext = createContext({});

// 2. Provider component jo hamare app ko wrap karega
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // A. App load hote hi current session check karna
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
      setLoading(false);
    };
    
    checkSession();

    // B. Realtime listener: Agar user login/logout kare toh state update ho jaye
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Cleanup function
    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

// 3. Custom hook taaki components easily auth state use kar sakein
export const useAuth = () => {
  return useContext(AuthContext);
};