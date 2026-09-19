import { localizedContent } from './localization';
import { msg } from './messages.ts';
import { formatFrameValue } from './frame-value';
import './frame-transition.css';
export interface FrameTransition {
  blocked?: boolean;
  missing?: number;
  requiredInputs?: string[];
  before: string[];
  after: string[];
  consumed: number;
  produced: number;
  beforeLabel?: string;
  afterLabel?: string;
  limit?: number;
  tail?: boolean;
  terminal?: string;
  note?: string;
  locals?: {
    before: string[];
    after: string[];
    labels?: string[];
    changed?: number[];
    effect?: string;
  };
}
// Values enter bottom-to-top; both the live frame and dictionary examples use this renderer.
export function renderFrameTransition(frame: FrameTransition) {
  const node = (tag: string, text?: string, cls?: string) => {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  };
  const root = node('div', undefined, 'frame-transition');
  function pair(before: string[], after: string[], locals = false) {
    const blocked = !locals && frame.blocked;
    const unchanged =
      !frame.blocked &&
      (locals || !frame.terminal) &&
      before.length === after.length &&
      before.every((value, index) => value === after[index]);
    const grid = node('div', undefined, 'frame-pair' + (unchanged || blocked ? ' is-single' : ''));
    (unchanged || blocked ? [before] : [before, after]).forEach((values, side) => {
      if (side) grid.append(node('span', '→', 'frame-arrow'));
      const col = node('section', undefined, 'frame-column'),
        body = node('div', undefined, 'frame-values');
      col.append(
        node(
          'h4',
          blocked
            ? msg('analysis.blocked')
            : unchanged
              ? msg('editor.unchanged')
              : side
                ? (frame.afterLabel ?? msg('common.afterExecution'))
                : (frame.beforeLabel ?? msg('editor.beforeExecution')),
        ),
        body,
      );
      const terminal = side === 1 && !locals && frame.terminal;
      if (terminal) body.append(node('div', terminal, 'frame-terminal'));
      else {
        if (!locals && side === 0 && frame.missing) {
          const missing = node(
            'div',
            '× ' +
              msg('analysis.missing', [
                (frame.requiredInputs ?? []).slice(-frame.missing).map(formatFrameValue).join(', '),
              ]),
            'frame-missing',
          );
          body.append(missing);
        }
        const order = values.map((_, i) => i);
        if (!locals) order.reverse();
        const visible = order.slice(0, frame.limit ?? 8);
        if (!values.length)
          body.append(
            node('div', locals ? msg('common.notSet') : msg('editor.empty'), 'frame-empty'),
          );
        for (const index of visible) {
          const changed =
            !frame.blocked &&
            !unchanged &&
            (locals
              ? (frame.locals?.changed ?? values.map((_, i) => i)).includes(index)
              : index >= values.length - (side ? frame.produced : frame.consumed));
          const row = node('div', undefined, 'frame-row'),
            value = node(
              'div',
              undefined,
              'frame-value' + (changed ? (side ? ' is-produced' : ' is-consumed') : ''),
            );
          value.append(node('code', formatFrameValue(localizedContent(values[index]))));
          if (changed)
            value.title = side
              ? msg('editor.valuesAddedOrUpdated')
              : msg('editor.valuesConsumedOrUpdated');
          if (locals)
            row.append(node('small', frame.locals?.labels?.[index] ?? '#' + index, 'frame-marker'));
          else if (index === values.length - 1) row.append(node('small', 'TOP', 'frame-marker'));
          row.append(value);
          body.append(row);
        }
        if (!locals && (frame.tail || order.length > visible.length))
          body.append(node('div', '⋯', 'frame-rest'));
      }
      grid.append(col);
    });
    return grid;
  }
  root.append(node('h3', msg('common.stack')), pair(frame.before, frame.after));
  if (frame.locals) {
    root.append(
      node('h3', msg('common.locals')),
      pair(frame.locals.before, frame.locals.after, true),
    );
    if (frame.locals.effect) root.append(node('p', frame.locals.effect, 'frame-note'));
  }
  if (frame.note) root.append(node('p', frame.note, 'frame-note'));
  return root;
}
