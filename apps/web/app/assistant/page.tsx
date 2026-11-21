import { AssistantView } from '../../components/AssistantView';
import { ErrorNotice, SetupNotice } from '../../components/ui';
import { getDb } from '../../lib/db';
import { loadAssistant } from '../../lib/loaders';

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
    return <AssistantView data={await loadAssistant(db, q)} />;
  } catch (e) {
    console.error('assistant failed', e);
    return (
      <ErrorNotice message="This screen could not be loaded. Check that the database has been migrated and loaded." />
    );
  }
}
