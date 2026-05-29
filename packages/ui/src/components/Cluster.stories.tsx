import * as React from 'react';
import { Cluster } from './Cluster';

export default { title: 'Med-Tracker/Cluster', component: Cluster };

export const Default = () => <Cluster>Wrapping inline cluster.</Cluster>;
export const Subtle = () => <Cluster variant="subtle">Wrapping inline cluster.</Cluster>;
export const Strong = () => <Cluster variant="strong" label="Label">Wrapping inline cluster.</Cluster>;
