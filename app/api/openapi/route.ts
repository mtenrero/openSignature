import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { getDatabase } from '@/lib/db/mongodb'
import { validateOAuthToken } from '@/lib/auth/oauth'

export const runtime = 'nodejs'

async function isAuthorized(request: NextRequest) {
  try {
    const session = await auth()
    if (session?.user?.id) return true
  } catch (_) {}

  // Fallback: allow API key or OAuth token via Authorization: Bearer <key>
  try {
    const authHeader = request.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!token) return false

    const db = await getDatabase()

    // Check if it's an API key
    const collection = db.collection('esign_apikeys')
    const apiKey = await collection.findOne({ _id: token })
    if (apiKey) return true

    // Check if it's an OAuth token
    const isValidOAuth = await validateOAuthToken(token)
    return isValidOAuth
  } catch (_) {
    return false
  }
}

function baseUrl() {
  return process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000'
}

export async function GET(request: NextRequest) {
  const ok = await isAuthorized(request)
  if (!ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const servers = [{ url: baseUrl() }]

  const openapi = {
    openapi: '3.0.3',
    info: {
      title: 'oSign.EU API',
      version: '1.0.0',
      description: `
# oSign.EU API Documentation

Official REST API for electronic signature management.

## Authentication

This API uses **OAuth 2.0 Client Credentials** flow for authentication.

### Step 1: Obtain Access Token

Make a POST request to \`/api/oauth/token\` with your credentials:

\`\`\`bash
curl -X POST https://osign.eu/api/oauth/token \\
  -H "Content-Type: application/json" \\
  -d '{
    "grant_type": "client_credentials",
    "client_id": "YOUR_CLIENT_ID",
    "client_secret": "YOUR_CLIENT_SECRET",
    "audience": "https://osign.eu"
  }'
\`\`\`

Response:
\`\`\`json
{
  "access_token": "eyJhbGc...",
  "token_type": "Bearer",
  "expires_in": 86400
}
\`\`\`

### Step 2: Use Access Token

Include the access token in the Authorization header for all API requests:

\`\`\`bash
curl https://osign.eu/api/contracts \\
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
\`\`\`

### Getting Credentials

Contact support to obtain your \`client_id\` and \`client_secret\`.

## Rate Limiting

API requests are rate-limited based on your subscription plan.

## Support

For API support, contact: api@osign.eu
      `
    },
    servers,
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: `
**How to authenticate:**

1. Get your access token from \`/api/oauth/token\`:
   \`\`\`bash
   curl -X POST ${baseUrl()}/api/oauth/token \\
     -H "Content-Type: application/json" \\
     -d '{
       "grant_type": "client_credentials",
       "client_id": "YOUR_CLIENT_ID",
       "client_secret": "YOUR_CLIENT_SECRET",
       "audience": "https://osign.eu"
     }'
   \`\`\`

2. Copy the \`access_token\` from the response

3. Click "Authorize" button and paste the token (without "Bearer" prefix)

4. The token will be automatically included in all requests as:
   \`Authorization: Bearer YOUR_TOKEN\`

**Token expires in 24 hours.** Request a new token when needed.
          `
        }
      },
      schemas: {
        Error: {
          type: 'object',
          properties: { error: { type: 'string' }, errorCode: { type: 'string' } }
        },
        Contract: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            content: { type: 'string' },
            status: { type: 'string', enum: ['draft', 'signed', 'archived'] }
          },
          required: ['id', 'name', 'status']
        },
        SignatureRequest: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            shortId: { type: 'string' },
            contractId: { type: 'string' },
            signatureType: { type: 'string', enum: ['email', 'sms', 'local', 'tablet', 'qr'] },
            status: { type: 'string' },
            signatureUrl: { type: 'string' }
          }
        },
        SignRequestPublic: {
          type: 'object',
          properties: {
            authorized: { type: 'boolean' },
            signRequest: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                shortId: { type: 'string' },
                status: { type: 'string' }
              }
            },
            contract: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                content: { type: 'string' }
              }
            }
          }
        }
      }
    },
    security: [{ BearerAuth: [] }],
    paths: {
      '/api/oauth/token': {
        post: {
          summary: 'OAuth2 Token Endpoint',
          description: 'Request access tokens using client credentials for server-to-server authentication.',
          tags: ['OAuth2'],
          security: [],
          requestBody: {
            required: true,
            content: {
              'application/x-www-form-urlencoded': {
                schema: {
                  type: 'object',
                  properties: {
                    grant_type: { type: 'string', enum: ['client_credentials'], description: 'OAuth2 grant type' },
                    client_id: { type: 'string', description: 'Your application client ID' },
                    client_secret: { type: 'string', description: 'Your application client secret' },
                    audience: { type: 'string', description: 'Optional API audience (default: https://osign.eu)', example: 'https://osign.eu' },
                    scope: { type: 'string', description: 'Optional space-separated list of scopes', example: 'read:contracts write:contracts' }
                  },
                  required: ['grant_type', 'client_id', 'client_secret']
                }
              },
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    grant_type: { type: 'string', enum: ['client_credentials'], description: 'Must be "client_credentials"' },
                    client_id: { type: 'string', description: 'Your application client ID' },
                    client_secret: { type: 'string', description: 'Your application client secret' },
                    audience: { type: 'string', description: 'Optional API audience (default: https://osign.eu)', example: 'https://osign.eu' },
                    scope: { type: 'string', description: 'Optional space-separated list of scopes', example: 'read:contracts write:contracts' }
                  },
                  required: ['grant_type', 'client_id', 'client_secret']
                }
              }
            }
          },
          responses: {
            '200': {
              description: 'Token successfully issued',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      access_token: { type: 'string', description: 'The access token for API authentication' },
                      token_type: { type: 'string', example: 'Bearer' },
                      expires_in: { type: 'integer', description: 'Token lifetime in seconds' },
                      scope: { type: 'string', description: 'Granted scopes' }
                    }
                  }
                }
              }
            },
            '400': {
              description: 'Bad request - invalid parameters',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      error: { type: 'string', example: 'invalid_request' },
                      error_description: { type: 'string' }
                    }
                  }
                }
              }
            },
            '401': {
              description: 'Unauthorized - invalid client credentials',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      error: { type: 'string', example: 'invalid_client' },
                      error_description: { type: 'string' }
                    }
                  }
                }
              }
            },
            '403': {
              description: 'Forbidden - client not authorized for the requested audience',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      error: { type: 'string', example: 'access_denied' },
                      error_description: { type: 'string', example: 'Client is not authorized to access "https://osign.eu"' }
                    }
                  }
                }
              }
            }
          }
        }
      },
      '/api/status': {
        get: {
          summary: 'Health check',
          responses: { '200': { description: 'OK' } }
        }
      },
      '/api/contracts': {
        get: {
          summary: 'List contracts',
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'status', in: 'query', schema: { type: 'string' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
            { name: 'skip', in: 'query', schema: { type: 'integer', default: 0 } }
          ],
          responses: {
            '200': {
              description: 'Contracts',
              content: { 'application/json': { schema: { type: 'object', properties: { contracts: { type: 'array', items: { $ref: '#/components/schemas/Contract' } }, total: { type: 'integer' }, hasMore: { type: 'boolean' } } } } }
            },
            '401': { description: 'Unauthorized' }
          }
        },
        post: {
          summary: 'Create contract',
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    description: { type: 'string' },
                    content: { type: 'string' }
                  },
                  required: ['name']
                }
              }
            }
          },
          responses: { '201': { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Contract' } } } }, '401': { description: 'Unauthorized' } }
        }
      },
      '/api/signature-requests': {
        get: {
          summary: 'List signature requests',
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'status', in: 'query', schema: { type: 'string' } },
            { name: 'contractId', in: 'query', schema: { type: 'string' } }
          ],
          responses: { '200': { description: 'OK' }, '401': { description: 'Unauthorized' } }
        },
        post: {
          summary: 'Create signature request',
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    contractId: { type: 'string' },
                    signatureType: { type: 'string', enum: ['email', 'sms', 'local', 'tablet', 'qr'] },
                    signerName: { type: 'string' },
                    signerEmail: { type: 'string' },
                    signerPhone: { type: 'string' }
                  },
                  required: ['contractId', 'signatureType']
                }
              }
            }
          },
          responses: { '200': { description: 'OK' }, '401': { description: 'Unauthorized' } }
        }
      },
      '/api/signature-requests/{id}': {
        get: {
          summary: 'Get signature request',
          security: [{ BearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'OK' }, '404': { description: 'Not found' } }
        },
        patch: {
          summary: 'Update signature request (archive/resend)',
          security: [{ BearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { action: { type: 'string', enum: ['archive', 'resend'] } } } } } },
          responses: { '200': { description: 'OK' } }
        },
        delete: {
          summary: 'Delete/discard signature request',
          security: [{ BearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'OK' } }
        }
      },
      '/api/signature-requests/{id}/archive': {
        post: {
          summary: 'Archive signature request and process refund if applicable',
          security: [{ BearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'OK' } }
        }
      },
      '/api/sign-requests': {
        get: {
          summary: 'List sign requests (legacy/internal)',
          security: [{ BearerAuth: [] }],
          responses: { '200': { description: 'OK' } }
        },
        post: {
          summary: 'Create sign request (legacy/internal)',
          security: [{ BearerAuth: [] }],
          requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { contractId: { type: 'string' }, recipientEmail: { type: 'string' }, recipientPhone: { type: 'string' } }, required: ['contractId'] } } } },
          responses: { '201': { description: 'Created' } }
        }
      },
      '/api/sign-requests/{shortId}': {
        get: {
          summary: 'Validate and get sign request details (public)',
          parameters: [
            { name: 'shortId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'a', in: 'query', required: true, schema: { type: 'string' }, description: 'Access key' }
          ],
          responses: { '200': { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/SignRequestPublic' } } } }, '404': { description: 'Not found' } }
        },
        put: {
          summary: 'Complete signature (public)',
          parameters: [
            { name: 'shortId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'a', in: 'query', required: true, schema: { type: 'string' }, description: 'Access key' }
          ],
          requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { signature: { type: 'string' }, dynamicFieldValues: { type: 'object' } }, required: ['signature'] } } } },
          responses: { '200': { description: 'OK' } }
        }
      },
      '/api/sign-requests/{shortId}/pdf': {
        get: {
          summary: 'Download signed contract PDF (public)',
          parameters: [
            { name: 'shortId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'a', in: 'query', required: true, schema: { type: 'string' } }
          ],
          responses: { '200': { description: 'PDF' }, '400': { description: 'Bad request' } }
        }
      },
      '/api/signatures': {
        get: {
          summary: 'List signatures',
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'contractId', in: 'query', schema: { type: 'string' } },
            { name: 'status', in: 'query', schema: { type: 'string' } }
          ],
          responses: { '200': { description: 'OK' } }
        },
        post: {
          summary: 'Create signature (server-to-server)',
          security: [{ BearerAuth: [] }],
          requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { contractId: { type: 'string' }, signature: { type: 'string' } }, required: ['contractId', 'signature'] } } } },
          responses: { '201': { description: 'Created' } }
        }
      }
    }
  }

  return NextResponse.json(openapi)
}



