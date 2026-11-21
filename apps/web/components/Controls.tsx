import type { Controls } from '@fpa/db';
import { monthLabel } from '../lib/format';

/** Plain GET form: works without JavaScript, and the selection lives in the URL so it can be shared. */
export function PeriodEntityForm({
  controls,
  period,
  entity,
  action,
}: {
  controls: Controls;
  period: string;
  entity?: string;
  action: string;
}) {
  return (
    <form className="inline" method="get" action={action}>
      <label>
        Period
        <select name="period" defaultValue={period}>
          {controls.periods.map((p) => (
            <option key={p} value={p}>
              {monthLabel(p)}
            </option>
          ))}
        </select>
      </label>
      <label>
        Entity
        <select name="entity" defaultValue={entity ?? ''}>
          <option value="">Group (all entities)</option>
          {controls.entities.map((e) => (
            <option key={e.entity_id} value={e.entity_id}>
              {e.name}
            </option>
          ))}
        </select>
      </label>
      <button type="submit">Show</button>
    </form>
  );
}
