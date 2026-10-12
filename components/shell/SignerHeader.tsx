import React from 'react'
import { Logo } from './Logo'

export function SignerHeader() {
  return (
    <header className="os-topbar os-topbar--signer" data-testid="signer-header">
      <div className="os-topbar__inner">
        <Logo size={24} />
      </div>
    </header>
  )
}
