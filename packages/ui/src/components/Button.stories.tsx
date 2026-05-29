import * as React from 'react';
import { Button } from './Button';

export default { title: 'Med-Tracker/Button', component: Button };

export const Default = () => <Button>Click target with primary, secondary, ghost, and danger variants.</Button>;
export const Subtle = () => <Button variant="subtle">Click target with primary, secondary, ghost, and danger variants.</Button>;
export const Strong = () => <Button variant="strong" label="Label">Click target with primary, secondary, ghost, and danger variants.</Button>;
