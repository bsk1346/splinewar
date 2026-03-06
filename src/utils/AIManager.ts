import type { Vector2 } from './MathUtils';
import type { NodeData, LineSegment, PlayerId } from '../store/useGameState';

export type AIMode = 'RANDOM' | 'GREEDY' | 'AGGRESSIVE' | 'TRAJECTORY';

export class AIManager {
    public static generateWaypoints(
        mode: AIMode,
        startPos: Vector2,
        nodes: Record<string, NodeData>,
        segments: LineSegment[],
        _p1NodesLastRound: NodeData[], // Unused, we look at actual P1 ownership
        playerId: PlayerId = 'P2'
    ): Vector2[] {
        switch (mode) {
            case 'RANDOM':
                return this.generateRandom(startPos, nodes);
            case 'GREEDY':
                return this.generateGreedy(startPos, nodes);
            case 'AGGRESSIVE':
                return this.generateAggressive(startPos, nodes, segments, _p1NodesLastRound);
            case 'TRAJECTORY':
                return this.generateTrajectory(startPos, nodes, playerId);
            default:
                return [];
        }
    }

    private static getUnownedNodes(nodes: Record<string, NodeData>): NodeData[] {
        return Object.values(nodes).filter(n => !n.isBase && n.owner === null);
    }

    // MODE A: Random
    private static generateRandom(startPos: Vector2, nodes: Record<string, NodeData>): Vector2[] {
        const unowned = this.getUnownedNodes(nodes);
        if (unowned.length === 0) return [];

        // Pick 1 to 9 random nodes, somewhat close (distance < 30)
        const nearby = unowned.filter(n => Math.hypot(n.pos.x - startPos.x, n.pos.y - startPos.y) < 30);
        const pool = nearby.length > 0 ? nearby : unowned;

        const count = Math.floor(Math.random() * 9) + 4; // 3배 늘린 4~12 범위
        const waypoints: Vector2[] = [];

        for (let i = 0; i < count; i++) {
            if (pool.length === 0) break;
            const idx = Math.floor(Math.random() * pool.length);
            const next = pool.splice(idx, 1)[0].pos;
            waypoints.push(next);
        }
        return waypoints;
    }

    // MODE B: Greedy Heuristic (Closest unowned repeatedly)
    private static generateGreedy(startPos: Vector2, nodes: Record<string, NodeData>): Vector2[] {
        let unowned = this.getUnownedNodes(nodes);
        if (unowned.length === 0) return [];

        const waypoints: Vector2[] = [];
        let current = startPos;
        const count = 9; // 3배 (3 -> 9)

        for (let i = 0; i < count; i++) {
            if (unowned.length === 0) break;
            unowned.sort((a, b) => {
                const da = Math.hypot(a.pos.x - current.x, a.pos.y - current.y);
                const db = Math.hypot(b.pos.x - current.x, b.pos.y - current.y);
                return da - db;
            });
            const best = unowned.shift()!;
            waypoints.push(best.pos);
            current = best.pos;
        }
        return waypoints;
    }

    // MODE C: Aggressive (Targets P1's owned nodes directly to pillage them)
    // If P1 nodes are too far, route through nearest unowned nodes to build up combo.
    private static generateAggressive(
        startPos: Vector2,
        nodes: Record<string, NodeData>,
        _segments: LineSegment[],
        _p1NodesLastRound: NodeData[] // Unused, we look at actual P1 ownership
    ): Vector2[] {
        const waypoints: Vector2[] = [];
        let current = startPos;
        const count = 9; // 3배 확장

        const p1Owned = Object.values(nodes).filter(n => n.owner === 'P1');
        const unowned = this.getUnownedNodes(nodes);

        for (let i = 0; i < count; i++) {
            // Find closest P1 node
            let bestTarget: NodeData | null = null;
            let minDistToP1 = Infinity;

            for (const n of p1Owned) {
                const d = Math.hypot(n.pos.x - current.x, n.pos.y - current.y);
                if (d < minDistToP1) {
                    minDistToP1 = d;
                    bestTarget = n;
                }
            }

            // P1 node가 존재하고, 거리가 너무 멀지 않다면 (예: 25 논리거리 이하) 직접 타격
            if (bestTarget && minDistToP1 < 25) {
                waypoints.push(bestTarget.pos);
                current = bestTarget.pos;
                p1Owned.splice(p1Owned.indexOf(bestTarget), 1); // remove from target list
            } else if (unowned.length > 0) {
                // 거리가 멀거나 뺏을 게 없으면 가장 가까운 중립지 경유 (징검다리)
                let nearestUnowned: NodeData | null = null;
                let minU = Infinity;
                for (let j = 0; j < unowned.length; j++) {
                    const u = unowned[j];
                    const d = Math.hypot(u.pos.x - current.x, u.pos.y - current.y);
                    if (d < minU) {
                        minU = d;
                        nearestUnowned = u;
                    }
                }
                if (nearestUnowned) {
                    waypoints.push(nearestUnowned.pos);
                    current = nearestUnowned.pos;
                    unowned.splice(unowned.indexOf(nearestUnowned), 1);
                }
            } else {
                break;
            }
        }
        return waypoints;
    }

    // MODE D: Trajectory (Reactive Snake Routing)
    // 점령지 수에 비례하여 탐색 깊이(웨이포인트 개수)를 늘리며, 매 번 가장 가까운 미점령지를 순차적으로 이어나가는 뱀(Snake) 형태의 라우팅
    private static generateTrajectory(startPos: Vector2, nodes: Record<string, NodeData>, playerId: PlayerId): Vector2[] {
        const unowned = this.getUnownedNodes(nodes);
        if (unowned.length === 0) return [];

        // P2가 현재 소유 중인 노드 개수에 비례하여 Depth 설정 (기본 9로 시작, 5개당 +3)
        // 3배 상승한 반응형
        const p2OwnedCount = Object.values(nodes).filter(n => n.owner === playerId).length;
        const depth = 9 + Math.floor(p2OwnedCount / 5) * 3;
        const maxWaypoints = Math.min(depth, 18); // 무한히 길어지는 것 방지, 최대 18개

        const waypoints: Vector2[] = [];
        let currentPos = startPos;
        const availableNodes = [...unowned];

        for (let i = 0; i < maxWaypoints; i++) {
            if (availableNodes.length === 0) break;

            // 현재 위치에서 가장 가까운 미점령지 탐색
            let nearestIdx = -1;
            let minDist = Infinity;

            for (let j = 0; j < availableNodes.length; j++) {
                const node = availableNodes[j];
                const d = Math.hypot(node.pos.x - currentPos.x, node.pos.y - currentPos.y);
                if (d < minDist) {
                    minDist = d;
                    nearestIdx = j;
                }
            }

            if (nearestIdx !== -1) {
                const bestNode = availableNodes.splice(nearestIdx, 1)[0];
                waypoints.push(bestNode.pos);
                currentPos = bestNode.pos;
            } else {
                break;
            }
        }

        return waypoints;
    }
}
