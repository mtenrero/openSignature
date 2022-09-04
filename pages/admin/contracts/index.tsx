import { Center, Button, Container, Grid, LoadingOverlay, SimpleGrid, Skeleton, useMantineTheme, Title, Group } from '@mantine/core'
import Link from 'next/link';
import React, { useEffect, useState } from 'react'
import { List } from '../../../components/ui/List';

export default function Contracts(props: any) {
  const [contracts, setContracts] = useState(null)
  const [isLoading, setLoading] = useState(false)
  const [thereIsData, setThereIsData] = useState(false)
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    setLoading(true)
    fetch('/api/contracts')
      .then((res) => res.json())
      .then((data) => {
        setContracts(data.rows)
        setLoading(false)
        setThereIsData(data.rows.length > 0)
      })
  }, [refresh])

  const forceRefresh = () => {
    setRefresh(refresh+1)
  }

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
    if (thereIsData) {
      return (
        <div>
          {TITLE()}
          <LoadingOverlay visible={isLoading}/>
          <Group position="right" mt="md">
            <Link href="/admin/contracts/add">
              <Button>New contract</Button>
            </Link>
          </Group>
          
          <List data={contracts} forceRefresh={forceRefresh}/>
        </div>
      )
    } else {
      return (
        <div>
          {TITLE()}
          <Center>
            <Link href="/admin/contracts/add">
              <Button>No data, create first contract</Button>
            </Link>
          </Center>
        </div>
      )
    }
  }
}