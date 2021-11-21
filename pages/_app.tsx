import '../styles/globals.css'
import type { AppProps } from 'next/app'
import React from 'react'
import { Grommet, Main, Header, Button, Menu } from 'grommet'

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <Grommet plain>
      <Header background="brand">
          <Button margin="10px" hoverIndicator label={process.env.BRAND || "OpenSignature"}/>
          <Menu label="account" items={[{ label: 'logout' }]} />
      </Header>
      <Main margin={{top: "20px"}} align="center">

        <Component {...pageProps} />
      </Main>
    </Grommet>
  )
  
  
}

export default MyApp
