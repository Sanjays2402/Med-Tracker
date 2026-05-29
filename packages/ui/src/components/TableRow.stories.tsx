import * as React from 'react';
import { TableRow } from './TableRow';

export default { title: 'Med-Tracker/TableRow', component: TableRow };

export const Default = () => <TableRow>Table row.</TableRow>;
export const Subtle = () => <TableRow variant="subtle">Table row.</TableRow>;
export const Strong = () => <TableRow variant="strong" label="Label">Table row.</TableRow>;
