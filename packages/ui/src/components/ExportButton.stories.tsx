import * as React from 'react';
import { ExportButton } from './ExportButton';

export default { title: 'Med-Tracker/ExportButton', component: ExportButton };

export const Default = () => <ExportButton>Trigger CSV or PDF export.</ExportButton>;
export const Subtle = () => <ExportButton variant="subtle">Trigger CSV or PDF export.</ExportButton>;
export const Strong = () => <ExportButton variant="strong" label="Label">Trigger CSV or PDF export.</ExportButton>;
