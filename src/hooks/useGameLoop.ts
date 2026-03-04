import { useRef, useCallback } from 'react';
import { useGameState, ALL_PLAYERS, type PlayerId } from '../store/useGameState';
import type { Vector2 } from '../utils/MathUtils';
import { SplineTrajectory } from '../utils/MathUtils';
import { PhysicsUtils } from '../utils/PhysicsUtils';
import { SpeedManager } from '../utils/SpeedManager';

import { AIManager } from '../utils/AIManager';

export const useGameLoop = () => {
    // 4 Players refs
    const spdRef = useRef<Record<PlayerId, SpeedManager>>({
        P1: new SpeedManager(),
        P2: new SpeedManager(),
        P3: new SpeedManager(),
        P4: new SpeedManager()
    });

    const trajRef = useRef<Record<PlayerId, SplineTrajectory | null>>({
        P1: null, P2: null, P3: null, P4: null
    });

    const posRef = useRef<Record<PlayerId, Vector2>>({
        P1: { x: 0, y: 0 }, P2: { x: 0, y: 0 }, P3: { x: 0, y: 0 }, P4: { x: 0, y: 0 }
    });

    const distRef = useRef<Record<PlayerId, number>>({
        P1: 0, P2: 0, P3: 0, P4: 0
    });

    const timer = useRef(30.0);

    const refs = {
        spdRef: spdRef.current,
        posRef, distRef, trajRef, timer
    };

    const startMoving = useCallback(() => {
        const state = useGameState.getState();

        const activePlayers: PlayerId[] = state.multiplayerActiveIds.length > 0
            ? state.multiplayerActiveIds
            : ['P1', ...(['P2', 'P3', 'P4'].slice(0, state.activeAIs))] as PlayerId[];

        activePlayers.forEach(p => {
            const playerState = state.players[p];
            const rawWps = playerState.waypoints || [];
            const wps = [playerState.startPos, ...rawWps];
            if (wps.length < 2) wps.push(playerState.startPos); 

            trajRef.current[p] = new SplineTrajectory(wps);
            posRef.current[p] = { ...playerState.startPos };
            distRef.current[p] = 0;
        });

        ALL_PLAYERS.forEach(p => {
            if (!activePlayers.includes(p)) {
                trajRef.current[p] = null;
            }
        });

        timer.current = 0; 
    }, []);

    const handleCollisions = (testActivePlayers: string[]) => {
        const state = useGameState.getState();
        const captureRadius = 0.5;

        // [수정됨] 트리거 함수(SpeedManager)에 넘겨줄 아군 점령지 갯수(n)를 계산하는 헬퍼 함수
        const getOwnedNodes = (playerId: PlayerId) => 
            Object.values(state.nodes).filter(n => n.owner === playerId).length;

        // Node Capture
        Object.values(state.nodes).forEach(node => {
            if (node.capturedThisRound || node.isBase) return;

            const hitters: PlayerId[] = [];
            testActivePlayers.forEach(p => {
                const pos = posRef.current[p as PlayerId];
                const d = Math.hypot(pos.x - node.pos.x, pos.y - node.pos.y);
                if (d <= captureRadius) hitters.push(p as PlayerId);
            });

            if (hitters.length > 1) {
                // Simultaneous hit -> ignore capture
            } else if (hitters.length === 1) {
                const p = hitters[0];
                const oldOwner = node.owner;

                state.captureNode(node.id, p);

                // [수정됨] n값을 인자로 넘겨주도록 수정
                const currentNodes = getOwnedNodes(p);
                if (oldOwner !== null && oldOwner !== p) {
                    spdRef.current[p].triggerStealBuff(currentNodes);
                } else if (oldOwner !== p) {
                    spdRef.current[p].triggerBuff(currentNodes);
                }
            }
        });

        // Segment Collision
        state.segments.forEach(seg => {
            if (!seg.active) return;

            const hitters: PlayerId[] = [];
            testActivePlayers.forEach(p => {
                const pos = posRef.current[p as PlayerId];
                const hit = PhysicsUtils.isCircleCollidingWithLine(pos, captureRadius, seg.p1, seg.p2);
                if (hit) hitters.push(p as PlayerId);
            });

            if (hitters.length > 1) {
                // Simultaneous collision -> ignore
            } else if (hitters.length === 1) {
                const p = hitters[0];
                const currentNodes = getOwnedNodes(p); // [수정됨] n값 계산

                if (seg.owner === p) {
                    // [수정됨] 아군 선분 전용 버프 트리거로 교체 및 n값 전달
                    spdRef.current[p].triggerAllyLineBuff(currentNodes);
                } else {
                    // [수정됨] n값 전달
                    spdRef.current[p].triggerDebuff(currentNodes);
                }
                state.deactivateSegment(seg.id);
            }
        });
    };

    const step = useCallback((dt: number) => {
        const state = useGameState.getState();
        const phase = state.phase;

        if (phase === 'SETTING_PATH') {
            timer.current -= dt;
            if (timer.current <= 0) {
                const activePlayers: PlayerId[] = state.multiplayerActiveIds.length > 0
                    ? state.multiplayerActiveIds
                    : ['P1', ...(['P2', 'P3', 'P4'].slice(0, state.activeAIs))] as PlayerId[];

                activePlayers.forEach(p => {
                    if (!state.players[p].ready) {
                        if (p !== 'P1') {
                            const aiPts = AIManager.generateWaypoints(
                                state.aiModes[p],
                                state.players[p].startPos,
                                state.nodes,
                                state.segments,
                                [], p
                            );
                            state.setWaypoints(p, aiPts);
                        }
                        state.setReady(p, true);
                    }
                });
                startMoving(); 
            } else {
                ALL_PLAYERS.forEach(p => {
                    posRef.current[p] = { ...state.players[p].startPos };
                });
            }
            return;
        }

        if (phase === 'MOVING') {
            timer.current += dt;

            const activePlayers: PlayerId[] = state.multiplayerActiveIds.length > 0
                ? state.multiplayerActiveIds
                : ['P1', ...(['P2', 'P3', 'P4'].slice(0, state.activeAIs))] as PlayerId[];

            const captureRadius = 0.5;

            const currentSpeeds: Record<PlayerId, number> = {} as any;
            activePlayers.forEach(p => {
                spdRef.current[p].updateCombos(dt);
                const ownedNodes = Object.values(state.nodes).filter(n => n.owner === p).length;
                
                // [수정됨] m값: 나머지 모든 적군의 땅 갯수를 합산하도록 수정 (기획 의도 반영)
                let totalOpponentNodes = 0;
                activePlayers.forEach(opp => {
                    if (opp !== p) {
                        totalOpponentNodes += Object.values(state.nodes).filter(n => n.owner === opp).length;
                    }
                });

                // [수정됨] calculateCurrentSpeed 호출 시 n, m, r(state.round) 모두 전달
                currentSpeeds[p] = spdRef.current[p].calculateCurrentSpeed(
                    ownedNodes,
                    totalOpponentNodes,
                    state.round,
                    state.players[p].failedLastRound && timer.current <= 1.0
                );
            });

            const maxSpeed = Math.max(...activePlayers.map(p => currentSpeeds[p]));
            const maxDistThisFrame = maxSpeed * dt;

            const STEP_SIZE = captureRadius * 0.8;
            const steps = Math.max(1, Math.ceil(maxDistThisFrame / STEP_SIZE));
            const stepDt = dt / steps;

            for (let s = 0; s < steps; s++) {
                activePlayers.forEach(p => {
                    distRef.current[p] += currentSpeeds[p] * stepDt;
                    if (trajRef.current[p]) {
                        posRef.current[p] = trajRef.current[p]!.getPointAtDistance(distRef.current[p]);
                    }
                });

                handleCollisions(activePlayers as string[]);
            }

            if (timer.current >= 5.0) {
                const failedStates = {} as Record<PlayerId, boolean>;
                const endPos = {} as Record<PlayerId, Vector2>;

                ALL_PLAYERS.forEach(p => {
                    if (activePlayers.includes(p)) {
                        failedStates[p] = trajRef.current[p]
                            ? distRef.current[p] < trajRef.current[p]!.totalLength
                            : false;
                        endPos[p] = { ...posRef.current[p] };
                    } else {
                        failedStates[p] = false;
                        endPos[p] = { ...state.players[p].startPos };
                    }
                    spdRef.current[p].resetPhase();
                });

                state.finishMovingPhase(failedStates, endPos);
                timer.current = 30.0;
            }
        }
    }, []);

    return { step, refs, startMoving };
};
