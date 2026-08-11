/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../config/supabaseClient';

// 1. Context creation
const AuthContext = createContext({});

// 2. Provider component that wraps our app routes
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    // A. App load: Asynchronously check current active session map
    const checkSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;
        
        if (isMounted) {
          setUser(session?.user ?? null);
        }
      } catch (err) {
        console.error("Auth Session Handshake Error:", err.message);
        if (isMounted) {
          setUser(null);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };
    
    checkSession();

    // B. Realtime listener: Automatically update active user state on login/logout transitions
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (isMounted) {
        // Only update state if user profile transitions to prevent redundant render cycles
        setUser((prevUser) => {
          const nextUserId = session?.user?.id ?? null;
          const prevUserId = prevUser?.id ?? null;
          if (prevUserId !== nextUserId) {
            return session?.user ?? null;
          }
          return prevUser;
        });
        setLoading(false);
      }
    });

    // Cleanup subscription and toggle mount state on unmount
    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

// 3. Custom hook to safely consume auth context
export const useAuth = () => {
  return useContext(AuthContext);
};