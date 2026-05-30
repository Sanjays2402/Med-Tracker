import { describe, it, expect, beforeEach } from 'vitest';
import { store } from '../src/store/inMemoryStore';

describe('inMemoryStore: medications, doses, refills', () => {
  it('lists seeded medications and excludes archived', () => {
    const all = store.listMedications();
    expect(all.length).toBeGreaterThan(0);
    const first = all[0]!;
    const archived = store.archiveMedication(first.id);
    expect(archived?.archivedAt).toBeTruthy();
    const after = store.listMedications();
    expect(after.find((m) => m.id === first.id)).toBeUndefined();
  });

  it('creates a new medication with generated id and createdAt', () => {
    const created = store.createMedication({
      name: 'Ibuprofen',
      strength: '200 mg',
      form: 'tablet',
      schedule: '08:00 daily',
    });
    expect(created.id).toMatch(/^med_/);
    expect(created.createdAt).toBeTruthy();
    expect(store.getMedication(created.id)?.name).toBe('Ibuprofen');
  });

  it('updates and patches a medication', () => {
    const m = store.createMedication({ name: 'Acetaminophen' });
    const patched = store.updateMedication(m.id, { strength: '500 mg', remainingDoses: 30 });
    expect(patched?.strength).toBe('500 mg');
    expect(patched?.remainingDoses).toBe(30);
    expect(store.updateMedication('does-not-exist', { name: 'x' })).toBeUndefined();
  });

  it('lists doses for today and updates status', () => {
    const today = store.listDosesToday();
    expect(today.length).toBeGreaterThan(0);
    const pending = today.find((d) => d.status === 'pending');
    expect(pending).toBeDefined();
    const taken = store.setDoseStatus(pending!.id, 'taken');
    expect(taken?.status).toBe('taken');
    expect(taken?.takenAt).toBeTruthy();
    expect(store.setDoseStatus('nope', 'skipped')).toBeUndefined();
  });

  it('updates refill status', () => {
    const refills = store.listRefills();
    expect(refills.length).toBeGreaterThan(0);
    const first = refills[0]!;
    const updated = store.updateRefill(first.id, { status: 'requested' });
    expect(updated?.status).toBe('requested');
    expect(store.getRefill(first.id)?.status).toBe('requested');
  });
});
