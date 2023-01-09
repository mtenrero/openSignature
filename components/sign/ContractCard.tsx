import { Card, Image, Text, Group, Button, createStyles, Checkbox, Stack, ActionIcon, AspectRatio, Container, Divider, TextInput } from '@mantine/core';
import { useForm, UseFormReturnType } from '@mantine/form';
import { IconClearAll, IconEraser } from '@tabler/icons';
import * as DOMPurify from 'dompurify';
import Handlebars from "handlebars";
import { useEffect, useRef, useState } from 'react';
import SignaturePad from 'react-signature-pad-wrapper';

const useStyles = createStyles((theme) => ({
  card: {
    backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[7] : theme.white,
  },

  section: {
    borderBottom: `1px solid ${
      theme.colorScheme === 'dark' ? theme.colors.dark[4] : theme.colors.gray[3]
    }`,
    paddingLeft: theme.spacing.md,
    paddingRight: theme.spacing.md,
    paddingBottom: theme.spacing.md,
  },

  like: {
    color: theme.colors.red[6],
  },

  label: {
    textTransform: 'uppercase',
    fontSize: theme.fontSizes.xs,
    fontWeight: 700,
  },
}));

interface ContractCardProps {
  title: string;
  description: string;
  template: object;
  contractData: object;
  form: UseFormReturnType<Record<string, unknown>>
}

export function ContractCard({ title, description, template, contractData }: ContractCardProps) {
  const { classes, theme } = useStyles()
  const form = useForm()

  const [accepted, setAccepted] = useState(false)
  const [contractDataReady, setContractDataReady] = useState((template['dynamicFields'] || []).length == 0)

  const [contractRender, setContractRender] = useState("")
  const signature = useRef()

  const contractDetails = Handlebars.compile(template['text'])

  const setContractData = () => {
    contractData = {
      ...contractData,
      ...form.values
    }
    setContractDataReady(true)
    setContractRender(contractDetails(contractData))
  }

  //@ts-ignore
  return (
    <Card withBorder radius="md" p="md" className={classes.card}>
      <Card.Section>
        <Image src={"https://images.unsplash.com/photo-1455390582262-044cdead277a?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=1673&q=80"} alt={title} height={50} />
      </Card.Section>

      <Card.Section className={classes.section} mt="md">
        <Group position="apart">
          <Text size="lg" weight={500}>
            {title}
          </Text>
        </Group>
        <Text size="sm" mt="xs">
          {description}
        </Text>
      </Card.Section>

      <Card.Section className={classes.section}>
        <Text mt="md" className={classes.label} color="dimmed">
          Contract Signer Data
        </Text>
        <Stack>
        {(template['dynamicFields'] || []).map(field => {
          switch (field['type']) {
            case 'number':
              return(
                <TextInput
                  label={field['name']}
                  required
                  withAsterisk
                  type="number"
                  {...form.getInputProps(field.name, { type: 'input' })}
                />
              )
              break
            case 'checkbox':
              return(
                <Checkbox
                  label={field['name']}
                  required
                  {...form.getInputProps(field.name, { type: 'checkbox' })}
                />
              )
              break
            case 'password':
              return(
                <TextInput
                  label={field['name']}
                  required
                  withAsterisk
                  type="password"
                  {...form.getInputProps(field.name, { type: 'input' })}
                />
              )
              break
            default:
              return(
                <TextInput
                  label={field['name']}
                  required
                  withAsterisk
                  {...form.getInputProps(field.name, { type: 'input' })}
                />
              )
          }
        })}
        <Button
          type='submit'
          onClick={() => setContractData()}
        >
          Set Contract Data
        </Button>
        </Stack>
      </Card.Section>

      <Card.Section className={classes.section}>
        <Text mt="md" className={classes.label} color="dimmed">
          Contract details
        </Text>
        <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(contractRender) }} />
      </Card.Section>

      <Stack mt="md">
        <Text mt="md" className={classes.label} color="dimmed">
            Contract acceptance
        </Text>
        <Checkbox
          required
          onChange={(event) => setAccepted(event.currentTarget.checked)}
          disabled={!contractDataReady}
          label="I agree with the terms of this contract"
        />

        <Text mt="md" className={classes.label} color="dimmed">
            Signature
        </Text>
        <SignaturePad
          ref={signature}
          height={200}
          redrawOnResize
          options={{
            backgroundColor: 'white',
            penColor: "black",
          }}
        />
        <Divider my="sm" />
        <Group mt="xs">
          <Button radius="md" style={{ flex: 1 }} disabled={!accepted}>
            Sign
          </Button>
          <ActionIcon color={'red'} onClick={()=> {
            //@ts-expect-error
            signature.current && signature.current.clear()
            }}
            variant="filled"
            radius="md" size={36}
          >
            <IconEraser size={18} stroke={1.5} />
          </ActionIcon>
        </Group>
      </Stack>
    </Card>
  );
}