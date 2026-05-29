import * as React from 'react';
import { Link } from './Link';

export default { title: 'Med-Tracker/Link', component: Link };

export const Default = () => <Link>Inline anchor with consistent focus styles.</Link>;
export const Subtle = () => <Link variant="subtle">Inline anchor with consistent focus styles.</Link>;
export const Strong = () => <Link variant="strong" label="Label">Inline anchor with consistent focus styles.</Link>;
