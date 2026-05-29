import * as React from 'react';
import { EmptyState } from './EmptyState';

export default { title: 'Med-Tracker/EmptyState', component: EmptyState };

export const Default = () => <EmptyState>Empty state illustration and copy.</EmptyState>;
export const Subtle = () => <EmptyState variant="subtle">Empty state illustration and copy.</EmptyState>;
export const Strong = () => <EmptyState variant="strong" label="Label">Empty state illustration and copy.</EmptyState>;
