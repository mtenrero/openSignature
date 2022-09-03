import { Center, Button, Container, Grid, LoadingOverlay, SimpleGrid, Skeleton, useMantineTheme, Title } from '@mantine/core'
import React, { useEffect, useState } from 'react'
import { List } from '../../../components/ui/List';

export default function Contracts(props: any) {
  const [contracts, setContracts] = useState(null)
  const [isLoading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetch('/api/contracts')
      .then((res) => res.json())
      .then((data) => {
        setContracts(data.rows)
        setLoading(false)
      })
  }, [])

  const theme = useMantineTheme();
  const PRIMARY_COL_HEIGHT = 300;
  const SECONDARY_COL_HEIGHT = PRIMARY_COL_HEIGHT / 2 - theme.spacing.md / 2;

  const TITLE = () => {
    return (
      <Title order={1}>Contracts</Title>
    )
  }

  if (isLoading){
    return (
      <div>
        {TITLE()}
        <LoadingOverlay visible={isLoading}>
          <List data={contracts}/>
        </LoadingOverlay>
      </div>
    )
  } else {
    if (contracts && contracts.rows && contracts.rows.length > 0) {
      return (
        <div>
          {TITLE()}
          <LoadingOverlay visible={isLoading}>
            <List data={contracts}/>
          </LoadingOverlay>
        </div>
      )
    } else {
      return (
        <div>
          {TITLE()}
          <Center>
            <Button>No data, create first contract</Button>
          </Center>
        </div>
      )
    }
  }
}