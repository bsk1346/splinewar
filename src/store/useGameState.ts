import { create } from 'zustand';
import type { Vector2 } from '../utils/MathUtils';
import type { AIMode } from '../utils/AIManager';

export type PlayerId = 'P1' | 'P2' | 'P3' | 'P4';
export const ALL_PLAYERS: PlayerId[] = ['P1', 'P2', 'P3', 'P4'];

export type Phase = 'SETTING_PATH' | 'MOVING' | 'FINISHED';

export interface NodeData {
    id: string;
    gridI: number;
    gridJ: number;
    pos: Vector2;
    owner: PlayerId | null;
    capturedThisRound: boolean;
    isBase: boolean;
}

export interface LineSegment {
    id: string;
    p1: Vector2;
    p2: Vector2;
    owner: PlayerId;
    active: boolean;
    createdAtRound: number;
}

export interface PlayerState {
    id: PlayerId;
    waypoints: Vector2[];
    ready: boolean;
    startPos: Vector2;
    failedLastRound: boolean;
    nodesArrayThisRound: NodeData[];
    nodesLastRound: NodeData[];
}

interface GameState {
    round: number;
    phase: Phase;

    nodes: Record<string, NodeData>;
    segments: LineSegment[];

    players: Record<PlayerId, PlayerState>;

    // AI Settings
    activeAIs: number; // 1 to 3
    aiModes: Record<PlayerId, AIMode>; // Only P2, P3, P4 will be used

    multiplayerActiveIds: PlayerId[]; // If length > 0, overrides activeAIs logic

    initMap: () => void;
    setPhase: (phase: Phase) => void;
    setActiveAIs: (count: number) => void;
    setMultiplayerActiveIds: (ids: PlayerId[]) => void;
    setAIMode: (player: PlayerId, mode: AIMode) => void;
    setWaypoints: (player: PlayerId, waypoints: Vector2[]) => void;
    setReady: (player: PlayerId, ready: boolean) => void;
    captureNode: (nodeId: string, player: PlayerId) => void;
    deactivateSegment: (segmentId: string) => void;
    finishMovingPhase: (failedStates: Record<PlayerId, boolean>, endPositions: Record<PlayerId, Vector2>) => void;
    resetGame: () => void;
}

const createInitialPlayerState = (id: PlayerId, startPos: Vector2): PlayerState => ({
    id,
    waypoints: [],
    ready: false,
    startPos,
    failedLastRound: false,
    nodesArrayThisRound: [],
    nodesLastRound: []
});

export const useGameState = create<GameState>((set) => ({
    round: 1,
    phase: 'SETTING_PATH',
    nodes: {},
    segments: [],
    players: {
        P1: createInitialPlayerState('P1', { x: 0, y: 0 }),
        P2: createInitialPlayerState('P2', { x: 0, y: 0 }),
        P3: createInitialPlayerState('P3', { x: 0, y: 0 }),
        P4: createInitialPlayerState('P4', { x: 0, y: 0 }),
    },
    activeAIs: 3,
    aiModes: {
        P1: 'RANDOM', // Unused
        P2: 'TRAJECTORY',
        P3: 'AGGRESSIVE',
        P4: 'GREEDY'
    },
    multiplayerActiveIds: [],

    initMap: () => set((state) => {
        const newNodes: Record<string, NodeData> = {};
        // distance between grid points is 5 -> Grid spacing is 5/sqrt(2) = 2.5 * sqrt(2)
        // Actually, x = (i - j) * 5 * cos(45deg) = (i - j) * 5 / 1.414
        for (let i = 0; i < 9; i++) {
            for (let j = 0; j < 9; j++) {
                const offsetI = i - 4;
                const offsetJ = j - 4;
                const x = (offsetI - offsetJ) * 5 * Math.cos(Math.PI / 4);
                const y = (offsetI + offsetJ) * 5 * Math.sin(Math.PI / 4);
                const id = `${i},${j}`;

                const isP1Base = (i === 0 && j === 8) && true; // P1 always active
                const isP2Base = (i === 8 && j === 0) && (state.activeAIs >= 1 || state.multiplayerActiveIds.includes('P2'));
                const isP3Base = (i === 0 && j === 0) && (state.activeAIs >= 2 || state.multiplayerActiveIds.includes('P3'));
                const isP4Base = (i === 8 && j === 8) && (state.activeAIs >= 3 || state.multiplayerActiveIds.includes('P4'));
                const isBase = isP1Base || isP2Base || isP3Base || isP4Base;

                newNodes[id] = {
                    id,
                    gridI: i,
                    gridJ: j,
                    pos: { x, y },
                    owner: null,
                    capturedThisRound: false,
                    isBase
                };
            }
        }

        return {
            nodes: newNodes,
            players: {
                P1: createInitialPlayerState('P1', newNodes['0,8'].pos),
                P2: createInitialPlayerState('P2', newNodes['8,0'].pos),
                P3: createInitialPlayerState('P3', newNodes['0,0'].pos),
                P4: createInitialPlayerState('P4', newNodes['8,8'].pos),
            },
            round: 1,
            phase: 'SETTING_PATH',
            segments: [],
            activeAIs: state.activeAIs,
            aiModes: state.aiModes,
            multiplayerActiveIds: state.multiplayerActiveIds
        };
    }),

    setPhase: (phase) => set({ phase }),
    setActiveAIs: (count) => set({ activeAIs: count }),
    setMultiplayerActiveIds: (ids) => set({ multiplayerActiveIds: ids }),
    setAIMode: (player, mode) => set(state => ({
        aiModes: { ...state.aiModes, [player]: mode }
    })),

    setWaypoints: (player, waypoints) => set((state) => ({
        players: {
            ...state.players,
            [player]: {
                ...state.players[player],
                waypoints
            }
        }
    })),

    setReady: (player, ready) => set(state => {
        const newPlayers = {
            ...state.players,
            [player]: {
                ...state.players[player],
                ready
            }
        };

        const activePlayers: PlayerId[] = ['P1'];
        if (state.activeAIs >= 1) activePlayers.push('P2');
        if (state.activeAIs >= 2) activePlayers.push('P3');
        if (state.activeAIs >= 3) activePlayers.push('P4');

        const allReady = activePlayers.every(p => newPlayers[p].ready);

        // Prevent local phase shift in Multiplayer (handled by Server)
        if (state.multiplayerActiveIds.length > 0) {
            return { players: newPlayers };
        }

        if (allReady && state.phase === 'SETTING_PATH') {
            return { players: newPlayers, phase: 'MOVING' };
        }
        return { players: newPlayers };
    }),

    captureNode: (nodeId, player) => set(state => {
        const node = state.nodes[nodeId];
        if (!node || node.capturedThisRound || node.isBase) return state;

        // 방문(Visit) 처리용 - 상태 불변성 유지를 위한 얕은 복사
        const newNodes = { ...state.nodes };
        const newPlayers = { ...state.players };
        const currentPlayer = newPlayers[player];

        // 아군 노드인 경우 -> 소유권 변경이나 capturedThisRound는 설정하지 않음
        // 하지만 이번 턴의 경로(nodesArrayThisRound)에는 추가하여 나중에 선분이 생성되게 함
        if (node.owner === player) {
            newPlayers[player] = {
                ...currentPlayer,
                nodesArrayThisRound: [...currentPlayer.nodesArrayThisRound, node]
            };
            return {
                players: newPlayers
            };
        }

        // 적군 또는 중립 노드인 경우 -> 소유권 획득 및 방문 처리
        newNodes[nodeId] = { ...node, owner: player, capturedThisRound: true };
        newPlayers[player] = {
            ...currentPlayer,
            nodesArrayThisRound: [...currentPlayer.nodesArrayThisRound, newNodes[nodeId]]
        };

        return {
            nodes: newNodes,
            players: newPlayers
        };
    }),

    deactivateSegment: (segmentId) => set(state => ({
        segments: state.segments.map(seg =>
            seg.id === segmentId ? { ...seg, active: false } : seg
        )
    })),

    finishMovingPhase: (failedStates, endPositions) => set(state => {
        // 기존 선분 중 수명이 다한 것 제거 (2턴 유지: 현재 round와 createdAtRound 차이가 2 이상이면 제거)
        const keptSegments = state.segments.filter(seg => state.round - seg.createdAtRound < 2);

        const newSegments: LineSegment[] = [...keptSegments];

        // Generate segments for all players
        ALL_PLAYERS.forEach(player => {
            const nodes = state.players[player].nodesArrayThisRound;
            for (let k = 0; k < nodes.length - 1; k++) {
                newSegments.push({
                    id: `${player}_seg_${state.round}_${k}`,
                    p1: nodes[k].pos,
                    p2: nodes[k + 1].pos,
                    owner: player,
                    active: true,
                    createdAtRound: state.round // 수명 기록
                });
            }
        });

        // Reset capturedThisRound flag
        const resetNodes = { ...state.nodes };
        Object.keys(resetNodes).forEach(k => {
            resetNodes[k] = { ...resetNodes[k], capturedThisRound: false };
        });

        const newPlayers = { ...state.players };
        ALL_PLAYERS.forEach(player => {
            newPlayers[player] = {
                ...newPlayers[player],
                failedLastRound: failedStates[player],
                startPos: endPositions[player],
                waypoints: [],
                ready: false,
                nodesLastRound: newPlayers[player].nodesArrayThisRound,
                nodesArrayThisRound: []
            };
        });

        const nextRound = state.round + 1;
        const nextPhase = nextRound > 7 ? 'FINISHED' : 'SETTING_PATH';

        return {
            round: nextRound,
            phase: nextPhase,
            nodes: resetNodes,
            segments: newSegments,
            players: newPlayers
        };
    }),

    resetGame: () => set(state => {
        const newNodes: Record<string, NodeData> = {};
        for (let i = 0; i < 9; i++) {
            for (let j = 0; j < 9; j++) {
                const offsetI = i - 4;
                const offsetJ = j - 4;
                const x = (offsetI - offsetJ) * 5 * Math.cos(Math.PI / 4);
                const y = (offsetI + offsetJ) * 5 * Math.sin(Math.PI / 4);
                const id = `${i},${j}`;

                const isP1Base = (i === 0 && j === 8);
                const isP2Base = (i === 8 && j === 0) && (state.activeAIs >= 1 || state.multiplayerActiveIds.includes('P2'));
                const isP3Base = (i === 0 && j === 0) && (state.activeAIs >= 2 || state.multiplayerActiveIds.includes('P3'));
                const isP4Base = (i === 8 && j === 8) && (state.activeAIs >= 3 || state.multiplayerActiveIds.includes('P4'));
                const isBase = isP1Base || isP2Base || isP3Base || isP4Base;

                newNodes[id] = {
                    id, gridI: i, gridJ: j, pos: { x, y }, owner: null, capturedThisRound: false, isBase
                };
            }
        }

        return {
            nodes: newNodes,
            players: {
                P1: createInitialPlayerState('P1', newNodes['0,8'].pos),
                P2: createInitialPlayerState('P2', newNodes['8,0'].pos),
                P3: createInitialPlayerState('P3', newNodes['0,0'].pos),
                P4: createInitialPlayerState('P4', newNodes['8,8'].pos),
            },
            round: 1,
            phase: 'SETTING_PATH',
            segments: []
        };
    })
}));
