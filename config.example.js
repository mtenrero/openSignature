// Configuration example
// Copy this to config.js and update with your values

module.exports = {
  // NextAuth Configuration
  nextAuth: {
    secret: 'your-nextauth-secret-here',
    url: 'http://localhost:3000'
  },

  // Auth0 Configuration
  auth0: {
    clientId: 'your-auth0-client-id',
    clientSecret: 'your-auth0-client-secret',
    issuer: 'https://your-domain.auth0.com'
  },

  // CouchDB Configuration
  couchdb: {
    url: 'http://localhost:5984',
    databases: {
      users: 'oSign.EU_users',
      contracts: 'oSign.EU_contracts',
      signatures: 'oSign.EU_signatures',
      templates: 'oSign.EU_templates'
    }
  },

  // Application Configuration
  app: {
    brand: 'oSign.EU',
    nodeEnv: 'development'
  }
}
