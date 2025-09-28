import { NextRequest, NextResponse } from 'next/server'
import { 
  getDatabase,
  handleDatabaseError 
} from '../../../lib/db/mongodb'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const apikey = request.headers.get('authorization') || ""
    const token = apikey.split(' ')[1]

    if (!token) {
      return NextResponse.json({ error: 'No API key provided' }, { status: 401 })
    }

    // Get database and collection for API keys
    const db = await getDatabase()
    const collection = db.collection('esign_apikeys')
    
    // Find API key details
    const apiKeyDetails = await collection.findOne({ _id: token })
    
    if (!apiKeyDetails) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
    }

    return NextResponse.json(apiKeyDetails)
  } catch (error) {
    console.error('Error validating API key:', error)
    const errorResponse = handleDatabaseError(error)
    return NextResponse.json(
      { error: errorResponse.error },
      { status: errorResponse.status }
    )
  }
}
