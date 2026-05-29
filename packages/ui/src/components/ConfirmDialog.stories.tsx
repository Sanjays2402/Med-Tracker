import * as React from 'react';
import { ConfirmDialog } from './ConfirmDialog';

export default { title: 'Med-Tracker/ConfirmDialog', component: ConfirmDialog };

export const Default = () => <ConfirmDialog>Yes or no prompt.</ConfirmDialog>;
export const Subtle = () => <ConfirmDialog variant="subtle">Yes or no prompt.</ConfirmDialog>;
export const Strong = () => <ConfirmDialog variant="strong" label="Label">Yes or no prompt.</ConfirmDialog>;
