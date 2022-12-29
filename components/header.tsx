import Image from 'next/image'
import {
  createStyles,
  Container,
  Group,
  Tabs,
  Burger,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';

import UserHeaderMenu from './ui/UserHeaderMenu';
import Link from 'next/link';

export const useStyles = createStyles((theme) => ({
  header: {
    paddingTop: theme.spacing.sm,
    backgroundColor: theme.fn.variant({ variant: 'filled', color: theme.primaryColor }).background,
    borderBottom: `1px solid ${
      theme.fn.variant({ variant: 'filled', color: theme.primaryColor }).background
    }`,
    marginBottom: 120,
  },

  mainSection: {
    paddingBottom: theme.spacing.sm,
  },

  user: {
    color: theme.white,
    padding: `${theme.spacing.xs}px ${theme.spacing.sm}px`,
    borderRadius: theme.radius.sm,
    transition: 'background-color 100ms ease',

    '&:hover': {
      backgroundColor: theme.fn.lighten(
        theme.fn.variant({ variant: 'filled', color: theme.primaryColor }).background!,
        0.1
      ),
    },

    [theme.fn.smallerThan('xs')]: {
      display: 'none',
    },
  },

  burger: {
    [theme.fn.largerThan('xs')]: {
      display: 'none',
    },
  },

  userActive: {
    backgroundColor: theme.fn.lighten(
      theme.fn.variant({ variant: 'filled', color: theme.primaryColor }).background!,
      0.1
    ),
  },

  tabs: {
    [theme.fn.smallerThan('sm')]: {
      display: 'none',
    },
  },

  tabsList: {
    borderBottom: '0 !important',
  },

  tab: {
    fontWeight: 500,
    height: 38,
    color: theme.white,
    backgroundColor: 'transparent',
    borderColor: theme.fn.variant({ variant: 'filled', color: theme.primaryColor }).background,

    '&:hover': {
      backgroundColor: theme.fn.lighten(
        theme.fn.variant({ variant: 'filled', color: theme.primaryColor }).background!,
        0.1
      ),
    },

    '&[data-active]': {
      backgroundColor: theme.fn.lighten(
        theme.fn.variant({ variant: 'filled', color: theme.primaryColor }).background!,
        0.1
      ),
      borderColor: theme.fn.variant({ variant: 'filled', color: theme.primaryColor }).background,
    },
  },
}));

interface HeaderTabsProps {
}

const tabs = [
  {
    name: "Home",
    href: "/",
  },
  {
    name: "Features",
    href: "/features",
  },
  {
    name: "Pricing",
    href: "/pricing",
  },
  {
    name: "Status",
    href: "/",
  }
]

export function Header({ }: HeaderTabsProps) {
  const { classes, theme, cx } = useStyles();
  const [opened, { toggle }] = useDisclosure(false);

  const items = tabs.map((tab) => (
    <Link href={tab.href}>
      <Tabs.Tab value={tab.name.toLowerCase()} key={tab.name.toLowerCase()}>
        {tab.name}
      </Tabs.Tab>
    </Link>
  ));

  return (
    <div className={classes.header}>
      <Container className={classes.mainSection}>
        <Group position="apart">
          <Link href="/">
            <Image width={250} height={70} alt="openFirma" src="/openFirma.svg"/>
          </Link>
          <Burger
            opened={opened}
            onClick={toggle}
            className={classes.burger}
            size="sm"
            color={theme.white}
          />

          <UserHeaderMenu/>
        </Group>
      </Container>
      <Container>
        <Tabs
          variant="outline"
          classNames={{
            root: classes.tabs,
            tabsList: classes.tabsList,
            tab: classes.tab,
          }}
        >
          <Tabs.List>{items}</Tabs.List>
        </Tabs>
      </Container>
    </div>
  );
}