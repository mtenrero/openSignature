import { UnstyledButton, Group, Menu, Avatar, Text } from "@mantine/core";
import { IconChevronDown, IconTemplate, IconSettings, IconLogout } from "@tabler/icons";
import Link from "next/link";
import { useState } from "react";
import { useStyles } from "../header";
import { signIn, signOut, useSession } from 'next-auth/react';

export default () => {
  const [userMenuOpened, setUserMenuOpened] = useState(false);
  const { data: session } = useSession()


  const { classes, theme, cx } = useStyles();

  if (session){
    return (
      <Menu
        width={260}
        position="bottom-end"
        transition="pop-top-right"
        onClose={() => setUserMenuOpened(false)}
        onOpen={() => setUserMenuOpened(true)}
      >
              <Menu.Target>
                <UnstyledButton
                  className={cx(classes.user, { [classes.userActive]: userMenuOpened })}
                >
                  <Group spacing={7}>
                    <Avatar src={session.user.image} alt={session.user.name} radius="xl" size={20} />
                    <Text weight={500} size="sm" sx={{ lineHeight: 1, color: theme.white }} mr={3}>
                      {session.user.email}
                    </Text>
                    <IconChevronDown size={12} stroke={1.5} />
                  </Group>
                </UnstyledButton>
              </Menu.Target>
              <Menu.Dropdown>
                <Link href={"/admin/templates"}>
                  <Menu.Item icon={<IconTemplate size={14} stroke={1.5}  />}>
                    Contract Templates
                  </Menu.Item>
                </Link>
                <Menu.Label>Settings</Menu.Label>
                <Link href={"/admin"}>
                  <Menu.Item icon={<IconSettings size={14} stroke={1.5} />}>Account settings</Menu.Item>
                </Link>
                <Menu.Item onClick={() => signOut({callbackUrl:`${window.location.origin}`})} color="red" icon={<IconLogout size={14} stroke={1.5} />}>
                  Close Session
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
    );
  } else {
    return(
      <Menu
        width={260}
        position="bottom-end"
        transition="pop-top-right"
      >
              <Menu.Target>
                <UnstyledButton
                  className={cx(classes.user, { [classes.userActive]: userMenuOpened })}
                >
                  <Group onClick={() => signIn("auth0")}  spacing={7}>
                    {"SIGN IN"}
                  </Group>
                </UnstyledButton>
              </Menu.Target>
            </Menu>
    )
  }
}