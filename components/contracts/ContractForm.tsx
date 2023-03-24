import { TextInput, createStyles, Paper, Button, Group } from "@mantine/core";
import { useForm } from "@mantine/form";
import RichTextEditor from "@mantine/rte";
import type { NextComponentType, NextPageContext } from "next";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import FormItemList from "../ui/FormItemList";

interface FormValues {
  name: string;
  description: string;
  text: object;
  dynamicFields: object[]
}

interface Props {
  previousValues: object
}

const ContractForm: NextComponentType<NextPageContext, {}, Props> = (
  props: Props,
) => {
  const form = useForm<FormValues>(props.previousValues || {});
  const [value, onChange] = useState("");
  const router = useRouter()

  useEffect(() => {
    form.setValues({
      dynamicFields: [],
      ...props.previousValues
    })
  }, [props.previousValues])

  const useStyles = createStyles((theme) => {
    const BREAKPOINT = theme.fn.smallerThan('sm');

    return {

      form: {
        boxSizing: 'border-box',
        flex: 1,
        padding: theme.spacing.xl,
        paddingLeft: theme.spacing.xl * 2,
        borderLeft: 0,

        [BREAKPOINT]: {
          padding: theme.spacing.md,
          paddingLeft: theme.spacing.md,
        },
      },

      fields: {
        marginTop: -12,
      },

      fieldInput: {
        flex: 1,

        '& + &': {
          marginLeft: theme.spacing.md,

          [BREAKPOINT]: {
            marginLeft: 0,
            marginTop: theme.spacing.md,
          },
        },
      },

      fieldsGroup: {
        display: 'flex',

        [BREAKPOINT]: {
          flexDirection: 'column',
        },
      },

      title: {
        marginBottom: theme.spacing.xl * 1.5,
        fontFamily: `Greycliff CF, ${theme.fontFamily}`,

        [BREAKPOINT]: {
          marginBottom: theme.spacing.xl,
        },
      },

      control: {
        [BREAKPOINT]: {
          flex: 1,
        },
      },
    };
  })

  const { classes } = useStyles();

  const save = async (e) => {
    const endpoint = "/api/templates"
    const JSONdata = JSON.stringify(form.values)
    const options = {
      // The method is POST because we are sending data.
      method: 'POST',
      // Tell the server we're sending JSON.
      headers: {
        'Content-Type': 'application/json',
      },
      // Body of the request is the JSON data we created above.
      body: JSONdata,
    }
    const response = await fetch(endpoint, options)
    console.log(response)
    router.back()
  }

  return (
    <div>
      <Paper shadow="xl`" radius="sm">
        <form className={classes.form} onSubmit={(event) => {
          event.preventDefault()
          save(event)
        }}>
          <TextInput
            label="Template Name"
            description="Name of the template. Must be unique"
            inputWrapperOrder={['label', 'error', 'input', 'description']}
            required
            {...form.getInputProps('name')}
          />
          <TextInput
            label="Template Description"
            description="Add a description to the template for better identification"
            inputWrapperOrder={['label', 'error', 'input', 'description']}
            {...form.getInputProps('description')}
          />
          <p>
            <b>Dynamic fields:</b>
            <FormItemList
              itemName={"Dynamic Field"}
              formKeyName={"dynamicFields"}
              form={form}
            />
            <b>Contract contents:</b>
            <p>
              <i>
                Dynamic values can be referenced using square brackets: {"{{dynamic_variable_name}}"}
              </i>
            </p>
          </p>
          <RichTextEditor
            controls={[
              ["bold", "italic", "underline"],
              ["unorderedList", "orderedList"]
            ]}
            value={value}
            onChange={onChange}
            sx={{marginTop: "20px "}}
            {...form.getInputProps('text')}
          />
          <Group position="right" mt="md">
            <Button color="gray" sx={{marginTop: "20px "}} onClick={() => router.back()}>Discard</Button>
            <Button sx={{marginTop: "20px "}} type="submit">Save</Button>
          </Group>
        </form>
      </Paper>
    </div>
  )
}

export default ContractForm