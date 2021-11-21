import '../styles/globals.css'
import type { AppProps } from 'next/app'
import React from 'react'
import { Grommet, Main, Header, Button, Menu } from 'grommet'

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <Grommet plain>
      <Main
        border={{ color: 'brand', size: 'large' }}
      >
        <Header background="brand">
          <Button hoverIndicator label="OpenSignature"/>
          <Menu label="account" items={[{ label: 'logout' }]} />
        </Header>
        <Component {...pageProps} />
      </Main>
    </Grommet>
  )
  
  
}

export default MyApp
