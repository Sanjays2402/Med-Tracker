import { PageHeader, Card } from '@med/ui';

export default function Page() {
  return (
    <div className="p-6 space-y-4">
      <PageHeader>[Id]</PageHeader>
      <Card>This is the (app)/drugs/[id]/page screen of Med-Tracker.</Card>
    </div>
  );
}
