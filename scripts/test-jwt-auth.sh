#!/bin/bash

# Test JWT token authentication
# Replace with your actual token
TOKEN="eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6Ik9ZcHBGOVE1MnVVa0cyN2oxelA2ZiJ9.eyJpc3MiOiJodHRwczovL3ZldGNvbnRyb2wtcHJvLmV1LmF1dGgwLmNvbS8iLCJzdWIiOiI3VEZvako1eDFHWklKWDFmYkhmRzZiakNLUTVJaTBlN0BjbGllbnRzIiwiYXVkIjoiaHR0cHM6Ly9vc2lnbi5ldSIsImlhdCI6MTc1OTQ5ODAyNywiZXhwIjoxNzU5NTg0NDI3LCJzY29wZSI6InJlYWQ6Y29udHJhY3RzIHdyaXRlOmNvbnRyYWN0cyByZWFkOnNpZ25hdHVyZXMgd3JpdGU6c2lnbmF0dXJlcyIsImd0eSI6ImNsaWVudC1jcmVkZW50aWFscyIsImF6cCI6IjdURm9qSjV4MUdaSUpYMWZiSGZHNmJqQ0tRNUlpMGU3In0.taqfkMuVii5ifoH8LtSHzNbpyo2JvF9SoBYdasGiCnaGzl2mLryabD6sJQf2lzrNXt8pGsVu45z5Uq3JwpDpCt46cS9W8dvn1YnyjOeB-CqXAYYL8h9hK2YN7LXwzvfsRJfD6opuEAtTf8S6pptJUA-zBSQVYdsz-nKWgFct4AlTg14Vv8h8X0EMP_R9qQbviUMvYPdXnUSRl8AV0KShdew8usIa_B9wkgo24grjbXpS2b4CbqBuT5FDj1AP1xjgNCcPMpdoEyrSVYOtHMvVbRw4r_NK4mYEcms8zV0Lw5HidWj7Q6-WL09IaH0TBHwkPb_It18aTWnqXpqfvmMjpA"

echo "Testing /api/contracts with JWT Bearer token..."
curl -X GET "http://localhost:3000/api/contracts?limit=50&skip=0" \
  -H "accept: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -s | jq '.'

echo ""
echo "Testing /api/signatures with JWT Bearer token..."
curl -X GET "http://localhost:3000/api/signatures?limit=50&skip=0" \
  -H "accept: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -s | jq '.'
