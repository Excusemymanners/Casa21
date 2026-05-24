import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
// auth now via Neon JWT endpoints

const ProtectedRoute = ({ children, allowedRole }) => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        // Pas 1: Verifică token și obține user info de la server
        const token = localStorage.getItem('access_token')
        if (!token) { navigate('/'); return }
        const resp = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
        if (!resp.ok) { navigate('/'); return }
        const body = await resp.json()
        const user = body.user
        if (!user) { navigate('/'); return }
        // Verifică rol
        if (user.role === allowedRole) setIsAuthorized(true)
        else navigate('/')
      } catch (error) {
        console.error('Error checking auth:', error);
        navigate('/');
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, [navigate, allowedRole]);

  // Arată loading în timp ce verifică
  if (isLoading) {
    return <div>Loading...</div>;
  }

  // Arată componenta doar dacă e autorizat
  return isAuthorized ? children : null;
};

export default ProtectedRoute;
