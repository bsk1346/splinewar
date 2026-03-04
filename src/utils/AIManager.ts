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
                return this.generateRandom(startPos, nodes, playerId);
            case 'GREEDY':
                return this.generateGreedy(startPos, nodes, playerId);
            case 'AGGRESSIVE':
                return this.generateAggressive(startPos, nodes, segments, playerId);
            case 'TRAJECTORY':
                // [수정됨] 선분 충돌 판별을 위해 segments를 넘겨줍니다.
                return this.generateTrajectory(startPos, nodes, segments, playerId);
            default:
                return [];
        }
    }

    private static getUnownedNodes(nodes: Record<string, NodeData>): NodeData[] {
        return Object.values(nodes).filter(n => !n.isBase && n.owner === null);
    }

    private static getOpponentNodes(nodes: Record<string, NodeData>, playerId: PlayerId): NodeData[] {
        return Object.values(nodes).filter(n => !n.isBase && n.owner !== null && n.owner !== playerId);
    }

    // [추가됨] 목표 1을 위한 선분 교차(Intersection) 판별 수학 헬퍼 함수
    private static doLinesIntersect(p1: Vector2, p2: Vector2, p3: Vector2, p4: Vector2): boolean {
        const ccw = (A: Vector2, B: Vector2, C: Vector2) => (C.y - A.y) * (B.x - A.x) > (B.y - A.y) * (C.x - A.x);
        return ccw(p1, p3, p4) !== ccw(p2, p3, p4) && ccw(p1, p2, p3) !== ccw(p1, p2, p4);
    }

    // MODE A: Random
    private static generateRandom(startPos: Vector2, nodes: Record<string, NodeData>, playerId: PlayerId): Vector2[] {
        let available = this.getUnownedNodes(nodes);
        if (available.length === 0) available = this.getOpponentNodes(nodes, playerId);
        if (available.length === 0) return [];

        const nearby = available.filter(n => Math.hypot(n.pos.x - startPos.x, n.pos.y - startPos.y) < 30);
        const pool = nearby.length > 0 ? nearby : available;

        const count = Math.floor(Math.random() * 9) + 4; 
        const waypoints: Vector2[] = [];

        for (let i = 0; i < count; i++) {
            if (pool.length === 0) break;
            const idx = Math.floor(Math.random() * pool.length);
            const next = pool.splice(idx, 1)[0].pos;
            waypoints.push(next);
        }
        return waypoints;
    }

    // MODE B: Greedy Heuristic
    private static generateGreedy(startPos: Vector2, nodes: Record<string, NodeData>, playerId: PlayerId): Vector2[] {
        let available = this.getUnownedNodes(nodes);
        if (available.length === 0) available = this.getOpponentNodes(nodes, playerId);
        if (available.length === 0) return [];

        const waypoints: Vector2[] = [];
        let current = startPos;
        
        // [수정됨] 목표 2: 점령지 5개당 3개의 웨이포인트 추가 (Trajectory와 동일한 공식)
        const ownedCount = Object.values(nodes).filter(n => n.owner === playerId).length;
        const count = 9 + Math.floor(ownedCount / 5) * 3;

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

    // MODE C: Aggressive
    private static generateAggressive(
        startPos: Vector2,
        nodes: Record<string, NodeData>,
        _segments: LineSegment[],
        playerId: PlayerId
    ): Vector2[] {
        const waypoints: Vector2[] = [];
        let current = startPos;
        
        // [수정됨] 목표 3: (m - n) 값이 5씩 커질수록 2개의 웨이포인트 추가
        const n = Object.values(nodes).filter(node => node.owner === playerId).length;
        const opponentOwned = this.getOpponentNodes(nodes, playerId);
        const m = opponentOwned.length;
        const diff = Math.max(0, m - n); // 지고 있을 때(m이 n보다 클 때)만 격차 인정
        const count = 9 + Math.floor(diff / 5) * 2;

        const unowned = this.getUnownedNodes(nodes);

        for (let i = 0; i < count; i++) {
            let bestTarget: NodeData | null = null;
            let minDistToTarget = Infinity;

            for (const node of opponentOwned) {
                const d = Math.hypot(node.pos.x - current.x, node.pos.y - current.y);
                if (d < minDistToTarget) {
                    minDistToTarget = d;
                    bestTarget = node;
                }
            }

            if (bestTarget && minDistToTarget < 25) {
                waypoints.push(bestTarget.pos);
                current = bestTarget.pos;
                opponentOwned.splice(opponentOwned.indexOf(bestTarget), 1);
            } else if (unowned.length > 0) {
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

    // MODE D: Trajectory (Reactive Snake Routing with Segment Avoidance/Preference)
    private static generateTrajectory(
        startPos: Vector2, 
        nodes: Record<string, NodeData>, 
        segments: LineSegment[], // [수정됨] 선분 매개변수 추가
        playerId: PlayerId
    ): Vector2[] {
        let availableNodes = this.getUnownedNodes(nodes);
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
            // [수정됨] 단순 거리가 아닌 가중치 점수(가장 낮은 값이 최적)를 사용
            let minScore = Infinity; 

            for (let j = 0; j < availableNodes.length; j++) {
                const node = availableNodes[j];
                const d = Math.hypot(node.pos.x - currentPos.x, node.pos.y - currentPos.y);
                
                // 기본 점수는 물리적 거리
                let score = d;

                // [수정됨] 목표 1: 경로(currentPos -> node.pos)상에 활성화된 선분이 있는지 체크
                segments.forEach(seg => {
                    if (!seg.active) return;
                    
                    if (this.doLinesIntersect(currentPos, node.pos, seg.p1, seg.p2)) {
                        if (seg.owner === playerId) {
                            score -= 15; // 아군 선분 교차 시: 점수 차감 (더 가깝게, 선호하게 느낌)
                        } else {
                            score += 30; // 적군 선분 교차 시: 점수 가산 (더 멀게, 피하게 느낌)
                        }
                    }
                });

                if (score < minScore) {
                    minScore = score;
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
