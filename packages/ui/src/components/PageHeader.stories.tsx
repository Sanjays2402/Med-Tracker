import * as React from 'react';
import { PageHeader } from './PageHeader';

export default { title: 'Med-Tracker/PageHeader', component: PageHeader };

export const Default = () => <PageHeader>Heading row with actions.</PageHeader>;
export const Subtle = () => <PageHeader variant="subtle">Heading row with actions.</PageHeader>;
export const Strong = () => <PageHeader variant="strong" label="Label">Heading row with actions.</PageHeader>;
