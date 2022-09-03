import { Container, Grid, SimpleGrid, Skeleton, useMantineTheme } from '@mantine/core'
import React from 'react'
import { SessionProvider } from "next-auth/react"
import { List } from '../../../components/ui/List';

export default function Contracts(props: any) {
  const theme = useMantineTheme();
  const PRIMARY_COL_HEIGHT = 300;
  const SECONDARY_COL_HEIGHT = PRIMARY_COL_HEIGHT / 2 - theme.spacing.md / 2;
  const data = [

  ]
    return (
      <List data={data}/>
    )
}