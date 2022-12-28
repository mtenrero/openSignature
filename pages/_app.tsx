import '../styles/globals.css'
import type { AppProps } from 'next/app'
import React from 'react'
import { Container, MantineProvider } from '@mantine/core'
import { SessionProvider } from 'next-auth/react'
import Head from 'next/head'
import { Header } from '../components/header'

function MyApp({ Component, pageProps: { session, ...pageProps } }: AppProps) {
  return (
    <>
      <Head>
        <title>OpenFirma: La firma digital s</title>
        <meta name="viewport" content="minimum-scale=1, initial-scale=1, width=device-width" />
      </Head>
      <SessionProvider session={session}>
      <MantineProvider
          withGlobalStyles
          withNormalizeCSS
          withCSSVariables
          theme={{
            /** Put your mantine theme override here */
            colors: {
              ocean: ['#7AD1DD', '#5FCCDB', '#44CADC', '#2AC9DE', '#1AC2D9', '#11B7CD', '#03616D', '#0E99AC', '#128797', '#ECAD2B'],
            },
            primaryColor: 'ocean',
          }}
        >
        <Header></Header>
        <Container>
          <Component {...pageProps} />
        </Container>
      </MantineProvider>
      </SessionProvider>
    </>
  )
}

export default MyApp
