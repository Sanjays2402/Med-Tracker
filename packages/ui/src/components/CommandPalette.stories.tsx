import * as React from 'react';
import { CommandPalette } from './CommandPalette';

export default { title: 'Med-Tracker/CommandPalette', component: CommandPalette };

export const Default = () => <CommandPalette>Cmd+K search dialog.</CommandPalette>;
export const Subtle = () => <CommandPalette variant="subtle">Cmd+K search dialog.</CommandPalette>;
export const Strong = () => <CommandPalette variant="strong" label="Label">Cmd+K search dialog.</CommandPalette>;
