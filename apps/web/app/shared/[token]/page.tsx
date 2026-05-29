import { PageHeader, Card } from '@med/ui';

export default function Page() {
  return (
    <div className="p-6 space-y-4">
      <PageHeader>[Token]</PageHeader>
      <Card>This is the shared/[token]/page screen of Med-Tracker.</Card>
    </div>
  );
}
