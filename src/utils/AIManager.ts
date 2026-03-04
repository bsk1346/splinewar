// MODE B: Greedy Heuristic
    private static generateGreedy(startPos: Vector2, nodes: Record<string, NodeData>, playerId: PlayerId): Vector2[] {
        // [수정됨] 매 걸음마다 평가하기 위해 두 풀(중립지, 적군 점령지)을 모두 가져옵니다.
        const unownedNodes = this.getUnownedNodes(nodes);
        const opponentNodes = this.getOpponentNodes(nodes, playerId);

        const waypoints: Vector2[] = [];
        let current = startPos;
        
        const ownedCount = Object.values(nodes).filter(n => n.owner === playerId).length;
        const count = 9 + Math.floor(ownedCount / 5) * 3;
        
        // [추가됨] 목표 1: 중립지가 이 거리보다 멀면 강탈 시도 (AGGRESSIVE의 25보다 넓은 35로 설정)
        const STEAL_THRESHOLD = 35;

        for (let i = 0; i < count; i++) {
            let bestUnownedIdx = -1;
            let minUnownedDist = Infinity;

            // 1. 남은 중립지 중 가장 가까운 곳 탐색
            for (let j = 0; j < unownedNodes.length; j++) {
                const d = Math.hypot(unownedNodes[j].pos.x - current.x, unownedNodes[j].pos.y - current.y);
                if (d < minUnownedDist) {
                    minUnownedDist = d;
                    bestUnownedIdx = j;
                }
            }

            // 2. [수정됨] 목표 2 & 1: 중립지가 아예 없거나, 너무 멀리 떨어져 있다면 적군 점령지로 타겟 변경
            if (minUnownedDist > STEAL_THRESHOLD || unownedNodes.length === 0) {
                let bestOppIdx = -1;
                let minOppDist = Infinity;
                
                for (let j = 0; j < opponentNodes.length; j++) {
                    const d = Math.hypot(opponentNodes[j].pos.x - current.x, opponentNodes[j].pos.y - current.y);
                    if (d < minOppDist) {
                        minOppDist = d;
                        bestOppIdx = j;
                    }
                }

                // 타겟팅할 적군 점령지가 있다면 경로에 추가하고 다음 걸음으로 넘어감
                if (bestOppIdx !== -1) {
                    const bestNode = opponentNodes.splice(bestOppIdx, 1)[0];
                    waypoints.push(bestNode.pos);
                    current = bestNode.pos;
                    continue; 
                }
            }

            // 3. 위 조건에 해당하지 않거나 적군 땅도 없다면, 정상적으로 가장 가까운 중립지 선택
            if (bestUnownedIdx !== -1) {
                const bestNode = unownedNodes.splice(bestUnownedIdx, 1)[0];
                waypoints.push(bestNode.pos);
                current = bestNode.pos;
            } else {
                break; // 맵에 내 땅 빼고 아무것도 안 남았을 경우 종료
            }
        }
        return waypoints;
    }

    // MODE D: Trajectory (Reactive Snake Routing with Segment Avoidance/Preference)
    private static generateTrajectory(
        startPos: Vector2, 
        nodes: Record<string, NodeData>, 
        segments: LineSegment[], 
        playerId: PlayerId
    ): Vector2[] {
        const unownedNodes = this.getUnownedNodes(nodes);
        const opponentNodes = this.getOpponentNodes(nodes, playerId);

        const p2OwnedCount = Object.values(nodes).filter(n => n.owner === playerId).length;
        const depth = 9 + Math.floor(p2OwnedCount / 5) * 3;
        const maxWaypoints = Math.min(depth, 18);

        const waypoints: Vector2[] = [];
        let currentPos = startPos;
        const STEAL_THRESHOLD = 35; // 중립지 포기 한계 거리

        for (let i = 0; i < maxWaypoints; i++) {
            let bestUnownedIdx = -1;
            let minUnownedScore = Infinity;
            let bestUnownedDist = Infinity; // 거리 측정용 보조 변수

            // 1. 중립지 대상 가중치 탐색 (선분 회피/선호 로직 포함)
            for (let j = 0; j < unownedNodes.length; j++) {
                const node = unownedNodes[j];
                const d = Math.hypot(node.pos.x - currentPos.x, node.pos.y - currentPos.y);
                let score = d;

                segments.forEach(seg => {
                    if (!seg.active) return;
                    if (this.doLinesIntersect(currentPos, node.pos, seg.p1, seg.p2)) {
                        if (seg.owner === playerId) score -= 15;
                        else score += 30;
                    }
                });

                if (score < minUnownedScore) {
                    minUnownedScore = score;
                    bestUnownedIdx = j;
                    bestUnownedDist = d; // 가중치(Score)와 별개로 실제 물리적 거리를 기억해둠
                }
            }

            // 2. 가중치가 가장 좋은 중립지를 찾았으나, 실제 거리가 너무 멀거나 아예 중립지가 없다면 강탈 시도
            if (bestUnownedDist > STEAL_THRESHOLD || unownedNodes.length === 0) {
                let bestOppIdx = -1;
                let minOppScore = Infinity;

                for (let j = 0; j < opponentNodes.length; j++) {
                    const node = opponentNodes[j];
                    const d = Math.hypot(node.pos.x - currentPos.x, node.pos.y - currentPos.y);
                    let score = d;

                    segments.forEach(seg => {
                        if (!seg.active) return;
                        if (this.doLinesIntersect(currentPos, node.pos, seg.p1, seg.p2)) {
                            if (seg.owner === playerId) score -= 15;
                            else score += 30;
                        }
                    });

                    if (score < minOppScore) {
                        minOppScore = score;
                        bestOppIdx = j;
                    }
                }

                if (bestOppIdx !== -1) {
                    const bestNode = opponentNodes.splice(bestOppIdx, 1)[0];
                    waypoints.push(bestNode.pos);
                    currentPos = bestNode.pos;
                    continue;
                }
            }

            // 3. 정상적으로 중립지를 선택
            if (bestUnownedIdx !== -1) {
                const bestNode = unownedNodes.splice(bestUnownedIdx, 1)[0];
                waypoints.push(bestNode.pos);
                currentPos = bestNode.pos;
            } else {
                break;
            }
        }

        return waypoints;
    }
