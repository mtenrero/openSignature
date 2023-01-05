import { Alert, Badge, Button, Group, Modal, Space, Stack, TextInput, Title, useMantineTheme } from "@mantine/core"
import { useForm } from "@mantine/form"
import { IconInfoCircle } from "@tabler/icons"
import axios from "axios"
import Link from "next/link"
import { useState } from "react"
import useSWRMutation from 'swr/mutation'
import ConditionalRender from "../../components/ui/ConditionalRender"
import { List } from "../../components/ui/List"


export default function tokensPage(props){
  const fetcher = url => axios.get(url).then(res => res.data.tokens)
  const { data, error, trigger } = useSWRMutation('/api/session/token', fetcher)

  const theme = useMantineTheme()
  const form = useForm(props.previousValues || {})
  const [opened, setOpened] = useState(false)
  const [created, setCreated] = useState([])

  trigger()

  if (error) return <div>Failed to load: {error.toString()}</div>

  if (!data) return <div>Loading...</div>

  return (
    <div>
      <Modal
        overlayColor={theme.colorScheme === 'dark' ? theme.colors.dark[9] : theme.colors.gray[2]}
        overlayOpacity={0.55}
        overlayBlur={3}
        opened={opened}
        onClose={() => setOpened(false)}
        title="Add a new token"
      >
        <form onSubmit={(event) => {
          event.preventDefault()
          axios.put('/api/session/token', form.values).then(e=> {
            const newlist = created
            newlist.push({
              name: e.data.name,
              token: e.data.token
            })
            setCreated(newlist)
            trigger()
            setOpened(false)
          }).catch(err =>{
            form.setErrors({
              name: err.response.data.error
            })
          })
        }}>
          <TextInput
            label="Token Name"
            description="Name of the token. Must be unique"
            inputWrapperOrder={['label', 'error', 'input', 'description']}
            required
            {...form.getInputProps('name')}
          />
          <Group position="right" mt="md">
            <Button color="gray" sx={{marginTop: "20px "}} onClick={() => setOpened(false)}>Discard</Button>
            <Button sx={{marginTop: "20px "}} type="submit">Save</Button>
          </Group>
        </form>
      </Modal>
      <Title order={1}>Account Tokens</Title>
      <Group position="right" mt="md">
        <Button
          onClick={() => {setOpened(true)}}
        >
          New Token
        </Button>
      </Group>
      <div>
      <ConditionalRender
        condition={created.length > 0}
      >
        <Stack>
          <Alert icon={<IconInfoCircle size={16} />} title={`Token APIKEYs will not be displayed anymore, keep them safe`} color="orange">
            {created.map(t=>{
              return(
                <div>
                  <b>{t.name} APIKEY</b> <Badge variant="filled" color="gray">{t['token']}</Badge>
                </div>
              )
            })}
          </Alert>
        </Stack>
      </ConditionalRender>
      <List
        resourceName="Token"
        item_key='name'
        data={data}
        apiEndpoint="session/token"
        extraRefresh={trigger}
        columns={[
          {
            name: "name",
            size: "sm",
            weight: 800
          },
          {
            name: "token",
            dataPath: "_id",
            spacing: 'xl',
            size: "xs",
            weight: 400,
            overrideValue: "**************************"
          }
        ]}
      />
      </div>
    </div>
  )
}
