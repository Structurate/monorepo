import type { StreamObject } from '../components/ai-chat-messages';

export function mergeStreamObjects(values: StreamObject[] = []) {
  return values.reduce((acc, curr) => {
    const prev = acc.at(-1);
    switch (curr.type) {
      case 'reasoning':
      case 'text-delta': {
        if (prev && prev.type === curr.type) {
          prev.textDelta += curr.textDelta;
        } else {
          acc.push(curr);
        }
        break;
      }
      default: {
        acc.push(curr);
        break;
      }
    }
    return acc;
  }, [] as StreamObject[]);
}
