import * as React from 'react';
import { DataTable } from './DataTable';

export default { title: 'Med-Tracker/DataTable', component: DataTable };

export const Default = () => <DataTable>Sortable, paginated table.</DataTable>;
export const Subtle = () => <DataTable variant="subtle">Sortable, paginated table.</DataTable>;
export const Strong = () => <DataTable variant="strong" label="Label">Sortable, paginated table.</DataTable>;
