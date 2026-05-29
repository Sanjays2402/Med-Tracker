import * as React from 'react';
import { Pagination } from './Pagination';

export default { title: 'Med-Tracker/Pagination', component: Pagination };

export const Default = () => <Pagination>Pagination controls.</Pagination>;
export const Subtle = () => <Pagination variant="subtle">Pagination controls.</Pagination>;
export const Strong = () => <Pagination variant="strong" label="Label">Pagination controls.</Pagination>;
