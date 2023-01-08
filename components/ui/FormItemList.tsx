import { ActionIcon, Box, Group, TextInput, Text, Button, Select } from "@mantine/core";
import { randomId } from "@mantine/hooks";
import { IconTrash } from "@tabler/icons";

interface FormItemListProps {
  itemName: string
  formKeyName: string
  form
  placeholder?: string
}

export default (props: FormItemListProps) => {
  const fields = (props.form.values[props.formKeyName] || [ ]).map((item, index) => (
    <Group key={item.key} mt="xs">
      <TextInput
        placeholder={props.placeholder? props.placeholder : ""}
        withAsterisk
        sx={{ flex: 1 }}
        {...props.form.getInputProps(`${props.formKeyName}.${index}.name`)}
      />
      <Select
        placeholder={props.placeholder? props.placeholder : ""}
        withAsterisk
        defaultValue="text"
        sx={{ flex: 1 }}
        {...props.form.getInputProps(`${props.formKeyName}.${index}.type`)}
        data={[
          { value: 'text', label: 'Text' },
          { value: 'number', label: 'Number' },
          { value: 'checkbox', label: 'Checkbox' },
          { value: 'password', label: 'Password' },
          { value: 'textarea', label: 'Text Area' },
          { value: 'select', label: 'Select' }
        ]}
      />
      <ActionIcon color="red" onClick={() => props.form.removeListItem(props.formKeyName, index)}>
        <IconTrash size={16} />
      </ActionIcon>
    </Group>
  ));

  return (
    <Box sx={{ maxWidth: 500 }} mx="auto">
      {fields.length > 0 ? (
        <Group mb="xs">
          <Text weight={500} size="sm" sx={{ flex: 1 }}>
            Name
          </Text>
          <Text weight={500} size="sm" pr={90}>
            Type
          </Text>
        </Group>
      ) : (
        <Text color="dimmed" align="center">
          Empty...
        </Text>
      )}

      {fields}

      <Group position="center" mt="md">
        <Button
          onClick={() =>
            props.form.insertListItem(props.formKeyName, { name: '', active: false, key: randomId() })
          }
        >
          Add {props.itemName}
        </Button>
      </Group>
    </Box>
  );
}