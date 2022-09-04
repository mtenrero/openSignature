import {
    Table,
    Group,
    Text,
    ActionIcon,
    ScrollArea,
  } from '@mantine/core';
  import { IconPencil, IconTrash } from '@tabler/icons';
import { useRouter } from 'next/router';
  
  interface ListProps {
    data: { name: string; description: string; text: object; }[]
    forceRefresh: Function
  }

  
  export function List({ data, forceRefresh }: ListProps) {
    const router = useRouter()

    const deleteContract = async (id) => {
      const endpoint = `/api/contracts?id=${id}`
      const options = {
        method: 'DELETE',
      }
      const response = await fetch(endpoint, options)
      console.log(response)
      forceRefresh()
    }
    const rows = data.map((item) => (
      <tr key={item["doc"].name}>
        <td>
          <Group spacing="sm">
            <Text size="sm" weight={800}>
              {item["doc"].name}
            </Text>
          </Group>
        </td>
  
        <td>
          <Group spacing="xl">
            <Text size="xs" weight={400}>
              {item["doc"].description}
            </Text>
          </Group>
        </td>
        
        <td>
          <Group spacing={0} position="right">
            <ActionIcon>
              <IconPencil size={16} stroke={1.5} />
            </ActionIcon>
            <ActionIcon color="red" onClick={() => deleteContract(item["doc"].name)}>
              <IconTrash size={16} stroke={1.5} />
            </ActionIcon>
          </Group>
        </td>
      </tr>
    ));
  
    return (
      <ScrollArea>
        <Table sx={{ minWidth: 800 }} verticalSpacing="sm">
          <thead>
            <tr>
              <th>Name</th>
              <th>Description</th>
              <th />
            </tr>
          </thead>
          <tbody>{rows}</tbody>
        </Table>
      </ScrollArea>
    );
  }