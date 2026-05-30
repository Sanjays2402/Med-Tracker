"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SEVERITY_RULES = void 0;
exports.classifyInteractions = classifyInteractions;
exports.maxSeverity = maxSeverity;
const SEVERITY_RANK = {
    minor: 1,
    moderate: 2,
    major: 3,
    contraindicated: 4,
};
/**
 * Curated pairwise rules. Order is not meaningful; the highest severity match
 * wins for a given drug pair.
 */
exports.SEVERITY_RULES = [
    {
        a: ['maoi', 'monoamine oxidase'],
        b: ['ssri', 'snri', 'serotonin', 'tramadol', 'meperidine', 'linezolid'],
        severity: 'contraindicated',
        mechanism: 'Serotonin syndrome risk from combined serotonergic activity.',
        action: 'Do not co-administer. Allow at least 14 days washout between agents.',
        rule: 'maoi-serotonergic',
    },
    {
        a: ['warfarin'],
        b: ['nsaid', 'ibuprofen', 'naproxen', 'aspirin', 'ketorolac'],
        severity: 'major',
        mechanism: 'Additive bleeding risk through platelet inhibition plus anticoagulation.',
        action: 'Avoid combination. If unavoidable, monitor INR and signs of bleeding closely.',
        rule: 'warfarin-nsaid',
    },
    {
        a: ['warfarin'],
        b: ['amiodarone', 'fluconazole', 'metronidazole', 'trimethoprim'],
        severity: 'major',
        mechanism: 'CYP2C9 inhibition raises warfarin exposure and INR.',
        action: 'Reduce warfarin dose and increase INR monitoring frequency.',
        rule: 'warfarin-cyp2c9',
    },
    {
        a: ['ssri', 'snri'],
        b: ['nsaid', 'aspirin', 'antiplatelet', 'clopidogrel'],
        severity: 'major',
        mechanism: 'Increased GI bleeding from impaired platelet aggregation.',
        action: 'Consider gastroprotection (PPI) or alternative analgesic.',
        rule: 'ssri-bleeding',
    },
    {
        a: ['statin', 'simvastatin', 'atorvastatin', 'lovastatin'],
        b: ['clarithromycin', 'erythromycin', 'itraconazole', 'ketoconazole', 'cyclosporine'],
        severity: 'major',
        mechanism: 'CYP3A4 inhibition increases statin exposure and rhabdomyolysis risk.',
        action: 'Pause statin during course of CYP3A4 inhibitor or switch to pravastatin/rosuvastatin.',
        rule: 'statin-cyp3a4',
    },
    {
        a: ['statin', 'simvastatin', 'atorvastatin'],
        b: ['fibrate', 'gemfibrozil'],
        severity: 'major',
        mechanism: 'Additive myopathy and rhabdomyolysis risk.',
        action: 'Avoid combination; if needed, use fenofibrate at lowest effective doses with CK monitoring.',
        rule: 'statin-fibrate',
    },
    {
        a: ['ace inhibitor', 'arb', 'lisinopril', 'losartan', 'valsartan'],
        b: ['potassium', 'spironolactone', 'eplerenone', 'amiloride'],
        severity: 'moderate',
        mechanism: 'Hyperkalemia risk from combined RAAS suppression.',
        action: 'Monitor serum potassium within one week of initiation and after dose changes.',
        rule: 'raas-potassium',
    },
    {
        a: ['benzodiazepine', 'alprazolam', 'lorazepam', 'diazepam', 'clonazepam'],
        b: ['opioid', 'oxycodone', 'hydrocodone', 'morphine', 'fentanyl', 'tramadol'],
        severity: 'major',
        mechanism: 'Additive CNS and respiratory depression.',
        action: 'Avoid concurrent use. If required, use lowest effective doses and counsel on overdose signs.',
        rule: 'benzo-opioid',
    },
    {
        a: ['metformin'],
        b: ['contrast', 'iodinated contrast'],
        severity: 'major',
        mechanism: 'Lactic acidosis risk if contrast-induced nephropathy develops.',
        action: 'Hold metformin at time of contrast and resume 48h later after renal function check.',
        rule: 'metformin-contrast',
    },
    {
        a: ['digoxin'],
        b: ['amiodarone', 'verapamil', 'clarithromycin'],
        severity: 'major',
        mechanism: 'P-glycoprotein inhibition raises digoxin levels toward toxicity.',
        action: 'Reduce digoxin dose by 30 to 50 percent and check serum digoxin within one week.',
        rule: 'digoxin-pgp',
    },
    {
        a: ['qt-prolonging', 'amiodarone', 'sotalol', 'methadone', 'ondansetron', 'haloperidol', 'ciprofloxacin', 'levofloxacin', 'azithromycin', 'citalopram'],
        b: ['qt-prolonging', 'amiodarone', 'sotalol', 'methadone', 'ondansetron', 'haloperidol', 'ciprofloxacin', 'levofloxacin', 'azithromycin', 'citalopram'],
        severity: 'major',
        mechanism: 'Additive QT interval prolongation and torsades de pointes risk.',
        action: 'Obtain baseline and follow-up ECG; correct electrolytes; consider alternative agent.',
        rule: 'qt-additive',
    },
    {
        a: ['grapefruit'],
        b: ['statin', 'simvastatin', 'amiodarone', 'tacrolimus', 'cyclosporine', 'nifedipine'],
        severity: 'moderate',
        mechanism: 'Intestinal CYP3A4 inhibition increases substrate plasma levels.',
        action: 'Avoid grapefruit juice while on this medication or separate by at least 4 hours.',
        rule: 'grapefruit-cyp3a4',
    },
    {
        a: ['allopurinol'],
        b: ['azathioprine', 'mercaptopurine'],
        severity: 'major',
        mechanism: 'Xanthine oxidase inhibition raises thiopurine exposure leading to severe myelosuppression.',
        action: 'Reduce thiopurine dose to 25 percent of usual or avoid combination.',
        rule: 'allopurinol-thiopurine',
    },
];
/** Match a single token list against any of the rule sides. */
function matchesSide(drug, terms) {
    const haystack = [
        drug.class,
        drug.generic,
        drug.brand,
        ...(drug.warnings ?? []),
        ...(drug.interactions ?? []),
    ]
        .filter(Boolean)
        .map((s) => s.toLowerCase());
    return terms.some((t) => haystack.some((h) => h.includes(t)));
}
function pairMatches(a, b, rule) {
    return ((matchesSide(a, rule.a) && matchesSide(b, rule.b)) ||
        (matchesSide(a, rule.b) && matchesSide(b, rule.a)));
}
/** Severity inferred when only a keyword overlap exists, no curated rule fires. */
function keywordSeverity(a, b) {
    const wordsA = (a.interactions ?? []).map((s) => s.toLowerCase());
    const wordsB = (b.interactions ?? []).map((s) => s.toLowerCase());
    const overlap = wordsA.some((w) => b.class.toLowerCase().includes(w) || b.generic.toLowerCase().includes(w))
        || wordsB.some((w) => a.class.toLowerCase().includes(w) || a.generic.toLowerCase().includes(w));
    if (!overlap)
        return { severity: 'minor', matched: false };
    // contraindication or "do not" wording in either drug's warnings raises severity
    const warn = [...(a.warnings ?? []), ...(b.warnings ?? [])].join(' ').toLowerCase();
    if (/contraindicat|do not (use|combine|administer)/.test(warn)) {
        return { severity: 'contraindicated', matched: true };
    }
    if (/avoid|major|severe|bleed/.test(warn))
        return { severity: 'major', matched: true };
    return { severity: 'moderate', matched: true };
}
/**
 * Classify pairwise interactions for an active drug list.
 * Each pair yields at most one ScoredInteraction (highest severity rule wins).
 */
function classifyInteractions(active) {
    const out = [];
    const seen = new Set();
    for (let i = 0; i < active.length; i++) {
        for (let j = i + 1; j < active.length; j++) {
            const a = active[i];
            const b = active[j];
            const key = [a.id, b.id].sort().join('|');
            if (seen.has(key))
                continue;
            let chosen = null;
            for (const rule of exports.SEVERITY_RULES) {
                if (!pairMatches(a, b, rule))
                    continue;
                const rank = SEVERITY_RANK[rule.severity];
                if (!chosen || rank > chosen.rank)
                    chosen = { rule, rank };
            }
            if (chosen) {
                seen.add(key);
                out.push({
                    a: a.generic,
                    b: b.generic,
                    severity: chosen.rule.severity,
                    note: `${a.generic} + ${b.generic}: ${chosen.rule.mechanism}`,
                    mechanism: chosen.rule.mechanism,
                    action: chosen.rule.action,
                    rule: chosen.rule.rule,
                });
                continue;
            }
            const kw = keywordSeverity(a, b);
            if (kw.matched) {
                seen.add(key);
                out.push({
                    a: a.generic,
                    b: b.generic,
                    severity: kw.severity,
                    note: `Possible interaction between ${a.generic} and ${b.generic}.`,
                    mechanism: 'Inferred from interaction keyword overlap; clinical review recommended.',
                    action: 'Review with prescriber or pharmacist before continuing both medications.',
                    rule: 'keyword-overlap',
                });
            }
        }
    }
    // Sort: most severe first, then alphabetical for stable rendering.
    out.sort((x, y) => {
        const d = SEVERITY_RANK[y.severity] - SEVERITY_RANK[x.severity];
        return d !== 0 ? d : x.a.localeCompare(y.a);
    });
    return out;
}
/** Convenience: highest severity level present in a list. */
function maxSeverity(items) {
    if (!items.length)
        return null;
    let best = 'minor';
    for (const i of items)
        if (SEVERITY_RANK[i.severity] > SEVERITY_RANK[best])
            best = i.severity;
    return best;
}
