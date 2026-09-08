import { autoUpdate, computePosition, offset, flip, shift, arrow } from '@floating-ui/dom';
import './feature-guides.css';

interface Guide {
  id: string;
  title: string;
  text: string;
  target: string;
  trigger?: string;
  context?: boolean;
}
const tab = (name: string) => `[data-panel="${name}"] [role="tab"]`;
const selected = (name: string) => tab(name) + '[aria-selected="true"]';
const guides: Guide[] = [
  {
    id: 'debug',
    title: '一命令ずつ実行',
    text: '矢印のボタンでステップ実行できます。ステップインは呼び出し先へ，ステップアウトは呼び出し元へ進みます。フレームでスタックとローカル変数を確認できます。',
    target: '.debug-toolbar:not([hidden])[data-state="paused"]',
    context: true,
  },
  {
    id: 'instructions',
    title: '命令を調べる',
    text: '検索欄から命令名や説明を検索できます。エディタで命令をクリックすると，その命令の説明に切り替わります。使用例の命令にマウスを重ねると，スタックの変化を確認できます。',
    target: selected('instructions'),
    trigger: tab('instructions'),
    context: true,
  },
  {
    id: 'graph',
    title: '命令のつながりを見る',
    text: 'スタック・ローカル変数・分岐のつながりを図で確認できます。上のチェックボックスで線の種類を切り替え，ドラッグで図を移動できます。',
    target: selected('graph'),
    trigger: tab('graph'),
    context: true,
  },
  {
    id: 'problems',
    title: 'エラーを確認する',
    text: '項目をクリックすると，問題のある行へ移動します。修正候補がある場合は，エディタの電球から適用できます。',
    target: selected('problems'),
    trigger: tab('problems'),
    context: true,
  },
  {
    id: 'run',
    title: 'プログラムを実行',
    text: 'Run で実行し，Console で出力を確認できます。実行中は同じボタンで停止できます。',
    target: '#run',
  },
  {
    id: 'project',
    title: 'ファイルとサンプル',
    text: 'example には実行できるサンプルがあります。ファイルを開いて編集してみてください。自分のフォルダーは File → フォルダーを開くから開けます。',
    target: selected('project'),
    trigger: tab('project'),
  },
  {
    id: 'tabs',
    title: '作業しやすい配置に',
    text: 'タブを少し長押ししてドラッグすると，別のグループへ移動できます。画面の外へ持ち出すと小窓になります。グループの境界をドラッグすると幅を変えられます。',
    target: '[data-pane-kind="editor"] [role="tab"][aria-selected="true"]',
    trigger: '[data-pane-kind="editor"] [role="tab"]',
  },
  {
    id: 'breakpoints',
    title: '途中で止める',
    text: '行番号とバイトコードオフセットの間をクリックすると，ブレークポイントを置けます。Run で実行すると，その命令の直前で一時停止します。',
    target: '.jal-breakpoint-slot[data-guide="hello-breakpoint"]',
    trigger: '.jal-breakpoint-slot[data-guide="hello-breakpoint"]',
  },
  {
    id: 'console',
    title: '出力と入力',
    text: 'プログラムの出力がここに表示されます。入力が必要なプログラムでは，実行前に標準入力へ文字列を入れてください。',
    target: selected('console'),
    trigger: tab('console'),
    context: true,
  },
  {
    id: 'view',
    title: '見た目とパネル',
    text: 'View からテーマを変更したり，閉じたパネルを開き直したりできます。Shift を2回押すと，ファイルや OpenJDK の定義を検索できます。',
    target: '#menu-view',
    trigger: '#menu-view',
    context: true,
  },
  {
    id: 'file',
    title: 'フォルダーを開く・保存する',
    text: 'File → 開くから JAL や class ファイルを開けます。フォルダーを開いている場合は，保存で編集内容をそのフォルダーに書き込みます。',
    target: '#menu-file',
    trigger: '#menu-file',
    context: true,
  },
  {
    id: 'edit',
    title: '編集と整形',
    text: 'Edit に検索・置換やコードの整形があります。命令を入力すると補完候補が表示され，命令にマウスを重ねるとスタックの変化を確認できます。',
    target: '#menu-edit',
    trigger: '#menu-edit',
    context: true,
  },
  {
    id: 'build',
    title: '検査と class の書き出し',
    text: 'Build からコードを検査したり，コンパイルした class ファイルを書き出したりできます。',
    target: '#menu-build',
    trigger: '#menu-build',
    context: true,
  },
];
const prefix = 'jaspera.guide.dismissed.';
let installed = false;
export function resetFeatureGuides() {
  window.dispatchEvent(new Event('jaspera:reset-guides'));
}
export function installFeatureGuides() {
  if (installed) return;
  installed = true;
  const dismissed = new Set<string>();
  const read = () => {
    for (const guide of guides) {
      try {
        if (localStorage.getItem(prefix + guide.id) === '1') dismissed.add(guide.id);
        else dismissed.delete(guide.id);
      } catch {
        /* Storage may be disabled; retain session choices. */
      }
    }
  };
  read();
  const bubble = document.createElement('aside');
  bubble.className = 'feature-guide';
  bubble.hidden = true;
  bubble.setAttribute('role', 'note');
  bubble.setAttribute('aria-labelledby', 'feature-guide-title');
  const title = document.createElement('h2');
  title.id = 'feature-guide-title';
  const text = document.createElement('p');
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'feature-guide-close';
  close.textContent = '×';
  const skip = document.createElement('button');
  skip.type = 'button';
  skip.className = 'feature-guide-skip';
  skip.textContent = 'すべてスキップ';
  const tip = document.createElement('span');
  tip.className = 'feature-guide-arrow';
  tip.setAttribute('aria-hidden', 'true');
  bubble.append(title, close, text, skip, tip);
  document.body.append(bubble);
  let current: Guide | undefined,
    target: HTMLElement | undefined,
    cleanup: (() => void) | undefined,
    request = 0,
    epoch = 0,
    preferred: string | undefined;
  const visible = (node: HTMLElement) => {
    const r = node.getBoundingClientRect();
    return (
      !node.closest('[hidden]') &&
      r.width > 0 &&
      r.height > 0 &&
      r.bottom > 0 &&
      r.top < innerHeight &&
      r.right > 0 &&
      r.left < innerWidth &&
      getComputedStyle(node).visibility !== 'hidden'
    );
  };
  function hide() {
    epoch++;
    cleanup?.();
    cleanup = undefined;
    current = undefined;
    target = undefined;
    bubble.hidden = true;
  }
  function refresh() {
    request = 0;
    if (
      document.querySelector(
        'dialog[open],.menu-popup:not([hidden]),[role="menu"]:not([hidden]):not(.menu-popup)',
      )
    ) {
      hide();
      return;
    }
    const options = guides.filter(
      (g) =>
        !dismissed.has(g.id) &&
        (!g.context ||
          g.id === preferred ||
          ['debug', 'instructions', 'graph', 'problems'].includes(g.id)),
    );
    options.sort((a, b) => Number(b.id === preferred) - Number(a.id === preferred));
    let next: Guide | undefined, anchor: HTMLElement | undefined;
    for (const guide of options) {
      const node = [...document.querySelectorAll<HTMLElement>(guide.target)].find(visible);
      if (node) {
        next = guide;
        anchor = node;
        break;
      }
    }
    if (!next || !anchor) {
      hide();
      return;
    }
    if (next === current && anchor === target) return;
    hide();
    current = next;
    target = anchor;
    const token = epoch;
    title.textContent = next.title;
    text.textContent = next.text;
    close.setAttribute('aria-label', next.title + 'のガイドを閉じる');
    bubble.dataset.guide = next.id;
    bubble.hidden = false;
    bubble.style.visibility = 'hidden';
    const position = () => {
      void computePosition(anchor!, bubble, {
        strategy: 'fixed',
        placement: 'bottom',
        middleware: [
          offset(18),
          flip({ boundary: [], fallbackPlacements: ['top'] }),
          shift({ boundary: [], padding: 12 }),
          arrow({ element: tip, padding: 16 }),
        ],
      }).then(({ x, y, placement, middlewareData }) => {
        if (token !== epoch) return;
        Object.assign(bubble.style, { left: x + 'px', top: y + 'px', visibility: 'visible' });
        const side = placement.split('-')[0],
          opposite = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }[side]!;
        Object.assign(tip.style, { left: '', top: '', right: '', bottom: '' });
        if (middlewareData.arrow?.x !== undefined) tip.style.left = middlewareData.arrow.x + 'px';
        if (middlewareData.arrow?.y !== undefined) tip.style.top = middlewareData.arrow.y + 'px';
        tip.style.setProperty(opposite, '-5px');
        bubble.dataset.side = side;
      });
    };
    cleanup = autoUpdate(anchor, bubble, position);
  }
  const schedule = () => {
    if (!request) request = requestAnimationFrame(refresh);
  };
  function dismiss(ids: string[]) {
    for (const id of ids) {
      dismissed.add(id);
      try {
        localStorage.setItem(prefix + id, '1');
      } catch {}
    }
    preferred = undefined;
    hide();
    schedule();
  }
  close.onclick = () => {
    if (current) dismiss([current.id]);
  };
  skip.onclick = () => dismiss(guides.map((guide) => guide.id));
  const interact = (event: Event) => {
    if (!(event.target instanceof Element) || bubble.contains(event.target)) return;
    const guide = guides.find(
      (g) => g.trigger && event.target instanceof Element && event.target.closest(g.trigger),
    );
    if (guide) preferred = guide.id;
    schedule();
  };
  const storage = (event: StorageEvent) => {
    if (event.key === null || event.key.startsWith(prefix)) {
      read();
      schedule();
    }
  };
  const reset = () => {
    for (const guide of guides) {
      dismissed.delete(guide.id);
      try {
        localStorage.removeItem(prefix + guide.id);
      } catch {}
    }
    preferred = undefined;
    hide();
    schedule();
  };
  const observer = new MutationObserver((records) => {
    if (records.some((record) => !bubble.contains(record.target))) schedule();
  });
  observer.observe(document.body, {
    subtree: true,
    attributes: true,
    attributeFilter: ['hidden', 'aria-selected', 'open'],
  });
  document.addEventListener('scroll', schedule, true);
  document.addEventListener('click', interact, true);
  document.addEventListener('focusin', interact, true);
  window.addEventListener('resize', schedule);
  window.addEventListener('storage', storage);
  window.addEventListener('jaspera:reset-guides', reset);
  window.addEventListener(
    'pagehide',
    () => {
      cancelAnimationFrame(request);
      observer.disconnect();
      cleanup?.();
      bubble.remove();
      document.removeEventListener('scroll', schedule, true);
      document.removeEventListener('click', interact, true);
      document.removeEventListener('focusin', interact, true);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('storage', storage);
      window.removeEventListener('jaspera:reset-guides', reset);
      installed = false;
    },
    { once: true },
  );
  schedule();
}
