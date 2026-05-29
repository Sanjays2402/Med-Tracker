import * as React from 'react';
import { StreakBadge } from './StreakBadge';

export default { title: 'Med-Tracker/StreakBadge', component: StreakBadge };

export const Default = () => <StreakBadge>Current streak badge.</StreakBadge>;
export const Subtle = () => <StreakBadge variant="subtle">Current streak badge.</StreakBadge>;
export const Strong = () => <StreakBadge variant="strong" label="Label">Current streak badge.</StreakBadge>;
