import { z } from 'zod';
import { TABLE_SCHEMAS } from './tables';
import type { TableName } from './tables';

type Kind = { kind: 'number' | 'boolean' | 'string'; nullable: boolean };

function kindOf(schema: z.ZodTypeAny): Kind {
  let cur = schema;
  let nullable = false;
  while (cur instanceof z.ZodNullable || cur instanceof z.ZodOptional) {
    nullable = true;
    cur = cur._def.innerType;
  }
  if (cur instanceof z.ZodNumber) return { kind: 'number', nullable };
  if (cur instanceof z.ZodBoolean) return { kind: 'boolean', nullable };
  return { kind: 'string', nullable };
}

/** Minimal RFC 4180 parser: quoted fields, doubled quotes, newlines inside quotes. */
export function splitCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') field += ch;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Parse a fixture CSV into rows typed and validated by the table's Zod schema. */
export function parseTable<T extends TableName>(
  table: T,
  text: string,
): Array<z.infer<(typeof TABLE_SCHEMAS)[T]>> {
  const schema = TABLE_SCHEMAS[table];
  const [header, ...body] = splitCsv(text);
  if (!header) throw new Error(`${table}: empty CSV`);
  const expected = Object.keys(schema.shape);
  if (header.join(',') !== expected.join(',')) {
    throw new Error(
      `${table}: header mismatch. Expected ${expected.join(',')} got ${header.join(',')}`,
    );
  }
  const kinds = expected.map((c) =>
    kindOf(schema.shape[c as keyof typeof schema.shape] as z.ZodTypeAny),
  );
  return body.map((cells, lineNo) => {
    if (cells.length !== header.length)
      throw new Error(`${table}: line ${lineNo + 2} has ${cells.length} cells`);
    const obj: Record<string, unknown> = {};
    header.forEach((col, i) => {
      const raw = cells[i] as string;
      const k = kinds[i] as Kind;
      if (raw === '' && k.nullable) obj[col] = null;
      else if (k.kind === 'number') obj[col] = Number(raw);
      else if (k.kind === 'boolean') obj[col] = raw === 'true';
      else obj[col] = raw;
    });
    return schema.strict().parse(obj) as z.infer<(typeof TABLE_SCHEMAS)[T]>;
  });
}
