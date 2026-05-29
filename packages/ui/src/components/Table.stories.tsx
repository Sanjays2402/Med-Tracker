import * as React from 'react';
import { Table } from './Table';

export default { title: 'Med-Tracker/Table', component: Table };

export const Default = () => <Table>Accessible table.</Table>;
export const Subtle = () => <Table variant="subtle">Accessible table.</Table>;
export const Strong = () => <Table variant="strong" label="Label">Accessible table.</Table>;
