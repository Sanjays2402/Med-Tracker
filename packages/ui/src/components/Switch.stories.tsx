import * as React from 'react';
import { Switch } from './Switch';

export default { title: 'Med-Tracker/Switch', component: Switch };

export const Default = () => <Switch>Two state toggle.</Switch>;
export const Subtle = () => <Switch variant="subtle">Two state toggle.</Switch>;
export const Strong = () => <Switch variant="strong" label="Label">Two state toggle.</Switch>;
