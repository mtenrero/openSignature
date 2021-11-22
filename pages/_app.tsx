import '../styles/globals.css'
import type { AppProps } from 'next/app'
import React from 'react'
import { Grommet, Main, Header, Button, Menu, Heading } from 'grommet'

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <Grommet plain>
      <Header background="brand">
        <Heading margin="medium" level="3">{process.env.BRAND || "OpenSignature"}</Heading>
      </Header>
      <Main margin={{top: "20px"}}>

        <Component {...pageProps} />
      </Main>
    </Grommet>
  )
  
  
}

export default MyApp
