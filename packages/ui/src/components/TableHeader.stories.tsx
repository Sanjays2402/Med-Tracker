import * as React from 'react';
import { TableHeader } from './TableHeader';

export default { title: 'Med-Tracker/TableHeader', component: TableHeader };

export const Default = () => <TableHeader>Table header row.</TableHeader>;
export const Subtle = () => <TableHeader variant="subtle">Table header row.</TableHeader>;
export const Strong = () => <TableHeader variant="strong" label="Label">Table header row.</TableHeader>;
