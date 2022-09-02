import '../styles/globals.css'
import type { AppProps } from 'next/app'
import React from 'react'
import { MantineProvider } from '@mantine/core'
import Header from '../components/header'
import { SessionProvider } from 'next-auth/react'

function MyApp({ Component, pageProps: { session, ...pageProps } }: AppProps) {
  return (
    <SessionProvider session={session}>
    <MantineProvider
        withGlobalStyles
        withNormalizeCSS
        withCSSVariables
        theme={{
          /** Put your mantine theme override here */
          colorScheme: 'light',
        }}
      >
      <Header></Header>

        <Component {...pageProps} />
    </MantineProvider>
    </SessionProvider>
  )
  
  
}

export default MyApp
