import * as React from 'react';
import { Card } from './Card';

export default { title: 'Med-Tracker/Card', component: Card };

export const Default = () => <Card>Container with padded surface.</Card>;
export const Subtle = () => <Card variant="subtle">Container with padded surface.</Card>;
export const Strong = () => <Card variant="strong" label="Label">Container with padded surface.</Card>;
