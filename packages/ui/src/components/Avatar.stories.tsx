import * as React from 'react';
import { Avatar } from './Avatar';

export default { title: 'Med-Tracker/Avatar', component: Avatar };

export const Default = () => <Avatar>Initials or image avatar.</Avatar>;
export const Subtle = () => <Avatar variant="subtle">Initials or image avatar.</Avatar>;
export const Strong = () => <Avatar variant="strong" label="Label">Initials or image avatar.</Avatar>;
