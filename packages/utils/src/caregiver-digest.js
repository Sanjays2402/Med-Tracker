"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.composeCaregiverDigest = composeCaregiverDigest;
const REFILL_SOON_DAYS = 7;
function composeCaregiverDigest(input) {
    const name = input.patient.display ?? input.patient.name;
    const avgPct = Math.round(input.adherence.averagePdc * 100);
    const refillsDueSoon = (input.refills ?? []).filter((r) => typeof r.daysOfSupply === 'number' && r.daysOfSupply <= REFILL_SOON_DAYS).length;
    const subject = `Med-Tracker weekly update for ${name}: ${avgPct}% adherence`;
    const lines = [];
    lines.push(`Hello,`);
    lines.push('');
    lines.push(`Here is the weekly Med-Tracker update for ${input.patient.name}, covering ${input.weekStart} through ${input.weekEnd}.`);
    lines.push('');
    lines.push(`Overall adherence (PDC): ${avgPct}%`);
    lines.push(`Medications on track: ${input.adherence.adherentCount}`);
    lines.push(`Medications below ${Math.round(input.adherence.threshold * 100)}%: ${input.adherence.nonAdherentCount}`);
    lines.push(`Missed doses this week: ${input.missedDoses.length}`);
    if (refillsDueSoon > 0) {
        lines.push(`Refills due within ${REFILL_SOON_DAYS} days: ${refillsDueSoon}`);
    }
    if (input.adherence.perMedication.length > 0) {
        lines.push('');
        lines.push('Per medication:');
        const sorted = [...input.adherence.perMedication].sort((a, b) => a.pdc - b.pdc);
        for (const m of sorted) {
            lines.push(`  ${formatMedLine(m, input.medicationNames)}`);
        }
    }
    if (input.missedDoses.length > 0) {
        lines.push('');
        lines.push('Recent missed doses:');
        const recent = input.missedDoses.slice(0, 10);
        for (const md of recent) {
            lines.push(`  ${md.scheduledFor}  ${md.medicationName}`);
        }
        if (input.missedDoses.length > recent.length) {
            lines.push(`  ...and ${input.missedDoses.length - recent.length} more`);
        }
    }
    if (refillsDueSoon > 0 && input.refills) {
        lines.push('');
        lines.push('Upcoming refills:');
        const soon = input.refills
            .filter((r) => typeof r.daysOfSupply === 'number' && r.daysOfSupply <= REFILL_SOON_DAYS)
            .sort((a, b) => (a.daysOfSupply ?? 0) - (b.daysOfSupply ?? 0));
        for (const r of soon) {
            const name = input.medicationNames[r.medicationId] ?? r.medicationId;
            lines.push(`  ${name}: ${r.daysOfSupply} days remaining`);
        }
    }
    lines.push('');
    lines.push('This message was sent because you have an active Med-Tracker caregiver share. To stop receiving updates, ask the patient to revoke your share.');
    return {
        subject,
        text: lines.join('\n'),
        stats: {
            averagePdcPct: avgPct,
            adherentCount: input.adherence.adherentCount,
            nonAdherentCount: input.adherence.nonAdherentCount,
            missedCount: input.missedDoses.length,
            refillsDueSoon,
        },
    };
}
function formatMedLine(m, names) {
    const name = names[m.medicationId] ?? m.medicationId;
    const pct = Math.round(m.pdc * 100);
    const gaps = m.gaps.length > 0 ? ` (${m.gaps.length} gap${m.gaps.length === 1 ? '' : 's'})` : '';
    return `${pct.toString().padStart(3, ' ')}%  ${name}${gaps}`;
}
