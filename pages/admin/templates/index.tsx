import { Center, Button, LoadingOverlay, useMantineTheme, Title, Group, Space } from '@mantine/core'
import Link from 'next/link';
import React, { useEffect, useState } from 'react'
import { List } from '../../../components/ui/List';
import useSWR from 'swr'
import axios from 'axios'

export default function Contracts(props: any) {


  const fetcher = url => axios.get(url).then(res => res.data.rows)
  const { data, error, isLoading } = useSWR('/api/templates', fetcher)

  if (error) return <div>Failed to load</div>

  if (isLoading) return <LoadingOverlay visible={isLoading} overlayBlur={2}/>

  const theme = useMantineTheme();
  const PRIMARY_COL_HEIGHT = 300;
  const SECONDARY_COL_HEIGHT = PRIMARY_COL_HEIGHT / 2 - theme.spacing.md / 2;

  const TITLE = () => {
    return (
      <Title order={1}>Contract Templates</Title>
    )
  }

  const tempData = data.map(d => {
    return d['doc']
  })

  return (
    <div>
      {TITLE()}
      <Group position="right" mt="md">
        <Link href="/admin/templates/add">
          <Button>New Template</Button>
        </Link>
      </Group>
      <List
        editable
        sendable
        previewable
        resourceName='Template'
        item_key='name'
        apiEndpoint='templates'
        data={tempData}
        columns={[
          {
            name: "name",
            size: "sm",
            weight: 800
          },
          {
            name: "description",
            spacing: 'xl',
            size: "xs",
            weight: 400
          }
        ]}
      />
    </div>
  )

}