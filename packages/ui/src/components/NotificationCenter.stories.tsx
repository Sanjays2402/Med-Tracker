import * as React from 'react';
import { NotificationCenter } from './NotificationCenter';

export default { title: 'Med-Tracker/NotificationCenter', component: NotificationCenter };

export const Default = () => <NotificationCenter>In app notifications drawer.</NotificationCenter>;
export const Subtle = () => <NotificationCenter variant="subtle">In app notifications drawer.</NotificationCenter>;
export const Strong = () => <NotificationCenter variant="strong" label="Label">In app notifications drawer.</NotificationCenter>;
