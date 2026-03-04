import React, { useEffect, useRef, useState } from 'react';
import * as Colyseus from 'colyseus.js';
import { GameState } from '../schema/GameState';
import { useGameState, type NodeData, type PlayerId } from '../store/useGameState';
import { AIManager } from '../utils/AIManager';
import { SharedCanvas, CANVAS_SIZE, MULTIPLIER, PLAYER_COLORS } from './SharedCanvas';

interface Props {
    room: Colyseus.Room<GameState>;
}

export const MultiplayerRenderer: React.FC<Props> = ({ room }) => {
    const [round, setRound] = useState(room.state.round);
    const [phase, setPhase] = useState<'SETTING_PATH' | 'MOVING' | 'FINISHED'>('SETTING_PATH');
    const [myPlayerId, setMyPlayerId] = useState<PlayerId>('P1');
    const [timerDisplay, setTimerDisplay] = useState(30);
    const [isReady, setIsReady] = useState(false);
    const [zoom, setZoom] = useState(1);
    const touchPinchRef = useRef<{ initialDist: number, initialZoom: number } | null>(null);

    const isMovingRef = useRef(false);

    // Using dummy refs for SharedCanvas since it expects the useGameLoop format
    // In multiplayer, SharedCanvas will fetch real-time state from `room.state` directly.
    const dummyRefs = useRef({
        spdRef: { P1: null, P2: null, P3: null, P4: null },
        posRef: { current: { P1: { x: 0, y: 0 }, P2: { x: 0, y: 0 }, P3: { x: 0, y: 0 }, P4: { x: 0, y: 0 } } },
        distRef: { current: { P1: 0, P2: 0, P3: 0, P4: 0 } },
        trajRef: { current: { P1: null, P2: null, P3: null, P4: null } },
        timer: { current: 0 }
    });

    useEffect(() => {
        const state = useGameState.getState();
        state.initMap();

        let initialPlayers: PlayerId[] = [];
        room.state.players.forEach((p, sessionId) => {
            if (sessionId === room.sessionId) setMyPlayerId(p.id as PlayerId);
            if (p.connected) initialPlayers.push(p.id as PlayerId);
        });
        state.setMultiplayerActiveIds(initialPlayers);

        room.onStateChange((s) => {
            setRound(s.round);
            setTimerDisplay(s.phase === 'SETTING_PATH' ? s.timer : 0);

            const me = s.players.get(room.sessionId);
            if (me) {
                setIsReady(me.ready);
                if (myPlayerId !== me.id) setMyPlayerId(me.id as PlayerId);
            }

            if (s.phase === 'MOVING' && !isMovingRef.current) {
                isMovingRef.current = true;
                setPhase('MOVING');

                useGameState.getState().setPhase('MOVING');

                s.players.forEach(p => {
                    if (!p.connected) return;
                    const mappedWP = Array.from(p.waypoints).filter(w => w).map(w => ({ x: w!.x, y: w!.y }));
                    useGameState.getState().setWaypoints(p.id as PlayerId, mappedWP);
                });
                // Note: local startMoving is NO LONGER CALLED. Server handles it.
            }

            if (s.phase === 'SETTING_PATH' && isMovingRef.current) {
                isMovingRef.current = false;
                setPhase('SETTING_PATH');
                setZoom(1);

                const amIHost = s.hostSessionId === room.sessionId;

                if (amIHost) {
                    const activeArr = Array.from(s.players.values());
                    activeArr.forEach(p => {
                        if (!p.connected && !p.ready) {
                            const modes: ('GREEDY' | 'AGGRESSIVE' | 'TRAJECTORY')[] = ['GREEDY', 'AGGRESSIVE', 'TRAJECTORY'];
                            const randomMode = modes[Math.floor(Math.random() * modes.length)];

                            const aiPts = AIManager.generateWaypoints(
                                randomMode,
                                { x: p.startPos.x, y: p.startPos.y },
                                useGameState.getState().nodes,
                                useGameState.getState().segments,
                                [], p.id as PlayerId
                            );

                            room.send("submitAgentWaypoints", { targetId: p.id, waypoints: aiPts });
                        }
                    });
                }
            }

            if (s.phase === 'FINISHED') {
                setPhase('FINISHED');
                isMovingRef.current = false;
            }

            let activeIds: PlayerId[] = [];
            s.players.forEach(p => {
                if (p.connected) activeIds.push(p.id as PlayerId);
            });
            useGameState.getState().setMultiplayerActiveIds(activeIds);
        });

        const handleUnload = () => {
            if (room) {
                try { room.leave(); } catch (e) { }
            }
        };

        window.addEventListener('beforeunload', handleUnload);
        window.addEventListener('popstate', handleUnload);

        return () => {
            window.removeEventListener('beforeunload', handleUnload);
            window.removeEventListener('popstate', handleUnload);
        }
    }, [room]);

    // Auto-Submit Logic
    useEffect(() => {
        if (phase === 'SETTING_PATH' && timerDisplay === 1 && !isReady) {
            // Timer is about to expire, force submit what we have
            const myWp = useGameState.getState().players[myPlayerId].waypoints;
            room.send("submitWaypoints", { waypoints: myWp });
            setIsReady(true);
        }
    }, [timerDisplay, phase, isReady, myPlayerId, room]);

    const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (phase !== 'SETTING_PATH') return;
        const state = useGameState.getState();

        // Use the native event offset that was passed out by SharedCanvas
        // These are already mapped from Screen -> Canvas Pixel coordinates by SharedCanvas
        const xCanvasPixel = (e as any).canvasPixelX ?? e.nativeEvent.offsetX;
        const yCanvasPixel = (e as any).canvasPixelY ?? e.nativeEvent.offsetY;

        // Logical coordinates have an origin at the CENTER of the canvas
        // And they are scaled down by MULTIPLIER
        const logicalX = (xCanvasPixel - CANVAS_SIZE / 2) / MULTIPLIER;
        const logicalY = (yCanvasPixel - CANVAS_SIZE / 2) / MULTIPLIER;

        let nearestNode: NodeData | null = null;
        let minDist = 6.0; // Increased snapping max distance to allow diagonals (grid diag dist is 5.0)

        Object.values(state.nodes).forEach(node => {
            const d = Math.hypot(node.pos.x - logicalX, node.pos.y - logicalY);
            if (d < minDist) {
                minDist = d;
                nearestNode = node;
            }
        });

        // Ensure the player state exists locally before destructuring
        const myPlayerState = state.players[myPlayerId];
        if (!myPlayerState) return;

        const myWp = myPlayerState.waypoints || [];
        const startPos = myPlayerState.startPos || { x: 0, y: 0 };
        const lastNodePos = myWp.length > 0 ? myWp[myWp.length - 1] : startPos;

        if (nearestNode) {
            // Distance Check - Path Building (Hexagonal Adjacent Check)
            const d = Math.hypot((nearestNode as NodeData).pos.x - lastNodePos.x, (nearestNode as NodeData).pos.y - lastNodePos.y);

            // 노드 간의 물리적 거리는 5.0입니다. 따라서 인접 노드 선택을 위해 6.0 이하로 설정합니다.
            // (동일한 노드를 중복으로 찍는 것을 방지하기 위해 d > 0.1 조건 추가)
            if (d > 0.1 && d <= 6.0) {
                state.setWaypoints(myPlayerId, [...myWp, (nearestNode as NodeData).pos]);
            }
        }
    };

    const handleClearPath = () => {
        useGameState.getState().setWaypoints(myPlayerId, []);
    };

    const handleSubmitPath = () => {
        const myWp = useGameState.getState().players[myPlayerId].waypoints;
        room.send("submitWaypoints", { waypoints: myWp });
    };

    const computeWinner = () => {
        const counts: Record<string, number> = {};
        let winner = 'None';
        let max = -1;
        room.state.nodes.forEach(n => {
            if (n.owner && n.owner !== "") {
                counts[n.owner] = (counts[n.owner] || 0) + 1;
            }
        });
        Object.keys(counts).forEach(pid => {
            if (counts[pid] > max) {
                max = counts[pid];
                winner = pid;
            }
        });
        return { winner, max, counts };
    };

    const gameOverData = phase === 'FINISHED' ? computeWinner() : null;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: '#111', minHeight: '100vh', color: 'white', fontFamily: 'sans-serif', paddingBottom: '40px' }}>
            <h2 style={{ margin: '10px 0', color: PLAYER_COLORS[myPlayerId] }}>Online Match: {room.roomId} | You are {myPlayerId}</h2>
            <h3 style={{ margin: '5px 0' }}>Round: {round > 7 ? 'Game Over' : `${round}/7`} | Phase: {phase} | {phase === 'FINISHED' ? '🏁 Game Over' : (isReady ? '🟢 Ready (Waiting)' : '🔴 Selecting Path')}</h3>

            <SharedCanvas
                step={() => { }} // Dummy step, unused in multiplayer
                refs={dummyRefs.current}
                phase={phase}
                isMultiplayer={true}
                roomState={room.state} // Pass the room state for rendering
                myPlayerId={myPlayerId}
                onPointerDown={!isReady ? handlePointerDown : undefined}
                renderTopRightHUD={(ctx, _localTimer) => {
                    ctx.fillText(`Server Timer: ${timerDisplay.toFixed(1)}`, CANVAS_SIZE - 200, 20);
                }}
                zoom={zoom}
                onTouchStart={(e) => {
                    if (e.touches.length === 2) {
                        const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
                        touchPinchRef.current = { initialDist: dist, initialZoom: zoom };
                    }
                }}
                onTouchMove={(e) => {
                    if (e.touches.length === 2 && touchPinchRef.current) {
                        if (touchPinchRef.current.initialDist < 5) return; // Prevent Division By Zero NaN
                        const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
                        const scale = dist / touchPinchRef.current.initialDist;
                        let newZoom = touchPinchRef.current.initialZoom * scale;
                        newZoom = Math.max(1, Math.min(newZoom, 4));
                        setZoom(newZoom);
                    }
                }}
            >
                {phase === 'FINISHED' && gameOverData && (
                    <div style={{ position: 'absolute', top: '0', left: '0', width: '100%', height: '100%', background: 'rgba(0,0,0,0.8)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRadius: '8px', zIndex: 10 }}>
                        <h1 style={{ color: '#f1c40f', fontSize: '48px', margin: '0 0 20px 0' }}>🏆 Winner: {gameOverData.winner}</h1>
                        <h2 style={{ color: 'white', margin: '10px 0' }}>Nodes Captured: {gameOverData.max}</h2>

                        <div style={{ background: '#222', padding: '20px', borderRadius: '8px', marginTop: '20px', minWidth: '200px' }}>
                            {Object.entries(gameOverData.counts).sort((a, b) => b[1] - a[1]).map(([p, count]) => (
                                <div key={p} style={{ fontSize: '18px', margin: '10px 0', color: PLAYER_COLORS[p as PlayerId] }}>
                                    {p} : {count} Nodes
                                </div>
                            ))}
                        </div>

                        <button
                            onClick={() => {
                                room.send("playAgain");
                            }}
                            style={{ padding: '15px 30px', marginTop: '40px', background: '#e74c3c', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '20px', fontWeight: 'bold' }}
                        >
                            방 대기실로 돌아가기 (Play Again)
                        </button>
                    </div>
                )}
            </SharedCanvas>

            {phase !== 'FINISHED' && (
                <div style={{ marginTop: '20px', display: 'flex', gap: '15px' }}>
                    <button
                        onClick={handleClearPath}
                        style={{ padding: '10px 20px', background: '#555', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold' }}
                        disabled={phase !== 'SETTING_PATH' || isReady}
                    >
                        Clear Path
                    </button>
                    <button
                        onClick={handleSubmitPath}
                        style={{ padding: '10px 20px', background: isReady ? '#27ae60' : '#3498db', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold' }}
                        disabled={phase !== 'SETTING_PATH'}
                    >
                        {isReady ? "Ready to Go!" : "Submit & Ready"}
                    </button>
                </div>
            )}
        </div>
    );
};
