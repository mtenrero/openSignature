import {
    Avatar,
    Badge,
    Table,
    Group,
    Text,
    ActionIcon,
    ScrollArea,
    useMantineTheme,
  } from '@mantine/core';
  import { IconPencil, IconTrash } from '@tabler/icons';
  
  interface ListProps {
    data: { name: string; description: string; }[];
  }
  
  const jobColors: Record<string, string> = {
    engineer: 'blue',
    manager: 'cyan',
    designer: 'pink',
  };
  
  export function List({ data }: ListProps) {
    const theme = useMantineTheme();
    const rows = data.map((item) => (
      <tr key={item.name}>
        <td>
          <Group spacing="sm">
            <Text size="sm" weight={800}>
              {item.name}
            </Text>
          </Group>
        </td>
  
        <td>
          <Group spacing="xl">
            <Text size="xs" weight={400}>
              {item.description}
            </Text>
          </Group>

        </td>
        
        <td>
          <Group spacing={0} position="right">
            <ActionIcon>
              <IconPencil size={16} stroke={1.5} />
            </ActionIcon>
            <ActionIcon color="red">
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
              <th>Tags</th>
              <th />
            </tr>
          </thead>
          <tbody>{rows}</tbody>
        </Table>
      </ScrollArea>
    );
  }