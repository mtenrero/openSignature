'use client'
import React from 'react'
import SwaggerUI from 'swagger-ui-react'
import 'swagger-ui-react/swagger-ui.css'

export default function ClientSwagger({ url }: { url: string }) {
  return (
    <SwaggerUI url={url} docExpansion="list" defaultModelsExpandDepth={0} />
  )
}



