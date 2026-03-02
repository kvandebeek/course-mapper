export type UnknownRecord = Record<string, unknown>;

export function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asRecordArray(value: unknown): readonly UnknownRecord[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const recordItems: UnknownRecord[] = [];
  for (const item of value) {
    if (!isRecord(item)) {
      return undefined;
    }
    recordItems.push(item);
  }
  return recordItems;
}

export function tryExtractHits(payload: unknown): readonly UnknownRecord[] | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  const topLevelCandidates: unknown[] = [payload.results, payload.courses, payload.items];
  for (const candidate of topLevelCandidates) {
    const hits = asRecordArray(candidate);
    if (hits) {
      return hits;
    }
  }

  const dataNode = payload.data;
  if (!isRecord(dataNode)) {
    return undefined;
  }

  const dataCandidates: unknown[] = [dataNode.results, dataNode.courses, dataNode.items];
  for (const candidate of dataCandidates) {
    const hits = asRecordArray(candidate);
    if (hits) {
      return hits;
    }
  }

  return undefined;
}
