import moment from 'moment'

export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
const { convert } = require('html-to-text');
import Handlebars from "handlebars";
import { 
  getContractsCollection,
  getSignaturesCollection,
  CustomerEncryption,
  mongoHelpers,
  handleDatabaseError 
} from '../../../../../lib/db/mongodb'
import { ObjectId } from 'mongodb'

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ contract: string }> }
) {
  try {
    const params = await context.params
    const body = await request.json()
    const customerId = body.customerId || 'default'

    moment.locale("es")

    // Get collection for this customer
    const contractsCollection = await getContractsCollection()
    const signaturesCollection = await getSignaturesCollection()

    // Find contract by ID
    const contract = await contractsCollection.findOne({
      _id: new ObjectId(params.contract),
      customerId: customerId,
      type: 'contract'
    })

    if (!contract) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 })
    }

    // Decrypt sensitive fields
    const decryptedContract = CustomerEncryption.decryptSensitiveFields(contract, customerId)
    
    // Add current date to template data
    if (!decryptedContract.templateData) {
      decryptedContract.templateData = {}
    }
    decryptedContract.templateData['date'] = moment().format('DD/MM/YYYY')
    
    const htmlContract = Handlebars.compile(decryptedContract.content || decryptedContract.template || '')

    // Generate PDF content (simplified for build compatibility)
    const compiledContent = htmlContract(decryptedContract.templateData)
    const pdfContent = convert(compiledContent, { wordwrap: 130 })
    
    // For now, store the text content as base64 (in production, generate actual PDF)
    const base64 = Buffer.from(pdfContent).toString('base64')

    // Create signature record
    const signatureData = mongoHelpers.addMetadata({
      contractId: params.contract,
      signature: body.signature,
      pdf: base64,
      status: 'completed',
      userAgent: body.userAgent || '',
      ipAddress: body.ipAddress || '',
      location: body.location || '',
      metadata: body.metadata || {},
      type: 'signature'
    }, customerId)

    // Encrypt and save signature
    const encryptedSignature = CustomerEncryption.encryptSensitiveFields(signatureData, customerId)
    await signaturesCollection.insertOne(encryptedSignature)

    // Update contract status
    const updatedContractData = {
      ...decryptedContract,
      status: "signed",
      signed: true,
      completed: true,
      signDate: moment().format("DD/MM/YYYY HH:mm:ss"),
      updatedAt: new Date()
    }

    // Encrypt and save updated contract
    const encryptedContract = CustomerEncryption.encryptSensitiveFields(updatedContractData, customerId)
    await contractsCollection.updateOne(
      { _id: new ObjectId(params.contract), customerId: customerId },
      { $set: encryptedContract }
    )

    return NextResponse.json({
      status: "OK",
    })
  } catch (error) {
    console.error('Error completing contract:', error)
    const errorResponse = handleDatabaseError(error)
    return NextResponse.json(
      { error: errorResponse.error },
      { status: errorResponse.status }
    )
  }
}
