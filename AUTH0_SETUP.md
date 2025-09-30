# Auth0 Setup Guide for oSign.EU

This guide will help you configure Auth0 properly for oSign.EU's subscription management system.

## Problem

If you're seeing this error:
```
Error getting subscription info: Error: Failed to get Auth0 management token: Forbidden
Grant type 'client_credentials' not allowed for the client
```

This means your Auth0 application is not configured for Machine-to-Machine access, which is required for subscription management.

## Solution

You need to create or configure a Machine-to-Machine application in Auth0 for Management API access.

### Option 1: Create a Dedicated Machine-to-Machine Application (Recommended)

1. **Go to Auth0 Dashboard**
   - Navigate to https://manage.auth0.com
   - Select your tenant

2. **Create Machine-to-Machine Application**
   - Go to **Applications** in the sidebar
   - Click **+ Create Application**
   - Choose **Machine to Machine Applications**
   - Name it: `oSign.EU Management API`
   - Click **Create**

3. **Configure API Access**
   - Select the **Auth0 Management API** from the dropdown
   - Click **Authorize**

4. **Grant Required Scopes**
   In the scopes section, enable these permissions:
   - `read:users` - Read user profiles
   - `update:users` - Update user profiles
   - `read:user_metadata` - Read user metadata
   - `update:user_metadata` - Update user metadata

   Click **Update** to save.

5. **Get Credentials**
   - Go to the **Settings** tab of your new M2M application
   - Copy the **Client ID** and **Client Secret**

6. **Update Environment Variables**
   Add these new variables to your `.env.local`:
   ```env
   AUTH0_M2M_CLIENT_ID=your_machine_to_machine_client_id
   AUTH0_M2M_CLIENT_SECRET=your_machine_to_machine_client_secret
   ```

### Option 2: Enable Machine-to-Machine for Existing App

If you prefer to use your existing application:

1. **Go to Your Application**
   - In Auth0 Dashboard, go to **Applications**
   - Select your existing oSign.EU application

2. **Enable Management API**
   - Go to the **APIs** tab
   - Find "Auth0 Management API" and toggle it **ON**
   - Grant the same scopes listed above
   - Click **Update**

3. **Update Application Type** (if needed)
   - Go to the **Settings** tab
   - Scroll down to **Application Type**
   - If it's set to "Single Page Application", change it to "Regular Web Application"
   - Save changes

## Environment Variables

Your `.env.local` should include:

```env
# Main Auth0 Application (for user authentication)
AUTH0_CLIENT_ID=your-auth0-client-id-here
AUTH0_CLIENT_SECRET=your-auth0-client-secret-here
AUTH0_ISSUER=https://your-domain.auth0.com

# Auth0 Machine-to-Machine Application (for Management API access)
# Required for subscription management, user metadata access
AUTH0_M2M_CLIENT_ID=your-auth0-m2m-client-id-here
AUTH0_M2M_CLIENT_SECRET=your-auth0-m2m-client-secret-here
```

## Testing the Configuration

Run this command to test your Auth0 setup:

```bash
node scripts/test-auth0-management.js
```

You should see:
- ✅ Token obtained successfully
- ✅ Management API access successful

## What This Enables

With proper Auth0 Management API access, oSign.EU can:

- 📊 **Subscription Management**: Read and update user subscription plans
- 👤 **User Metadata**: Store subscription status, Stripe customer IDs
- 🔒 **Access Control**: Verify user permissions and plan limits
- 📈 **Usage Tracking**: Monitor user activity and billing information

## Troubleshooting

### Still getting "Forbidden" errors?

1. **Check Scopes**: Ensure all required scopes are granted
2. **Wait for Propagation**: Changes can take a few minutes to propagate
3. **Verify Credentials**: Double-check Client ID and Secret are correct
4. **Check Domain**: Ensure AUTH0_ISSUER matches your tenant domain exactly

### Need to verify current setup?

Run the test script:
```bash
node scripts/test-auth0-management.js
```

### Application Type Issues?

Machine-to-Machine applications are separate from your main authentication app:
- **Regular Web App**: Handles user login/logout
- **Machine-to-Machine**: Handles server-to-server API calls

Both are needed for a complete setup.

## Security Notes

- Machine-to-Machine credentials have elevated privileges
- Store them securely in environment variables
- Never commit them to version control
- Rotate them regularly in production
- Grant only the minimum required scopes

---

For more information, see the [Auth0 Management API documentation](https://auth0.com/docs/api/management/v2).