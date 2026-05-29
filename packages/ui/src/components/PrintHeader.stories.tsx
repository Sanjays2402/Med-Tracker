import * as React from 'react';
import { PrintHeader } from './PrintHeader';

export default { title: 'Med-Tracker/PrintHeader', component: PrintHeader };

export const Default = () => <PrintHeader>Header used on printable reports.</PrintHeader>;
export const Subtle = () => <PrintHeader variant="subtle">Header used on printable reports.</PrintHeader>;
export const Strong = () => <PrintHeader variant="strong" label="Label">Header used on printable reports.</PrintHeader>;
