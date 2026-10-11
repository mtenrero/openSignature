/**
 * Guarda de seguridad: en modo test (E2E_TEST_MODE=true) NINGUN proveedor
 * externo de email/SMS puede enviar nada, con independencia de las
 * credenciales que cargue Next desde .env.local.
 */
export function isTestMode(): boolean {
  return process.env.E2E_TEST_MODE === 'true'
}
