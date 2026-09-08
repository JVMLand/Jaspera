interface Point {
  x: number;
  y: number;
}
interface Box {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}
interface Route {
  kind?: string;
  from: string;
  to: string;
  points: Point[];
  label: string;
  x?: number;
  y?: number;
}
const epsilon = 0.01,
  gap = 4;
const length = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
function hits(a: Point, b: Point, box: Box) {
  return Math.abs(a.x - b.x) < epsilon
    ? a.x > box.x - epsilon &&
        a.x < box.x + box.width + epsilon &&
        Math.max(a.y, b.y) > box.y + epsilon &&
        Math.min(a.y, b.y) < box.y + box.height - epsilon
    : a.y > box.y - epsilon &&
        a.y < box.y + box.height + epsilon &&
        Math.max(a.x, b.x) > box.x + epsilon &&
        Math.min(a.x, b.x) < box.x + box.width - epsilon;
}
function clean(points: Point[]) {
  const out: Point[] = [];
  for (const point of points) {
    if (out.length && length(out.at(-1)!, point) < epsilon) continue;
    out.push(point);
    while (out.length > 2) {
      const a = out.at(-3)!,
        b = out.at(-2)!,
        c = out.at(-1)!;
      if (
        ((Math.abs(a.x - b.x) < epsilon && Math.abs(b.x - c.x) < epsilon) ||
          (Math.abs(a.y - b.y) < epsilon && Math.abs(b.y - c.y) < epsilon)) &&
        length(a, c) >= length(a, b) + length(b, c) - epsilon
      )
        out.splice(out.length - 2, 1);
      else break;
    }
  }
  return out;
}

function parallelOverlap(points: Point[], other: Point[]) {
  return points.slice(1).some((p, i) =>
    other.slice(1).some((q, j) => {
      const a = points[i],
        b = other[j];
      return (
        (Math.abs(a.x - p.x) < epsilon &&
          Math.abs(b.x - q.x) < epsilon &&
          Math.abs(a.x - b.x) < gap &&
          Math.min(Math.max(a.y, p.y), Math.max(b.y, q.y)) -
            Math.max(Math.min(a.y, p.y), Math.min(b.y, q.y)) >
            epsilon) ||
        (Math.abs(a.y - p.y) < epsilon &&
          Math.abs(b.y - q.y) < epsilon &&
          Math.abs(a.y - b.y) < gap &&
          Math.min(Math.max(a.x, p.x), Math.max(b.x, q.x)) -
            Math.max(Math.min(a.x, p.x), Math.min(b.x, q.x)) >
            epsilon)
      );
    }),
  );
}
function crossings(points: Point[], other: Point[]) {
  let count = 0;
  for (let i = 1; i < points.length; i++)
    for (let j = 1; j < other.length; j++) {
      let a = points[i - 1],
        b = points[i],
        c = other[j - 1],
        d = other[j];
      if (Math.abs(a.x - b.x) < epsilon) [a, b, c, d] = [c, d, a, b];
      if (
        Math.abs(a.y - b.y) < epsilon &&
        Math.abs(c.x - d.x) < epsilon &&
        c.x > Math.min(a.x, b.x) + epsilon &&
        c.x < Math.max(a.x, b.x) - epsilon &&
        a.y > Math.min(c.y, d.y) + epsilon &&
        a.y < Math.max(c.y, d.y) - epsilon
      )
        count++;
    }
  return count;
}

/** Find open vertical corridors across the shared width, rather than trying only its center. */
function straightLanes(
  left: number,
  right: number,
  top: number,
  bottom: number,
  obstacles: Box[],
  edge: Route,
  edges: Route[],
  nearLeft = false,
) {
  let lanes = [[left, right]];
  const exclude = (start: number, end: number) => {
    lanes = lanes.flatMap(([a, b]) =>
      end <= a || start >= b
        ? [[a, b]]
        : [
            [a, Math.min(b, start)],
            [Math.max(a, end), b],
          ].filter(([x, y]) => y - x > epsilon),
    );
  };
  for (const box of obstacles)
    if (box.y < bottom && box.y + box.height > top) exclude(box.x - gap, box.x + box.width + gap);
  for (const other of edges)
    if (other !== edge)
      for (let i = 1; i < other.points.length; i++) {
        const a = other.points[i - 1],
          b = other.points[i];
        if (
          Math.abs(a.x - b.x) < epsilon &&
          Math.max(a.y, b.y) > top &&
          Math.min(a.y, b.y) < bottom
        )
          exclude(a.x - gap, b.x + gap);
      }
  const center = (left + right) / 2;
  return lanes
    .map(([a, b]) => (nearLeft ? Math.min(a + gap, (a + b) / 2) : (a + b) / 2))
    .sort((a, b) => (nearLeft ? a - b : Math.abs(a - center) - Math.abs(b - center)));
}

/** Keep the downward ELK placement; reduce elbows or center an east departure.
 * Loop edges keep their return path, but can leave the source from a side. */
export function simplifyGraphRoutes(
  boxes: Box[],
  edges: Route[],
  parents: Map<string, string>,
  bounds: { x: number; y: number; width: number; height: number },
) {
  const byId = new Map(boxes.map((box) => [box.id, box]));
  for (const edge of edges) {
    if (edge.points.length < 3 || edge.from === edge.to) continue;
    const source = byId.get(edge.from),
      target = byId.get(edge.to);
    if (!source || !target) continue;
    const otherLabels = edges
      .filter((e) => e !== edge && e.label && e.x !== undefined)
      .map((e) => ({
        id: '',
        x: e.x! - Math.max(...e.label.split('\n').map((line) => line.length * 6)) / 2,
        y: e.y! - 10,
        width: Math.max(...e.label.split('\n').map((line) => line.length * 6)),
        height: e.label.split('\n').length * 14,
      }));
    const obstacles = boxes
      .filter(
        (box) =>
          box.id !== edge.from &&
          box.id !== edge.to &&
          box.id !== parents.get(edge.from) &&
          box.id !== parents.get(edge.to),
      )
      .concat(otherLabels);
    // A second pass combines an interior shortcut with a shorter side departure.
    for (let pass = 0; pass < 2; pass++) {
      const old = edge.points,
        first = old[0],
        north = Math.abs(first.y - source.y) < epsilon;
      const candidates: Point[][] = [];
      const sx = source.x + source.width / 2,
        sy = source.y + source.height / 2,
        tx = target.x + target.width / 2,
        ty = target.y + target.height / 2,
        bottom = source.y + source.height;
      // Prefer a centered east port to saving a few pixels of vertical travel.
      const eastOffset = (points: Point[]) =>
        Math.abs(points[0].x - source.x - source.width) < epsilon &&
        points[1].x > points[0].x &&
        Math.abs(points[1].y - points[0].y) < epsilon
          ? Math.abs(points[0].y - sy)
          : Infinity;
      const departurePenalty = (points: Point[]) =>
        Number.isFinite(eastOffset(points)) ? eastOffset(points) : 0;
      if (target.y >= source.y) {
        const left = Math.max(source.x, target.x) + gap,
          right = Math.min(source.x + source.width, target.x + target.width) - gap;
        if (left <= right && target.y >= bottom)
          for (const x of straightLanes(left, right, bottom, target.y, obstacles, edge, edges))
            candidates.push([
              { x, y: bottom },
              { x, y: target.y },
            ]);
        // Existing lane coordinates also make good landing points on a wide target.
        // Slide the destination along its top border instead of returning to a fixed port.
        const landingXs = new Set([
          tx,
          ...old.map((p) => Math.max(target.x + gap, Math.min(p.x, target.x + target.width - gap))),
        ]);
        // A wider destination can accept new lanes between the existing ones.
        // Do not limit a side-to-top connection to ELK's original port coordinates.
        if (old.length > 3) {
          const oldCrossings = edges.reduce(
            (sum, e) => sum + (e === edge ? 0 : crossings(old, e.points)),
            0,
          );
          for (const y of [sy, bottom - gap])
            for (const [left, right] of [
              [
                Math.max(target.x + gap, source.x + source.width + gap),
                target.x + target.width - gap,
              ],
              [target.x + gap, Math.min(target.x + target.width - gap, source.x - gap)],
            ]) {
              if (left > right || y > target.y) continue;
              for (const x of straightLanes(left, right, y, target.y, obstacles, edge, edges)) {
                const points = [
                  { x: x > sx ? source.x + source.width : source.x, y },
                  { x, y },
                  { x, y: target.y },
                ];
                if (
                  edges.reduce(
                    (sum, e) => sum + (e === edge ? 0 : crossings(points, e.points)),
                    0,
                  ) <= oldCrossings
                )
                  candidates.push(points);
              }
            }
        }
        for (const y of [sy, bottom - gap])
          for (const x of landingXs) {
            if (y <= target.y && (x > source.x + source.width || x < source.x))
              candidates.push([
                { x: x > sx ? source.x + source.width : source.x, y },
                { x, y },
                { x, y: target.y },
              ]);
          }
        for (const x of [sx, source.x + gap, source.x + source.width - gap])
          if (ty >= bottom && (x < target.x || x > target.x + target.width))
            candidates.push([
              { x, y: bottom },
              { x, y: ty },
              { x: x < tx ? target.x : target.x + target.width, y: ty },
            ]);
      }
      // Keep ELK's outer lane and final attachment when a direct shortcut is blocked.
      // Only shorten the departure; forward routes must still move downward.
      for (let i = 1; i < old.length - 1; i++) {
        const point = old[i];
        if (point.x <= source.x + source.width && point.x >= source.x) continue;
        for (const y of target.y >= source.y ? [sy, bottom - gap, source.y + gap] : [sy]) {
          const points = [
            { x: point.x > sx ? source.x + source.width : source.x, y },
            { x: point.x, y },
            ...old.slice(i),
          ];
          if (target.y >= source.y && points.some((p, j) => j > 0 && p.y < points[j - 1].y))
            continue;
          candidates.push(points);
        }
      }
      // A side landing avoids the final horizontal-then-vertical hook into a top port.
      if (target.y >= bottom)
        for (const x of new Set(old.map((p) => p.x))) {
          const east = x > Math.max(source.x + source.width, target.x + target.width),
            west = x < Math.min(source.x, target.x);
          if (!east && !west) continue;
          for (const y of [sy, bottom - gap, source.y + gap])
            for (const endY of [ty, ty - gap, ty + gap])
              candidates.push([
                { x: east ? source.x + source.width : source.x, y },
                { x, y },
                { x, y: endY },
                { x: east ? target.x + target.width : target.x, y: endY },
              ]);
        }
      // ELK can leave a dogleg between compound blocks even when the corridor is clear.
      // Shortcut interior sections as well as the departure, preserving both endpoints.
      if (target.y >= bottom)
        for (let i = 1; i < old.length - 3; i++)
          for (let j = i + 2; j < old.length - 1; j++) {
            const a = old[i],
              b = old[j];
            if (b.y < a.y) continue;
            for (const corner of [
              { x: a.x, y: b.y },
              { x: b.x, y: a.y },
            ]) {
              const points = [...old.slice(0, i + 1), corner, ...old.slice(j)];
              if (points.some((p, k) => k > 0 && p.y < points[k - 1].y)) continue;
              candidates.push(points);
            }
          }
      const viable = candidates
        .map(clean)
        .filter(
          (points) =>
            points.length < old.length ||
            (points.length === old.length &&
              (north ||
                (Number.isFinite(eastOffset(old)) &&
                  eastOffset(points) < eastOffset(old) - epsilon))),
        )
        .sort(
          (a, b) =>
            a.length - b.length ||
            Number(Math.abs(a.at(-1)!.y - target.y) > epsilon) -
              Number(Math.abs(b.at(-1)!.y - target.y) > epsilon) ||
            departurePenalty(a) - departurePenalty(b) ||
            a.reduce((sum, p, i) => sum + (i ? length(a[i - 1], p) : 0), 0) -
              b.reduce((sum, p, i) => sum + (i ? length(b[i - 1], p) : 0), 0),
        );
      for (const points of viable) {
        if (
          points.some(
            (p) =>
              p.x < bounds.x ||
              p.x > bounds.x + bounds.width ||
              p.y < bounds.y ||
              p.y > bounds.y + bounds.height,
          )
        )
          continue;
        if (points.slice(1).some((p, i) => obstacles.some((box) => hits(points[i], p, box))))
          continue;
        // Preserve distinct parallel arrows, including their attachment points.
        if (edges.some((other) => other !== edge && parallelOverlap(points, other.points)))
          continue;
        let label: Box | undefined;
        if (edge.label) {
          const lines = edge.label.split('\n'),
            width = Math.max(...lines.map((line) => line.length * 6)),
            height = lines.length * 14;
          for (let i = 1; i < points.length && !label; i++) {
            const a = points[i - 1],
              b = points[i],
              cx = (a.x + b.x) / 2,
              cy = (a.y + b.y) / 2;
            const positions =
              Math.abs(a.x - b.x) < epsilon
                ? [
                    { x: cx + 8, y: cy - height / 2 },
                    { x: cx - width - 8, y: cy - height / 2 },
                  ]
                : [
                    { x: cx - width / 2, y: cy - height - 8 },
                    { x: cx - width / 2, y: cy + 8 },
                  ];
            for (const p of positions) {
              const rect = { ...p, id: '', width, height };
              if (
                rect.x >= bounds.x &&
                rect.y >= bounds.y &&
                rect.x + width <= bounds.x + bounds.width &&
                rect.y + height <= bounds.y + bounds.height &&
                !boxes.some((box) => overlaps(rect, box)) &&
                !otherLabels.some((box) => overlaps(rect, box)) &&
                !edges.some(
                  (other) =>
                    other !== edge &&
                    other.points.slice(1).some((p, i) => hits(other.points[i], p, rect)),
                )
              ) {
                label = rect;
                break;
              }
            }
          }
          if (!label) continue;
        }
        edge.points = points;
        if (label) {
          edge.x = label.x + label.width / 2;
          edge.y = label.y + 10;
        }
        break;
      }
      if (edge.points === old) break;
    }
  }
  straightenTopFans(boxes, edges, parents);
  untangleSideFans(boxes, edges, parents);
}

/** Order sibling lanes together: the lower destination uses the outer lane and upper exit. */
function untangleSideFans(boxes: Box[], edges: Route[], parents: Map<string, string>) {
  const groups = new Map<string, Route[]>(),
    byId = new Map(boxes.map((b) => [b.id, b]));
  for (const edge of edges) {
    const p = edge.points;
    if (
      edge.label ||
      p.length < 4 ||
      p[1].x === p[0].x ||
      p[1].y !== p[0].y ||
      !byId.has(edge.to) ||
      byId.get(edge.to)!.y <= p[0].y
    )
      continue;
    const key = edge.from + ':' + (p[1].x > p[0].x ? 'east' : 'west');
    const group = groups.get(key) ?? [];
    group.push(edge);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const east = group[0].points[1].x > group[0].points[0].x;
    const lanes = group.map((e) => e.points[1].x).sort((a, b) => (east ? b - a : a - b)),
      exits = group.map((e) => e.points[0].y).sort((a, b) => a - b);
    const ordered = [...group].sort((a, b) => byId.get(b.to)!.y - byId.get(a.to)!.y);
    const outside = edges.filter((e) => !group.includes(e));
    const proposed = ordered.map((edge, i) => {
      const target = byId.get(edge.to)!,
        center = target.y + target.height / 2;
      const make = (y: number) => [
        { ...edge.points[0], y: exits[i] },
        { x: lanes[i], y: exits[i] },
        { x: lanes[i], y },
        { x: east ? target.x + target.width : target.x, y },
      ];
      const points =
        [center, center - gap, center + gap]
          .map(make)
          .find((points) => !outside.some((e) => parallelOverlap(points, e.points))) ??
        make(center);
      return { edge, points };
    });
    if (
      proposed.some(({ edge, points }) => {
        const obstacles = boxes.filter(
          (b) => b.id !== parents.get(edge.from) && b.id !== parents.get(edge.to),
        );
        for (const other of outside)
          if (other.label && other.x !== undefined && other.y !== undefined) {
            const lines = other.label.split('\n'),
              width = Math.max(...lines.map((line) => line.length * 6));
            obstacles.push({
              id: '',
              x: other.x - width / 2,
              y: other.y - 10,
              width,
              height: lines.length * 14,
            });
          }
        return (
          points.slice(1).some((p, i) => obstacles.some((b) => hits(points[i], p, b))) ||
          outside.some((e) => parallelOverlap(points, e.points))
        );
      })
    )
      continue;
    if (
      proposed.some((a, i) =>
        proposed.slice(i + 1).some((b) => parallelOverlap(a.points, b.points)),
      )
    )
      continue;
    const score = (routes: Point[][]) =>
      routes.reduce(
        (sum, p, i) =>
          sum +
          routes.slice(i + 1).reduce((s, q) => s + crossings(p, q), 0) +
          outside.reduce((s, e) => s + crossings(p, e.points), 0),
        0,
      );
    const before = score(ordered.map((e) => e.points)),
      after = score(proposed.map((p) => p.points));
    if (
      after > before ||
      (after === before &&
        proposed.reduce((n, p) => n + p.points.length, 0) >=
          ordered.reduce((n, e) => n + e.points.length, 0))
    )
      continue;
    for (const { edge, points } of proposed) edge.points = points;
  }
}

/** Allocate incoming stack lanes together, from the lowest producer outward. */
function straightenTopFans(boxes: Box[], edges: Route[], parents: Map<string, string>) {
  const byId = new Map(boxes.map((b) => [b.id, b])),
    groups = new Map<string, Route[]>();
  for (const edge of edges)
    if (edge.kind === 'stack' && !edge.label && edge.points.length > 2) {
      const group = groups.get(edge.to) ?? [];
      group.push(edge);
      groups.set(edge.to, group);
    }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const target = byId.get(group[0].to);
    if (!target) continue;
    const ordered = [...group].sort(
        (a, b) => (byId.get(b.from)?.y ?? 0) - (byId.get(a.from)?.y ?? 0),
      ),
      outside = edges.filter((e) => !group.includes(e));
    const proposed: Route[] = [];
    for (const edge of ordered) {
      const source = byId.get(edge.from);
      if (!source || source.y + source.height > target.y) break;
      const y = source.y + source.height / 2,
        left = Math.max(source.x + source.width + gap, target.x + gap),
        right = target.x + target.width - gap;
      if (left > right) break;
      const obstacles = boxes.filter(
        (b) =>
          b.id !== edge.from &&
          b.id !== edge.to &&
          b.id !== parents.get(edge.from) &&
          b.id !== parents.get(edge.to),
      );
      for (const other of outside)
        if (other.label && other.x !== undefined && other.y !== undefined) {
          const lines = other.label.split('\n'),
            width = Math.max(...lines.map((line) => line.length * 6));
          obstacles.push({
            id: '',
            x: other.x - width / 2,
            y: other.y - 10,
            width,
            height: lines.length * 14,
          });
        }
      const occupied = [...outside, ...proposed];
      const points = straightLanes(left, right, y, target.y, obstacles, edge, occupied, true)
        .map((x) => [
          { x: source.x + source.width, y },
          { x, y },
          { x, y: target.y },
        ])
        .find(
          (points) =>
            !points.slice(1).some((p, i) => obstacles.some((b) => hits(points[i], p, b))) &&
            !occupied.some(
              (e) => parallelOverlap(points, e.points) || crossings(points, e.points) > 0,
            ),
        );
      if (!points) break;
      proposed.push({ ...edge, points });
    }
    if (proposed.length !== ordered.length) {
      // If an equally wide intervening instruction blocks top landings, assign
      // the outer lanes and side entry slots together instead of competing for one port.
      proposed.length = 0;
      const right = Math.max(
        target.x + target.width,
        ...ordered.map((e) => {
          const s = byId.get(e.from);
          return s ? s.x + s.width : Infinity;
        }),
      );
      const lanes = [
        ...new Set(ordered.flatMap((e) => e.points.map((p) => p.x)).filter((x) => x > right)),
      ].sort((a, b) => a - b);
      if (lanes.length < ordered.length || (ordered.length - 1) * gap > target.height - 2 * gap)
        continue;
      for (const [i, edge] of ordered.entries()) {
        const source = byId.get(edge.from);
        if (!source || source.y + source.height > target.y) break;
        const y = source.y + source.height / 2,
          endY = target.y + target.height / 2 + (i - (ordered.length - 1) / 2) * gap;
        const candidates = [y, source.y + source.height - gap, source.y + gap].map((exitY) => [
          { x: source.x + source.width, y: exitY },
          { x: lanes[i], y: exitY },
          { x: lanes[i], y: endY },
          { x: target.x + target.width, y: endY },
        ]);
        const obstacles = boxes.filter(
          (b) => b.id !== parents.get(edge.from) && b.id !== parents.get(edge.to),
        );
        for (const other of outside)
          if (other.label && other.x !== undefined && other.y !== undefined) {
            const lines = other.label.split('\n'),
              width = Math.max(...lines.map((line) => line.length * 6));
            obstacles.push({
              id: '',
              x: other.x - width / 2,
              y: other.y - 10,
              width,
              height: lines.length * 14,
            });
          }
        const points = candidates.find(
          (points) =>
            !points.slice(1).some((p, j) => obstacles.some((b) => hits(points[j], p, b))) &&
            ![...outside, ...proposed].some(
              (e) => parallelOverlap(points, e.points) || crossings(points, e.points) > 0,
            ),
        );
        if (!points) break;
        proposed.push({ ...edge, points });
      }
      if (proposed.length !== ordered.length) continue;
    }
    const shorter =
      proposed.reduce((n, e) => n + e.points.length, 0) <
      ordered.reduce((n, e) => n + e.points.length, 0);
    const west = ordered.some((e) => e.points[1].x < e.points[0].x);
    const crossed = ordered.some((e, i) =>
      ordered.slice(i + 1).some((o) => crossings(e.points, o.points) > 0),
    );
    if (!shorter && !west && !crossed) continue;
    ordered.forEach((edge, i) => {
      edge.points = proposed[i].points;
    });
  }
}
