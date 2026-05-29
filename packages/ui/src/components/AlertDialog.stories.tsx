import * as React from 'react';
import { AlertDialog } from './AlertDialog';

export default { title: 'Med-Tracker/AlertDialog', component: AlertDialog };

export const Default = () => <AlertDialog>Confirmation dialog.</AlertDialog>;
export const Subtle = () => <AlertDialog variant="subtle">Confirmation dialog.</AlertDialog>;
export const Strong = () => <AlertDialog variant="strong" label="Label">Confirmation dialog.</AlertDialog>;
