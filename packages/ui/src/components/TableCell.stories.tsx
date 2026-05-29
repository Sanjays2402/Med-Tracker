import * as React from 'react';
import { TableCell } from './TableCell';

export default { title: 'Med-Tracker/TableCell', component: TableCell };

export const Default = () => <TableCell>Table cell.</TableCell>;
export const Subtle = () => <TableCell variant="subtle">Table cell.</TableCell>;
export const Strong = () => <TableCell variant="strong" label="Label">Table cell.</TableCell>;
