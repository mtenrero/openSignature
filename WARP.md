# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

OpenSignature is a digital signature platform built with Next.js that provides legally compliant electronic signatures with eIDAS (European Electronic Identification and Trust Services) compliance. The platform supports multiple signature methods including handwritten signatures, SMS verification, and email-based signing.

**Key Technologies:**
- Next.js 15+ with App Router
- TypeScript
- NextAuth v5 with mandatory Auth0 authentication
- PouchDB/CouchDB for offline-first data storage
- Mantine UI components
- eIDAS SES (Simple Electronic Signature) compliance
- PDF generation with embedded verification

## Common Development Commands

### Setup and Initialization
```bash
# Interactive environment setup
npm run setup

# Initialize CouchDB databases (after CouchDB is running)
npm run init-db

# Install dependencies
npm install
```

### Development
```bash
# Start development server
npm run dev

# Start with Turbo (faster)
npm run dev:turbo

# Build for production
npm run build

# Start production server
npm start

# Lint code
npm run lint
```

### Database Operations
```bash
# Initialize CouchDB databases
npm run init-db

# Test API endpoints
node test-api.js

# Test MongoDB connection
node scripts/test-mongodb.js

# Migrate customer data
node scripts/migrate-customer-data.js
```

## Architecture Overview

### Authentication Flow
- **Auth0 Integration**: The application exclusively uses Auth0 for authentication (no alternative providers)
- **Customer ID Extraction**: Auth0 tokens contain customer/business IDs that are extracted for multi-tenant isolation
- **Mandatory Authentication**: All routes except public signing pages and specific API endpoints require authentication
- **Session Management**: JWT-based sessions with 30-day expiration

### Database Architecture
**Dual Database Strategy:**
- **PouchDB/CouchDB**: Primary database for contracts, signatures, and templates with offline-first capabilities
- **MongoDB**: Used for certain operations with customer-based encryption
- **Customer Isolation**: All data is partitioned by customer ID extracted from Auth0 tokens

**Database Schema:**
- `opensignature_contracts`: Contract documents and metadata
- `opensignature_signatures`: Signature records with eIDAS compliance data
- `opensignature_templates`: Reusable contract templates

### eIDAS Compliance System
The platform implements Simple Electronic Signature (SES) compliance under the eIDAS regulation:
- **Evidence Package Creation**: Comprehensive audit trails and verification data
- **Timestamp Authority Integration**: Qualified timestamps for legal validity
- **Document Integrity**: SHA-256 hashing and integrity verification
- **Signature Methods**: Support for SMS, handwritten, and email signatures
- **PDF Generation**: Legally compliant PDFs with embedded verification data

### Data Encryption
- **Customer-based Encryption**: Sensitive fields are encrypted using customer-specific keys
- **Automatic Encryption/Decryption**: Transparent handling in API routes
- **Multi-tenant Security**: Each customer's data is encrypted with unique keys

## Key Components

### API Routes (`app/api/`)
- `contracts/route.ts`: CRUD operations for contracts with customer isolation
- `signatures/route.ts`: Signature creation and management
- `sign-requests/route.ts`: Public signing workflow endpoints
- `session/route.ts`: Session management and customer identification

### Authentication (`lib/auth/config.ts`)
- NextAuth v5 configuration with Auth0 provider
- Customer ID extraction from Auth0 tokens with multiple fallback strategies
- JWT callback customization for session data

### Database Layers (`lib/db/`)
- `pouchdb.ts`: PouchDB configuration with CouchDB sync and memory fallbacks
- `mongodb.ts`: MongoDB integration with customer encryption
- Lazy initialization to avoid SSR issues

### eIDAS Implementation (`lib/eidas/`)
- `sesSignature.ts`: SES signature creation and verification
- `integration.ts`: Integration with existing signature system
- `timestampClient.ts`: Qualified timestamp authority integration

### PDF Generation (`lib/pdf/`)
- `signedContractGenerator.ts`: Generate legally compliant PDFs with verification data
- CSV verification data embedding
- QR code integration for easy verification

## Environment Configuration

### Required Environment Variables
```bash
# NextAuth (required)
NEXTAUTH_SECRET=your-secure-secret-key
NEXTAUTH_URL=http://localhost:3000

# Auth0 (required - application will fail without these)
AUTH0_CLIENT_ID=your-auth0-client-id
AUTH0_CLIENT_SECRET=your-auth0-client-secret
AUTH0_ISSUER=https://your-domain.auth0.com

# CouchDB (optional for development)
COUCHDB_URL=http://localhost:5984
COUCHDB_USERNAME=admin  # optional
COUCHDB_PASSWORD=password  # optional

# Application
BRAND=OpenSignature
NODE_ENV=development
NEXT_PUBLIC_APP_NAME=OpenSignature
```

### Auth0 Configuration Requirements
The application requires specific Auth0 setup:
- **Application Type**: Regular Web Application
- **Allowed Callback URLs**: `http://localhost:3000/api/auth/callback/auth0`
- **Allowed Logout URLs**: `http://localhost:3000`
- **Customer ID Source**: Must be available in `app_metadata.businessID` or custom claims

## Development Patterns

### Customer Context
All database operations must include customer context:
```typescript
// Extract customer ID from session
const session = await auth()
const customerId = session.customerId

// Use in database queries
const query = { customerId: customerId, type: 'contract' }
```

### Error Handling
The platform uses consistent error handling:
- Database errors are handled via `handleDatabaseError()`
- API routes return structured error responses
- Client-side error boundaries for React components

### Signature Workflow
1. **Contract Creation**: User creates contract with dynamic fields
2. **Signing Request**: Generate public signing link
3. **Signature Capture**: Collect signature via various methods (handwritten, SMS, email)
4. **eIDAS Processing**: Create SES-compliant signature with evidence package
5. **PDF Generation**: Generate legally compliant PDF with verification data

## Testing and Development

### Local CouchDB Setup
```bash
# Install CouchDB (macOS)
brew install couchdb
brew services start couchdb

# Create required databases
npm run init-db
```

### Testing APIs
```bash
# Test API endpoints
node test-api.js

# Test specific contract operations
node scripts/test-contract-fixes.js
```

### Database Fallbacks
The system automatically falls back to in-memory databases when CouchDB is unavailable, making development possible without external dependencies.

## Production Considerations

### Security Requirements
- Use HTTPS in production
- Secure Auth0 credentials and callback URLs
- Implement proper CouchDB authentication
- Customer data encryption is mandatory

### Performance Optimizations
- Database indexes are automatically created for common queries
- Lazy database initialization prevents SSR issues
- Mantine components are optimized for bundle size

### Legal Compliance
- eIDAS SES compliance is built-in
- Evidence packages include all required audit trail data
- PDF documents embed verification information
- Qualified timestamps ensure legal validity

## Debugging Tips

### Authentication Issues
- Check Auth0 callback URLs match exactly
- Verify customer ID extraction in JWT callback
- Enable debug mode in development: `debug: true` in NextAuth config

### Database Issues
- Check CouchDB connectivity: `curl http://localhost:5984/`
- Verify database creation with `npm run init-db`
- Memory fallbacks activate automatically if CouchDB is unavailable

### eIDAS Compliance
- Verify document hashing integrity
- Check timestamp authority responses
- Ensure all required evidence is collected during signing
