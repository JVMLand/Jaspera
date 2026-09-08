import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import ELK from 'elkjs/lib/elk.bundled.js';
await build({
  entryPoints: ['src/graph-layout.ts'],
  outfile: '.cache/graph-layout.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
});
const { positionGraphs } = await import('../.cache/graph-layout.mjs');
const elk = new ELK();
const node = (id) => ({
  id,
  text: id,
  opcode: 'nop',
  block: 'B0',
  line: 1,
  column: 1,
  consumed: 0,
  produced: 0,
  unreachable: false,
});
const edge = (from, to, kind = 'control') => ({ from, to, kind, label: '' });
test('simple chains stay straight; methods retain separate namespaces and bounds', async () => {
  const method = {
    name: 'sample()V',
    nodes: ['a', 'b', 'c'].map(node),
    edges: [edge('a', 'b'), edge('b', 'c')],
  };
  const result = await positionGraphs([method, { ...method, name: 'other()V' }], elk);
  assert.equal(result.nodes.length, 6);
  assert.equal(new Set(result.nodes.map((n) => n.id)).size, 6);
  assert.ok(result.boxes[1].y > result.boxes[0].height);
  for (const e of result.edges) {
    assert.equal(e.points.length, 2);
    assert.equal(e.points[0].x, e.points[1].x);
  }
});
test('joins, loops and parallel data/control edges use only orthogonal segments', async () => {
  const method = {
    name: 'loop()V',
    nodes: ['a', 'b', 'c', 'd'].map(node),
    edges: [
      edge('a', 'b'),
      edge('a', 'b', 'stack'),
      edge('a', 'c'),
      edge('b', 'd'),
      edge('c', 'd'),
      edge('d', 'a'),
      edge('b', 'b', 'local'),
    ],
  };
  const result = await positionGraphs([method], elk);
  assert.equal(result.edges.length, method.edges.length);
  for (const e of result.edges) {
    assert.ok(e.points.length >= 2);
    for (let i = 1; i < e.points.length; i++) {
      const a = e.points[i - 1],
        b = e.points[i];
      assert.ok(Math.abs(a.x - b.x) < 0.001 || Math.abs(a.y - b.y) < 0.001);
    }
  }
});

const arithmetic = {
  name: 'main([Ljava/lang/String;)V',
  nodes: [
    ['out', 'getstatic java/lang/System->out:Ljava/io/PrintStream;'],
    ['seven', 'bipush 7'],
    ['five', 'iconst_5'],
    ['add', 'iadd'],
    ['three', 'iconst_3'],
    ['multiply', 'imul'],
    ['print', 'invokevirtual java/io/PrintStream->println(I)V'],
    ['return', 'return'],
  ].map(([id, text]) => ({ ...node(id), text })),
  edges: [
    ...['out', 'seven', 'five', 'add', 'three', 'multiply', 'print'].map((id, i) =>
      edge(id, ['seven', 'five', 'add', 'three', 'multiply', 'print', 'return'][i]),
    ),
    edge('out', 'print', 'stack'),
    edge('seven', 'add', 'stack'),
    edge('five', 'add', 'stack'),
    edge('add', 'multiply', 'stack'),
    edge('three', 'multiply', 'stack'),
    edge('multiply', 'print', 'stack'),
  ],
};
test('aligned arithmetic columns keep control edges straight and dependencies clear', async () => {
  const result = await positionGraphs([arithmetic], elk);
  assert.equal(new Set(result.nodes.map((n) => n.x)).size, 1);
  for (const e of result.edges) {
    if (e.kind === 'control') {
      assert.equal(e.points.length, 2);
      assert.equal(e.points[0].x, e.points[1].x);
    }
    for (let i = 1; i < e.points.length; i++) {
      const a = e.points[i - 1],
        b = e.points[i];
      assert.ok(a.x === b.x || a.y === b.y);
      for (const n of result.nodes) {
        if (n.id === e.from || n.id === e.to) continue;
        const crossed =
          a.x === b.x
            ? a.x > n.x - n.width / 2 &&
              a.x < n.x + n.width / 2 &&
              Math.min(a.y, b.y) < n.y + n.height / 2 &&
              Math.max(a.y, b.y) > n.y - n.height / 2
            : a.y > n.y - n.height / 2 &&
              a.y < n.y + n.height / 2 &&
              Math.min(a.x, b.x) < n.x + n.width / 2 &&
              Math.max(a.x, b.x) > n.x - n.width / 2;
        assert.ok(!crossed, 'edge crosses ' + n.id);
      }
    }
  }
});

for (const compound of [false, true])
  test('String constructor instructions share a center line ' + compound, async () => {
    const texts = [
      'aload_0',
      'invokespecial java/lang/Object-><init>()V',
      'iload_3',
      'iload 4',
      'aload_1',
      'arraylength',
      'invokestatic java/lang/String->checkBoundsOffCount(III)I',
      'pop',
      'iload 4',
      'ifne L0',
    ];
    const nodes = texts.map((text, i) => ({ ...node('n' + i), text }));
    const edges = [
      ...texts.slice(1).map((_, i) => edge('n' + i, 'n' + (i + 1))),
      ...[
        [0, 1],
        [2, 6],
        [3, 6],
        [4, 5],
        [5, 6],
        [6, 7],
        [8, 9],
      ].map(([a, b]) => edge('n' + a, 'n' + b, 'stack')),
    ];
    if (compound) {
      nodes.push({ ...node('exit'), block: 'B1' });
      edges.push(edge('n9', 'exit'));
    }
    const result = await positionGraphs([{ name: 'constructor()V', nodes, edges }], elk),
      column = result.nodes.filter((n) => n.block === 'B0');
    assert.equal(new Set(column.map((n) => Math.round(n.x * 1000))).size, 1);
    for (let i = 1; i < column.length; i++) assert.ok(column[i].y > column[i - 1].y);
  });

test('blocked corridors retain ELK detours and clear horizontal corridors use side ports', async () => {
  const fixture = async (blocked) => {
    const graph = {
      id: 'method',
      children: [
        { id: 'a', x: 0, y: 0, width: 110, height: 30 },
        { id: 'b', x: 160, y: 10, width: 110, height: 30 },
        ...(blocked ? [{ id: 'wall', x: 130, y: 0, width: 20, height: 60 }] : []),
      ],
      edges: [
        {
          id: 'e0',
          sources: ['a'],
          targets: ['b'],
          sections: [
            {
              id: 's',
              startPoint: { x: 55, y: 30 },
              bendPoints: [
                { x: 55, y: 70 },
                { x: 215, y: 70 },
              ],
              endPoint: { x: 215, y: 40 },
            },
          ],
        },
      ],
      width: 300,
      height: 100,
    };
    const method = {
      name: 'side()V',
      nodes: graph.children.map((n) => node(n.id)),
      edges: [edge('a', 'b')],
    };
    return positionGraphs([method], { layout: async () => graph });
  };
  const clear = await fixture(false),
    blocked = await fixture(true);
  assert.equal(clear.edges[0].points.length, 2);
  assert.equal(clear.edges[0].points[0].y, clear.edges[0].points[1].y);
  assert.equal(clear.edges[0].points[0].x, 110);
  assert.equal(clear.edges[0].points[1].x, 160);
  assert.equal(blocked.edges[0].points.length, 4);
});

test('label blocks contain their instructions and exception arrows attach to block borders', async () => {
  const method = {
    name: 'guarded()V',
    nodes: [
      { ...node('a'), block: 'B0' },
      { ...node('b'), block: 'B0' },
      { ...node('c'), block: 'B1' },
      { ...node('d'), block: 'B2' },
    ],
    edges: [
      edge('a', 'b'),
      edge('b', 'c'),
      edge('a', 'c', 'stack'),
      { ...edge('B0', 'B2', 'exception'), label: 'RuntimeException' },
      edge('c', 'd'),
    ],
  };
  const result = await positionGraphs([method], elk);
  assert.equal(result.blocks.length, 3);
  assert.equal(result.edges.length, method.edges.length);
  for (const n of result.nodes) {
    const box = result.blocks.find((b) => b.id === 'm0:' + n.block);
    assert.ok(box);
    assert.ok(n.x - n.width / 2 >= box.x && n.x + n.width / 2 <= box.x + box.width);
    assert.ok(n.y - n.height / 2 >= box.y && n.y + n.height / 2 <= box.y + box.height);
  }
  for (const e of result.edges)
    for (let i = 1; i < e.points.length; i++) {
      const a = e.points[i - 1],
        b = e.points[i];
      assert.ok(Math.abs(a.x - b.x) < 0.001 || Math.abs(a.y - b.y) < 0.001);
    }
  for (const e of result.edges)
    for (const [id, p] of [
      [e.from, e.points[0]],
      [e.to, e.points.at(-1)],
    ]) {
      const n = result.nodes.find((n) => n.id === id),
        b = n
          ? { x: n.x - n.width / 2, y: n.y - n.height / 2, width: n.width, height: n.height }
          : result.blocks.find((b) => b.id === id);
      assert.ok(
        p.x >= b.x - 0.01 &&
          p.x <= b.x + b.width + 0.01 &&
          p.y >= b.y - 0.01 &&
          p.y <= b.y + b.height + 0.01,
        JSON.stringify({ id, b, p }),
      );
      assert.ok(
        [
          Math.abs(p.x - b.x),
          Math.abs(p.x - b.x - b.width),
          Math.abs(p.y - b.y),
          Math.abs(p.y - b.y - b.height),
        ].some((d) => d < 0.01),
        JSON.stringify({ id, b, p }),
      );
    }
});

test('hiding all arrows preserves the ordered instruction column', async () => {
  const result = await positionGraphs([{ ...arithmetic, edges: [] }], elk);
  assert.equal(result.edges.length, 0);
  assert.equal(new Set(result.nodes.map((n) => n.x)).size, 1);
  for (let i = 1; i < result.nodes.length; i++)
    assert.ok(result.nodes[i].y - result.nodes[i - 1].y >= 30);
});

test('PrintStream constructor arguments descend from centered east exits with one elbow each', async () => {
  const texts = [
    'aload_0',
    'aload_3',
    'iload_1',
    'aload_2',
    'invokespecial java/io/PrintStream-><init>(Ljava/io/OutputStream;ZLjava/nio/charset/Charset;)V',
    'return',
  ];
  const nodes = texts.map((text, i) => ({ ...node('arg' + i), text, opcode: text.split(' ')[0] }));
  const method = {
    name: '<init>(ZLjava/nio/charset/Charset;Ljava/io/OutputStream;)V',
    nodes,
    edges: [
      ...nodes.slice(1).map((_, i) => edge('arg' + i, 'arg' + (i + 1))),
      ...[3, 2, 1, 0].map((i) => edge('arg' + i, 'arg4', 'stack')),
    ],
  };
  const result = await positionGraphs([method], elk),
    routes = [0, 1, 2].map((i) =>
      result.edges.find((e) => e.from === 'm0:arg' + i && e.kind === 'stack'),
    );
  for (const [i, route] of routes.entries()) {
    const source = result.nodes[i];
    assert.equal(route.points.length, 3);
    assert.deepEqual(route.points[0], { x: source.x + source.width / 2, y: source.y });
    assert.equal(route.points[1].x, route.points[2].x);
  }
  assert.ok(
    routes[0].points[1].x > routes[1].points[1].x && routes[1].points[1].x > routes[2].points[1].x,
  );
});

test('wide invokestatic leaves from its east center when four values share a side landing', async () => {
  const texts = [
    'aload_0',
    'iconst_0',
    'aload_2',
    'invokestatic java/io/PrintStream->toCharset(Ljava/lang/String;)Ljava/nio/charset/Charset;',
    'new java/io/FileOutputStream',
    'dup',
    'aload_1',
    'invokespecial java/io/FileOutputStream-><init>(Ljava/lang/String;)V',
    'invokespecial java/io/PrintStream-><init>(ZLjava/nio/charset/Charset;Ljava/io/OutputStream;)V',
    'return',
  ];
  const nodes = texts.map((text, i) => ({ ...node('n' + i), text, opcode: text.split(' ')[0] }));
  const method = {
    name: '<init>(Ljava/lang/String;Ljava/lang/String;)V',
    nodes,
    edges: [
      ...nodes.slice(1).map((_, i) => edge('n' + i, 'n' + (i + 1))),
      ...[
        [2, 3],
        [4, 5],
        [6, 7],
        [5, 7],
        [5, 8],
        [3, 8],
        [1, 8],
        [0, 8],
      ].map(([a, b]) => edge('n' + a, 'n' + b, 'stack')),
    ],
  };
  const result = await positionGraphs([method], elk),
    call = result.nodes[3],
    target = result.nodes[8],
    routes = [5, 3, 1, 0].map((i) =>
      result.edges.find((e) => e.from === 'm0:n' + i && e.to === 'm0:n8' && e.kind === 'stack'),
    );
  for (const route of routes) {
    assert.equal(route.points.length, 4);
    assert.equal(route.points[1].x, route.points[2].x);
    assert.equal(route.points[2].y, route.points[3].y);
    assert.equal(route.points[3].x, target.x + target.width / 2);
  }
  assert.deepEqual(routes[1].points[0], { x: call.x + call.width / 2, y: call.y });
  for (let i = 1; i < routes.length; i++) {
    assert.ok(routes[i].points[1].x > routes[i - 1].points[1].x);
    assert.ok(routes[i].points[3].y > routes[i - 1].points[3].y);
  }
});
