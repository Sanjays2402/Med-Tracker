import * as React from 'react';
import { DialogFooter } from './DialogFooter';

export default { title: 'Med-Tracker/DialogFooter', component: DialogFooter };

export const Default = () => <DialogFooter>Modal footer.</DialogFooter>;
export const Subtle = () => <DialogFooter variant="subtle">Modal footer.</DialogFooter>;
export const Strong = () => <DialogFooter variant="strong" label="Label">Modal footer.</DialogFooter>;
