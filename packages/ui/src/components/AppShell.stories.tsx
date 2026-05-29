import * as React from 'react';
import { AppShell } from './AppShell';

export default { title: 'Med-Tracker/AppShell', component: AppShell };

export const Default = () => <AppShell>Top level layout with sidebar and main.</AppShell>;
export const Subtle = () => <AppShell variant="subtle">Top level layout with sidebar and main.</AppShell>;
export const Strong = () => <AppShell variant="strong" label="Label">Top level layout with sidebar and main.</AppShell>;
