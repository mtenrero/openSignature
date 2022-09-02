import { Anchor } from "@mantine/core"
import { useSession, signIn, signOut } from "next-auth/react"
import Link from "next/link"

export default function Component() {
  const { data: session } = useSession()
  if (session) {
    return (
      <>
        {session.user.email} <br />
        <button onClick={() => signOut()}>Sign out</button>
      </>
    )
  }
  return (
    <>
      <Anchor onClick={() => signIn()}>Sign in</Anchor>
    </>
  )
}