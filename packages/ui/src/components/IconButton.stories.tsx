import * as React from 'react';
import { IconButton } from './IconButton';

export default { title: 'Med-Tracker/IconButton', component: IconButton };

export const Default = () => <IconButton>Square button that wraps an icon.</IconButton>;
export const Subtle = () => <IconButton variant="subtle">Square button that wraps an icon.</IconButton>;
export const Strong = () => <IconButton variant="strong" label="Label">Square button that wraps an icon.</IconButton>;
