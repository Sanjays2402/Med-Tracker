import * as React from 'react';
import { Stack } from './Stack';

export default { title: 'Med-Tracker/Stack', component: Stack };

export const Default = () => <Stack>Vertical flex stack.</Stack>;
export const Subtle = () => <Stack variant="subtle">Vertical flex stack.</Stack>;
export const Strong = () => <Stack variant="strong" label="Label">Vertical flex stack.</Stack>;
