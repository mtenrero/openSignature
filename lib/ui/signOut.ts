import { signOut, getCsrfToken } from 'next-auth/react'

/** Sign out. Authentik sessions also end the IdP session (server-side end-session redirect). */
export async function performSignOut(session: unknown): Promise<void> {
  if ((session as { idp?: string } | null)?.idp === 'authentik') {
    // POST + CSRF token (double-submit): a plain link/redirect can never log the user out.
    const csrfToken = await getCsrfToken()
    const form = document.createElement('form')
    form.method = 'POST'
    form.action = '/api/auth/idp-logout'
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = 'csrfToken'
    input.value = csrfToken ?? ''
    form.appendChild(input)
    document.body.appendChild(form)
    form.submit()
    return
  }
  await signOut({ callbackUrl: '/' })
}
