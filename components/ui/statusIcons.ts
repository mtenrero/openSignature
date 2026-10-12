import type { ComponentType } from 'react'
import {
  IconClock, IconCircleCheck, IconArchive, IconTrash, IconClockOff, IconCircleX, IconPencil,
  IconSparkles, IconMail, IconMessage, IconDeviceMobile, IconDeviceTablet, IconQrcode, IconHelp,
} from '@tabler/icons-react'

type Icon = ComponentType<{ size?: number | string }>
const MAP: Record<string, Icon> = {
  IconClock, IconCircleCheck, IconArchive, IconTrash, IconClockOff, IconCircleX, IconPencil,
  IconSparkles, IconMail, IconMessage, IconDeviceMobile, IconDeviceTablet, IconQrcode, IconHelp,
}
export const statusIcon = (name: string): Icon => MAP[name] ?? IconHelp
