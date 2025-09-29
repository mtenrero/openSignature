import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

// POST /api/auth/register-auth0 - Register new user in Auth0
export async function POST(request: NextRequest) {
  try {
    const { name, username, email, password, company } = await request.json()

    // Validation
    if (!name || !username || !email || !password) {
      return NextResponse.json(
        { error: 'Nombre, nombre de usuario, email y contraseña son obligatorios' },
        { status: 400 }
      )
    }

    // Username validation
    if (username.length < 3 || !/^[a-zA-Z0-9_]+$/.test(username)) {
      return NextResponse.json(
        { error: 'El nombre de usuario debe tener al menos 3 caracteres y solo contener letras, números y guiones bajos' },
        { status: 400 }
      )
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'La contraseña debe tener al menos 8 caracteres' },
        { status: 400 }
      )
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'El formato del email no es válido' },
        { status: 400 }
      )
    }

    // Auth0 Management API configuration
    const AUTH0_DOMAIN = process.env.AUTH0_ISSUER?.replace('https://', '').replace('/', '')
    const AUTH0_CLIENT_ID = process.env.AUTH0_MANAGEMENT_CLIENT_ID
    const AUTH0_CLIENT_SECRET = process.env.AUTH0_MANAGEMENT_CLIENT_SECRET

    if (!AUTH0_DOMAIN || !AUTH0_CLIENT_ID || !AUTH0_CLIENT_SECRET) {
      console.error('Missing Auth0 Management API configuration:', {
        domain: !!AUTH0_DOMAIN,
        clientId: !!AUTH0_CLIENT_ID,
        clientSecret: !!AUTH0_CLIENT_SECRET
      })
      return NextResponse.json(
        { error: 'Configuración del servidor incompleta' },
        { status: 500 }
      )
    }

    // Get Management API access token
    const tokenResponse = await fetch(`https://${AUTH0_DOMAIN}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: AUTH0_CLIENT_ID,
        client_secret: AUTH0_CLIENT_SECRET,
        audience: `https://${AUTH0_DOMAIN}/api/v2/`,
        grant_type: 'client_credentials'
      }),
    })

    if (!tokenResponse.ok) {
      console.error('Failed to get Auth0 management token')
      return NextResponse.json(
        { error: 'Error de configuración del servidor' },
        { status: 500 }
      )
    }

    const { access_token } = await tokenResponse.json()

    // Check if user already exists
    const checkUserResponse = await fetch(`https://${AUTH0_DOMAIN}/api/v2/users-by-email?email=${encodeURIComponent(email.toLowerCase())}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${access_token}`,
      },
    })

    if (checkUserResponse.ok) {
      const existingUsers = await checkUserResponse.json()
      if (existingUsers && existingUsers.length > 0) {
        return NextResponse.json(
          {
            error: 'Ya existe una cuenta con este email',
            type: 'existing_account',
            message: 'Ya tienes una cuenta registrada con este email. Inicia sesión para acceder.',
            action: 'login'
          },
          { status: 409 }
        )
      }
    }

    // Create user in Auth0
    const cleanEmail = email.toLowerCase().trim()
    const cleanUsername = username.toLowerCase().trim()

    const userResponse = await fetch(`https://${AUTH0_DOMAIN}/api/v2/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${access_token}`,
      },
      body: JSON.stringify({
        email: cleanEmail,
        username: cleanUsername, // User-provided username
        password: password,
        name: name.trim(),
        connection: 'Username-Password-Authentication', // Default Auth0 database connection
        email_verified: false, // Require email verification
        verify_email: true, // Send verification email
        user_metadata: {
          company: company?.trim() || null,
          signup_date: new Date().toISOString(),
          plan: 'free'
        },
        app_metadata: {
          businessID: null, // Will be set after email verification
          role: 'user',
          platforms_allowed: ['osign'] // Platform access control
        }
      }),
    })

    console.log('[REGISTER] Creating Auth0 user with username:', cleanUsername)

    const userResult = await userResponse.json()

    if (!userResponse.ok) {
      console.error('Auth0 user creation failed:', userResult)

      if (userResult.code === 'user_exists') {
        return NextResponse.json(
          {
            error: 'Ya existe una cuenta con este email',
            type: 'existing_account',
            message: 'Ya tienes una cuenta registrada con este email. Inicia sesión para acceder.',
            action: 'login'
          },
          { status: 409 }
        )
      }

      return NextResponse.json(
        { error: userResult.message || 'Error al crear la cuenta' },
        { status: 400 }
      )
    }

    console.log('[REGISTER] User created in Auth0:', userResult.email)

    return NextResponse.json({
      success: true,
      message: 'Usuario registrado exitosamente. Revisa tu email para verificar tu cuenta.',
      userId: userResult.user_id
    })

  } catch (error) {
    console.error('[REGISTER] Error registering user in Auth0:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}