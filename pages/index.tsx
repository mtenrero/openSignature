import { createStyles, Container, Text, Button, Group } from '@mantine/core';
import Link from 'next/link';

const BREAKPOINT = '@media (max-width: 755px)';

const useStyles = createStyles((theme) => ({
  wrapper: {
    position: 'relative',
    boxSizing: 'border-box',
    backgroundColor: theme.colorScheme === 'dark' ? theme.colors.ocean[8] : theme.white,
  },

  inner: {
    position: 'relative',
    paddingBottom: 120,

    [BREAKPOINT]: {
      paddingBottom: 80,
      paddingTop: 80,
    },
  },

  title: {
    fontFamily: `Greycliff CF, ${theme.fontFamily}`,
    fontSize: 62,
    fontWeight: 900,
    lineHeight: 1.1,
    margin: 0,
    padding: 0,
    color: theme.colorScheme === 'dark' ? theme.white : theme.black,

    [BREAKPOINT]: {
      fontSize: 42,
      lineHeight: 1.2,
    },
  },

  description: {
    marginTop: theme.spacing.xl,
    fontSize: 24,

    [BREAKPOINT]: {
      fontSize: 18,
    },
  },

  description2: {
    marginTop: theme.spacing.sm,
    fontSize: 18,

    [BREAKPOINT]: {
      fontSize: 18,
    },
  },

  controls: {
    marginTop: theme.spacing.xl * 2,

    [BREAKPOINT]: {
      marginTop: theme.spacing.xl,
    },
  },

  control: {
    height: 54,
    paddingLeft: 38,
    paddingRight: 38,

    [BREAKPOINT]: {
      height: 54,
      paddingLeft: 18,
      paddingRight: 18,
      flex: 1,
    },
  },
}));

export default function Index() {
  const { classes } = useStyles();

  return (
    <div className={classes.wrapper}>
      <Container size={700} className={classes.inner}>
        <h1 className={classes.title}>
          The{' '}
          <Text component="span" variant="gradient" gradient={{ from: '#936405', to: '#ECAD2B' }} inherit>
            digital signature
          </Text>,{' '}
          made simple
        </h1>

        <Text className={classes.description} color="dimmed">
          Build and send digital contracts making effective communication flows with your customers using our platform.
        </Text>

        <Text className={classes.description2} color="dimmed">
          We are based in Europe, GDPR compliant and environment aware
        </Text>

        <Group className={classes.controls}>
          <Link href="/features">
            <Button
              size="xl"
              className={classes.control}
              variant="gradient"
              gradient={{ from: '#03616D', to: '#44CADC' }}
            >
              Know more
            </Button>
          </Link>
        </Group>
      </Container>
    </div>
  );
}