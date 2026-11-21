import { VarianceView } from '../../components/VarianceView';
import { ErrorNotice, SetupNotice } from '../../components/ui';
import { getDb } from '../../lib/db';
import { loadVariance } from '../../lib/loaders';

export const dynamic = 'force-dynamic';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; entity?: string }>;
}) {
  const db = getDb();
  if (!db) return <SetupNotice />;
  try {
    const q = await searchParams;
    return <VarianceView data={await loadVariance(db, q)} />;
  } catch (e) {
    console.error('variance failed', e);
    return (
      <ErrorNotice message="This screen could not be loaded. Check that the database has been migrated and loaded." />
    );
  }
}
