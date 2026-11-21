import type { AssistantData } from '../lib/loaders';
import { monthLabel } from '../lib/format';
import { PeriodEntityForm } from './Controls';
import { AssistantChat } from './AssistantChat';

export function AssistantView({ data }: { data: AssistantData }) {
  return (
    <>
      <h1>Finance assistant</h1>
      <p className="sub">
        Ask about {monthLabel(data.period)}. Every number in an answer comes from the calculation
        engine.
      </p>
      <PeriodEntityForm
        controls={data.controls}
        period={data.period}
        entity={data.entity}
        action="/assistant"
      />
      <AssistantChat period={data.period} entity={data.entity} />
    </>
  );
}
