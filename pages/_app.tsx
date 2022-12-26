import '../styles/globals.css'
import type { AppProps } from 'next/app'
import React from 'react'
import { Container, MantineProvider } from '@mantine/core'
import Header from '../components/header'
import { SessionProvider } from 'next-auth/react'
import Head from 'next/head'

function MyApp({ Component, pageProps: { session, ...pageProps } }: AppProps) {
  return (
    <>
      <Head>
        <title>OpenFirma: La firma digital sencilla</title>
        <meta name="viewport" content="minimum-scale=1, initial-scale=1, width=device-width" />
      </Head>
      <MantineProvider
          withGlobalStyles
          withNormalizeCSS
          withCSSVariables
          theme={{
            colorScheme: 'light',
          }}
        >
      <SessionProvider session={session}>
        <Header/>

        <Component {...pageProps} />
      </SessionProvider>
      </MantineProvider>
    </>
  )
}

export default MyApp
