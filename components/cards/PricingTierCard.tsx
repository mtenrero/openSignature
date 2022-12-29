import { Button, Container, createStyles, List, Paper, PaperProps, Space, Stack, Text, ThemeIcon } from '@mantine/core';
import { IconCircleCheck, IconColorSwatch } from '@tabler/icons';

interface CardBandProps {
  bandGradient: string[]
}

const useStyles = createStyles((theme) => ({
  card: {
    position: 'relative',
    cursor: 'pointer',
    overflow: 'hidden',
    transition: 'transform 150ms ease, box-shadow 100ms ease',
    padding: theme.spacing.xl,
    paddingLeft: theme.spacing.xl * 2,

    '&:hover': {
      boxShadow: theme.shadows.md,
      transform: 'scale(1.02)',
    },

    '&::before': {
      content: '""',
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 0,
      width: 6,
    },
  },
}));

interface CardGradientProps {
  title: string;
  description: string;
  items: {
    title: string
    icon?: JSX.Element
  }[];
  action: {
    text: string;
  },
  gradient: string[] 
}

export function PricingTierCard({ title, description, items, action, gradient }: CardGradientProps) {
  const { classes } = useStyles();
  return (
    <Paper
      withBorder
      radius="md"
      className={classes.card}
    >
      <ThemeIcon
        size="xl"
        radius="md"
        variant="gradient"
        gradient={{ deg: 0, from: gradient[0], to: gradient[1] }}
      >
        <IconColorSwatch size={28} stroke={1.5} />
      </ThemeIcon>
      <Stack>

      <Text size="xl" weight={700} mt="md">
        {title}
      </Text>
      <Text size="sm" mt="sm" color="dimmed">
        {description}
      </Text>


    <List
      spacing="xs"
      size="sm"
      center
      icon={
        <ThemeIcon color="teal" size={24} radius="xl">
          <IconCircleCheck size={16} />
        </ThemeIcon>
      }
    >
     
    {Object.keys(items).map((itemName) => {
        const item = items[itemName]
        if (item.icon) {
            return(
                <List.Item icon={item.icon}>
                    {item.title}
                </List.Item>
            )
        } else {
            return(
                <List.Item>
                    {item.title}
                </List.Item>
            )
        }
    })}
    </List>

    <Button>
        {action.text}
    </Button>
    </Stack>
    </Paper>
  );
}