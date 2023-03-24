import {
    Table,
    Group,
    Text,
    ActionIcon,
    ScrollArea,
    Tooltip,
    MantineNumberSize,
  } from '@mantine/core';
  import { IconEye, IconPencil, IconSend, IconTrash } from '@tabler/icons';
import { useRouter } from 'next/router';

  interface ListProps {
    resourceName: string
    data: object[]
    apiEndpoint?: string
    extraRefresh?: Function,
    item_key: string
    columns: {
      name: string
      weight: number
      size: MantineNumberSize
      spacing?: MantineNumberSize
      overrideValue?: string
      dataPath?: string
    }[]
    editable?: boolean
    previewable?: boolean
    sendable?: boolean
  }

  export function List({ data, columns, item_key, editable, previewable, sendable, apiEndpoint, extraRefresh, resourceName }: ListProps) {
    const router = useRouter()

    const deleteContract = async (id) => {
      const endpoint = `/api/${apiEndpoint}?id=${id}`
      const options = {
        method: 'DELETE',
      }
      const response = await fetch(endpoint, options)
      console.log(response)
      extraRefresh ? extraRefresh() : ""
    }

    console.log(data)

    const rows = (data || []).map((item) => (
      <tr key={item[item_key]}>
        {columns.map(c =>{
          return(
            <td>
              <Group spacing={c.spacing? c.spacing : c.size}>
                <Text size={c.size} weight={c.weight}>
                  {c.overrideValue && (item['overrideValue'] || true) ? c.overrideValue : item[c.dataPath? c[c.dataPath] : c[c.name]]}
                </Text>
              </Group>
            </td>
          )
        })}

        <td>
          <Group spacing={0} position="right">
            {previewable ? (
              <Tooltip label={`Preview ${resourceName}`}>
                <ActionIcon onClick={() => router.push(`/admin/templates/preview/${item['name']}`)}>
                  <IconEye size={16} stroke={1.5} />
                </ActionIcon>
              </Tooltip>
            ) : null}

            {editable? (
              <Tooltip label={`Edit ${resourceName}`}>
                <ActionIcon onClick={() => router.push(`/admin/templates/edit/${item['name']}`)}>
                  <IconPencil size={16} stroke={1.5} />
                </ActionIcon>
              </Tooltip>
            ) : null}

            {sendable ? (
              <Tooltip label={`Send ${resourceName}`}>
                <ActionIcon variant='outline' color='blue' onClick={() => router.push(`/admin/templates/preview/${item['name']}`)} >
                  <IconSend size={16} stroke={2}/>
                </ActionIcon>
              </Tooltip>
            ) : null}

            <Tooltip label={`Delete ${resourceName}`}>
              <ActionIcon color="red" onClick={() => deleteContract(item[item_key])}>
                <IconTrash size={16} stroke={1.5} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </td>
      </tr>
    ));

    return (
      <ScrollArea>
        <Table sx={{ minWidth: 800 }} verticalSpacing="sm">
          <thead>
            <tr>
              {columns.map(c =>{
                return(
                <th>{c.name}</th>
                )
              })}
            </tr>
          </thead>
          <tbody>{rows}</tbody>
        </Table>
      </ScrollArea>
    );
  }