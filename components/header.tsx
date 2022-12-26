import { Burger, Container, Group, Header, createStyles, Anchor, Title } from '@mantine/core';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import type { FC } from 'react';
import UserMenu from './ui/UserMenu';

interface headerProps {}

const HEADER_HEIGHT = 84;

const useStyles = createStyles((theme) => ({
    header: {
      backgroundColor: theme.fn.variant({ variant: 'filled', color: theme.primaryColor }).background,
      borderBottom: 0,
    },

    inner: {
      height: HEADER_HEIGHT,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    },

    burger: {
      [theme.fn.largerThan('sm')]: {
        display: 'none',
      },
    },

    links: {
      paddingTop: theme.spacing.lg,
      height: HEADER_HEIGHT,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',

      [theme.fn.smallerThan('sm')]: {
        display: 'none',
      },
    },

    mainLinks: {
      marginRight: -theme.spacing.sm,
    },

    mainLink: {
      textTransform: 'uppercase',
      fontSize: 13,
      color: theme.white,
      padding: `7px ${theme.spacing.sm}px`,
      fontWeight: 700,
      borderBottom: '2px solid transparent',
      transition: 'border-color 100ms ease, opacity 100ms ease',
      opacity: 0.9,
      borderTopRightRadius: theme.radius.sm,
      borderTopLeftRadius: theme.radius.sm,

      '&:hover': {
        opacity: 1,
        textDecoration: 'none',
      },
    },

    secondaryLink: {
      color: theme.colors[theme.primaryColor][0],
      fontSize: theme.fontSizes.xs,
      textTransform: 'uppercase',
      transition: 'color 100ms ease',

      '&:hover': {
        color: theme.white,
        textDecoration: 'none',
      },
    },

    mainLinkActive: {
      color: theme.white,
      opacity: 1,
      borderBottomColor:
        theme.colorScheme === 'dark' ? theme.white : theme.colors[theme.primaryColor][5],
      backgroundColor: theme.fn.lighten(
        theme.fn.variant({ variant: 'filled', color: theme.primaryColor }).background,
        0.1
      ),
    },
  }));

  interface LinkProps {
    label: string;
    link: string;
  }

const header: FC<headerProps> = ({}) => {
    const { classes, cx } = useStyles();

    const mainLinks = [
        { label: "Admin", link: "/admin" }
    ]

    const mainItems = mainLinks.map((item, index) => (
        <Link href={item.link}>
          <div
            key={item.label}
            className={cx(classes.mainLink, { [classes.mainLinkActive]: true })}
          >
            {item.label}
          </div>
        </Link>
    ));


    return (
        <Header height={HEADER_HEIGHT} mb={120} className={classes.header}>
        <Container className={classes.inner}>
          <div style={{ color: '#fff' }}>
            <Title order={1}>oSignature</Title>
          </div>

          <div className={classes.links}>
            <Group position="right">{<UserMenu/>}</Group>
            <Group spacing={0} position="right" className={classes.mainLinks}>
              {mainItems}
            </Group>
          </div>

        </Container>
      </Header>
    );
}
export default header;