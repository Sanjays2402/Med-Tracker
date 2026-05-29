import * as React from 'react';
import { Tag } from './Tag';

export default { title: 'Med-Tracker/Tag', component: Tag };

export const Default = () => <Tag>Removable tag chip.</Tag>;
export const Subtle = () => <Tag variant="subtle">Removable tag chip.</Tag>;
export const Strong = () => <Tag variant="strong" label="Label">Removable tag chip.</Tag>;
