import { useAuth0 } from '@auth0/auth0-react';
import { useState, useEffect } from 'react';

export function useAdminRole() {
  const { getIdTokenClaims, isAuthenticated, isLoading } = useAuth0();
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminLoading, setAdminLoading] = useState(true);

  useEffect(() => {
    if (isLoading || !isAuthenticated) {
      setAdminLoading(false);
      return;
    }

    getIdTokenClaims().then(claims => {
      const namespace = import.meta.env.VITE_AUTH0_NAMESPACE || '';
      const roles: string[] = claims?.[`${namespace}/roles`] || [];
      setIsAdmin(roles.includes('admin'));
      setAdminLoading(false);
    });
  }, [getIdTokenClaims, isAuthenticated, isLoading]);

  return { isAdmin, isLoading: adminLoading };
}
