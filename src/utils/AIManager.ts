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
        // [수정됨] 모든 AI 생성 함수에 playerId를 넘겨주어 '나'를 기준으로 적을 식별하게 함
        switch (mode) {
            case 'RANDOM':
                return this.generateRandom(startPos, nodes, playerId);
            case 'GREEDY':
                return this.generateGreedy(startPos, nodes, playerId);
            case 'AGGRESSIVE':
                return this.generateAggressive(startPos, nodes, segments, playerId);
            case 'TRAJECTORY':
                return this.generateTrajectory(startPos, nodes, playerId);
            default:
                return [];
        }
    }

    private static getUnownedNodes(nodes: Record<string, NodeData>): NodeData[] {
        return Object.values(nodes).filter(n => !n.isBase && n.owner === null);
    }

    // [추가됨] 목표 1 & 2를 위해 '나(playerId)'를 제외한 모든 적군의 점령지를 찾는 헬퍼 함수
    private static getOpponentNodes(nodes: Record<string, NodeData>, playerId: PlayerId): NodeData[] {
        return Object.values(nodes).filter(n => !n.isBase && n.owner !== null && n.owner !== playerId);
    }

    // MODE A: Random
    private static generateRandom(startPos: Vector2, nodes: Record<string, NodeData>, playerId: PlayerId): Vector2[] {
        let available = this.getUnownedNodes(nodes);
        // [수정됨] 목표 2: 중립지가 없으면 적군의 땅을 타겟으로 전환
        if (available.length === 0) available = this.getOpponentNodes(nodes, playerId);
        if (available.length === 0) return []; // 먹을 땅이 아예 없으면 정지

        // Pick 1 to 9 random nodes, somewhat close (distance < 30)
        const nearby = available.filter(n => Math.hypot(n.pos.x - startPos.x, n.pos.y - startPos.y) < 30);
        const pool = nearby.length > 0 ? nearby : available;

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
    private static generateGreedy(startPos: Vector2, nodes: Record<string, NodeData>, playerId: PlayerId): Vector2[] {
        let available = this.getUnownedNodes(nodes);
        // [수정됨] 목표 2: 중립지가 없으면 적군의 땅을 타겟으로 전환
        if (available.length === 0) available = this.getOpponentNodes(nodes, playerId);
        if (available.length === 0) return [];

        const waypoints: Vector2[] = [];
        let current = startPos;
        const count = 9; // 3배 (3 -> 9)

        for (let i = 0; i < count; i++) {
            if (available.length === 0) break;
            available.sort((a, b) => {
                const da = Math.hypot(a.pos.x - current.x, a.pos.y - current.y);
                const db = Math.hypot(b.pos.x - current.x, b.pos.y - current.y);
                return da - db;
            });
            const best = available.shift()!;
            waypoints.push(best.pos);
            current = best.pos;
        }
        return waypoints;
    }

    // MODE C: Aggressive (Targets any opponent's owned nodes directly to pillage them)
    private static generateAggressive(
        startPos: Vector2,
        nodes: Record<string, NodeData>,
        _segments: LineSegment[],
        playerId: PlayerId // [수정됨] 안 쓰는 파라미터 지우고 playerId 받음
    ): Vector2[] {
        const waypoints: Vector2[] = [];
        let current = startPos;
        const count = 9; // 3배 확장

        // [수정됨] 목표 1: P1뿐만 아니라 모든 적군을 타겟으로 삼음
        const opponentOwned = this.getOpponentNodes(nodes, playerId);
        const unowned = this.getUnownedNodes(nodes);

        for (let i = 0; i < count; i++) {
            // Find closest opponent node
            let bestTarget: NodeData | null = null;
            let minDistToTarget = Infinity;

            for (const n of opponentOwned) {
                const d = Math.hypot(n.pos.x - current.x, n.pos.y - current.y);
                if (d < minDistToTarget) {
                    minDistToTarget = d;
                    bestTarget = n;
                }
            }

            // 적의 땅이 존재하고, 거리가 너무 멀지 않다면 직접 타격
            if (bestTarget && minDistToTarget < 25) {
                waypoints.push(bestTarget.pos);
                current = bestTarget.pos;
                opponentOwned.splice(opponentOwned.indexOf(bestTarget), 1);
            } else if (unowned.length > 0) {
                // 거리가 멀면 가장 가까운 중립지 경유 (징검다리)
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
            } else if (opponentOwned.length > 0) {
                // [수정됨] 목표 2: 중립지마저 없다면, 거리가 25 이상으로 멀더라도 가장 가까운 적의 땅을 징검다리로 밟고 감
                let nearestOpp: NodeData | null = null;
                let minO = Infinity;
                for (let j = 0; j < opponentOwned.length; j++) {
                    const o = opponentOwned[j];
                    const d = Math.hypot(o.pos.x - current.x, o.pos.y - current.y);
                    if (d < minO) {
                        minO = d;
                        nearestOpp = o;
                    }
                }
                if (nearestOpp) {
                    waypoints.push(nearestOpp.pos);
                    current = nearestOpp.pos;
                    opponentOwned.splice(opponentOwned.indexOf(nearestOpp), 1);
                }
            } else {
                break;
            }
        }
        return waypoints;
    }

    // MODE D: Trajectory (Reactive Snake Routing)
    private static generateTrajectory(startPos: Vector2, nodes: Record<string, NodeData>, playerId: PlayerId): Vector2[] {
        let availableNodes = this.getUnownedNodes(nodes);
        // [수정됨] 목표 2: 중립지가 없으면 적군의 땅을 타겟으로 전환
        if (availableNodes.length === 0) availableNodes = this.getOpponentNodes(nodes, playerId);
        if (availableNodes.length === 0) return [];

        const p2OwnedCount = Object.values(nodes).filter(n => n.owner === playerId).length;
        const depth = 9 + Math.floor(p2OwnedCount / 5) * 3;
        const maxWaypoints = Math.min(depth, 18);

        const waypoints: Vector2[] = [];
        let currentPos = startPos;

        for (let i = 0; i < maxWaypoints; i++) {
            if (availableNodes.length === 0) break;

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
