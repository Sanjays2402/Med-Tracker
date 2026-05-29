import * as React from 'react';
import { FormError } from './FormError';

export default { title: 'Med-Tracker/FormError', component: FormError };

export const Default = () => <FormError>Error message under a field.</FormError>;
export const Subtle = () => <FormError variant="subtle">Error message under a field.</FormError>;
export const Strong = () => <FormError variant="strong" label="Label">Error message under a field.</FormError>;
