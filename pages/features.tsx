import {
  createStyles,
  Badge,
  Group,
  Title,
  Text,
  Card,
  SimpleGrid,
  Container,
} from '@mantine/core';
import { IconGauge, IconUser, IconCookie, IconBoxMultiple, IconHistory, IconLock, IconMailbox, IconWorld, IconAccessible, IconCode, IconCurrencyEuro, IconEye } from '@tabler/icons';

const mockdata = [
  {
    title: 'Template engine',
    description:
      'Create predesigned contracts and save time reusing them',
    icon: IconBoxMultiple,
  },
  {
    title: 'Privacy focused',
    description:
      'Each contract can be only accessed by its addressee',
    icon: IconUser,
  },
  {
    title: 'Always audited',
    description:
      'Every access and signature is audited and added to the signed document, this ensures signature validity',
    icon: IconHistory,
  },
  {
    title: 'Encrypted data',
    description:
      'We don\'t store plain data, each customer has its own encryption key',
    icon: IconLock,
  },
  {
    title: 'Responsive contracts',
    description:
      'Your clients will perfectly see the contract as text, no mor buggy PDF windows for checking the contents of the contract',
    icon: IconEye,
  },
  {
    title: 'SMS and e-mail signing flows',
    description:
      'We offer SMS and e-mail signing flows. Choose between them based on your needs',
    icon: IconMailbox,
  },
  {
    title: 'Europe based',
    description:
      'Our data keeps in Europe',
    icon: IconWorld,
  },
  {
    title: 'GDPR compliant',
    description:
      'Your and your clients\'s privacy is our goal. We are GDPR compliant',
    icon: IconCurrencyEuro,
  },
  {
    title: 'API',
    description:
      'We offer an API to integrate our service into your custom product. Need more info? contact us',
    icon: IconCode,
  },
  {
    title: 'Let your users save time',
    description:
      'We use local cookies for securely store signer basic data on their device. This speeds up the signing process',
    icon: IconCookie,
  },
];

const useStyles = createStyles((theme) => ({
  title: {
    fontSize: 34,
    fontWeight: 900,
    [theme.fn.smallerThan('sm')]: {
      fontSize: 24,
    },
  },

  description: {
    maxWidth: 600,
    margin: 'auto',

    '&::after': {
      content: '""',
      display: 'block',
      backgroundColor: theme.fn.primaryColor(),
      width: 45,
      height: 2,
      marginTop: theme.spacing.sm,
      marginLeft: 'auto',
      marginRight: 'auto',
    },
  },

  card: {
    border: `1px solid ${
      theme.colorScheme === 'dark' ? theme.colors.dark[5] : theme.colors.gray[1]
    }`,
  },

  cardTitle: {
    '&::after': {
      content: '""',
      display: 'block',
      backgroundColor: theme.fn.primaryColor(),
      width: 45,
      height: 2,
      marginTop: theme.spacing.sm,
    },
  },
}));

export default function Features() {
  const { classes, theme } = useStyles();
  const features = mockdata.map((feature) => (
    <Card key={feature.title} shadow="md" radius="md" className={classes.card} p="xl">
      <feature.icon size={50} stroke={2} color={theme.fn.primaryColor()} />
      <Text size="lg" weight={600} color={theme.colors.ocean[9]} className={classes.cardTitle} mt="md">
        {feature.title}
      </Text>
      <Text size="sm" color="dimmed" mt="sm">
        {feature.description}
      </Text>
    </Card>
  ));
  return (
    <Container size="lg" py="xl">

      <Title order={2} className={classes.title} align="center" color={theme.fn.primaryColor()} mt="sm">
        This is what OpenFirma can offer you
      </Title>

      <SimpleGrid cols={3} spacing="xl" mt={50} breakpoints={[{ maxWidth: 'md', cols: 1 }]}>
        {features}
      </SimpleGrid>
    </Container>
  );
}