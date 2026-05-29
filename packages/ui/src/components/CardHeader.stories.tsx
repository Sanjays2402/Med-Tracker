import * as React from 'react';
import { CardHeader } from './CardHeader';

export default { title: 'Med-Tracker/CardHeader', component: CardHeader };

export const Default = () => <CardHeader>Header row inside a Card.</CardHeader>;
export const Subtle = () => <CardHeader variant="subtle">Header row inside a Card.</CardHeader>;
export const Strong = () => <CardHeader variant="strong" label="Label">Header row inside a Card.</CardHeader>;
