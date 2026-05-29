import * as React from 'react';
import { NotificationItem } from './NotificationItem';

export default { title: 'Med-Tracker/NotificationItem', component: NotificationItem };

export const Default = () => <NotificationItem>Single notification row.</NotificationItem>;
export const Subtle = () => <NotificationItem variant="subtle">Single notification row.</NotificationItem>;
export const Strong = () => <NotificationItem variant="strong" label="Label">Single notification row.</NotificationItem>;
