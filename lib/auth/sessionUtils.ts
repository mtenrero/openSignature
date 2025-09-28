import { useRouter } from 'next/navigation'

/**
 * Función utilitaria para redirigir después de detectar una sesión existente
 * Usado cuando el usuario ya está autenticado y visita la página de login
 */
export const forceSessionRefreshAndRedirect = async (redirectTo: string = '/contracts') => {
  console.log('[SESSION UTILS] User already authenticated, redirecting to:', redirectTo)
  
  if (typeof window !== 'undefined') {
    // Use router.push for client-side navigation instead of window.location
    // This preserves the session state better
    window.location.replace(redirectTo)
  }
}