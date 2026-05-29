import * as React from 'react';
import { Breadcrumb } from './Breadcrumb';

export default { title: 'Med-Tracker/Breadcrumb', component: Breadcrumb };

export const Default = () => <Breadcrumb>Breadcrumb trail.</Breadcrumb>;
export const Subtle = () => <Breadcrumb variant="subtle">Breadcrumb trail.</Breadcrumb>;
export const Strong = () => <Breadcrumb variant="strong" label="Label">Breadcrumb trail.</Breadcrumb>;
