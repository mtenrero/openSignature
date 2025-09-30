# Flujos de API / API Flows

## Crear contrato / Create Contract

Request:
```bash
curl -X POST "$BASE_URL/api/contracts" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name":"Contrato de servicio",
    "content":"<h1>Contrato</h1> ...",
    "description":"Ejemplo"
  }'
```

## Solicitar firma / Create Signature Request
```bash
curl -X POST "$BASE_URL/api/signature-requests" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contractId":"<ID_DEL_CONTRATO>",
    "signatureType":"email",
    "signerEmail":"cliente@example.com"
  }'
```

Respuesta incluye `shortId` y `signatureUrl`.

## Consultar estado / Check Status
```bash
curl "$BASE_URL/api/signature-requests?contractId=<ID_DEL_CONTRATO>" \
  -H "Authorization: Bearer $API_KEY"
```

## Completar firma (público) / Complete Signature (public)
```bash
curl -X PUT "$BASE_URL/api/sign-requests/<shortId>?a=<accessKey>" \
  -H "Content-Type: application/json" \
  -d '{
    "signature":"data:image/png;base64,....",
    "dynamicFieldValues": { "clientName":"ACME", "clientTaxId":"B123" }
  }'
```

## Descargar PDF firmado (público) / Download Signed PDF (public)
```bash
curl -L "$BASE_URL/api/sign-requests/<shortId>/pdf?a=<accessKey>" -o contrato_firmado.pdf
```

