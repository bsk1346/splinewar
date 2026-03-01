import React, { useEffect, useRef, useState } from 'react';
import * as Colyseus from 'colyseus.js';
import { GameState } from '../schema/GameState';
import { useGameState, type NodeData, type PlayerId } from '../store/useGameState';
import { useGameLoop } from '../hooks/useGameLoop';
import { AIManager } from '../utils/AIManager';
import { SharedCanvas, CANVAS_SIZE, MULTIPLIER, PLAYER_COLORS } from './SharedCanvas';

interface Props {
    room: Colyseus.Room<GameState>;
}

export const MultiplayerRenderer: React.FC<Props> = ({ room }) => {
    const { step, refs, startMoving } = useGameLoop();

    const [round, setRound] = useState(room.state.round);
    const [phase, setPhase] = useState<'SETTING_PATH' | 'MOVING' | 'FINISHED'>('SETTING_PATH');
    const [myPlayerId, setMyPlayerId] = useState<PlayerId>('P1');
    const [timerDisplay, setTimerDisplay] = useState(30);
    const [isReady, setIsReady] = useState(false);
    const [zoom, setZoom] = useState(1);
    const touchPinchRef = useRef<{ initialDist: number, initialZoom: number } | null>(null);

    const isMovingRef = useRef(false);

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
            if (me) setIsReady(me.ready);

            if (s.phase === 'MOVING' && !isMovingRef.current) {
                isMovingRef.current = true;
                setPhase('MOVING');

                useGameState.getState().setPhase('MOVING');

                s.players.forEach(p => {
                    if (!p.connected) return;
                    const mappedWP = Array.from(p.waypoints).filter(w => w).map(w => ({ x: w!.x, y: w!.y }));
                    useGameState.getState().setWaypoints(p.id as PlayerId, mappedWP);
                });

                startMoving();
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
    }, [room, startMoving]);

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

        const rect = e.currentTarget.getBoundingClientRect();

        const scaleX = CANVAS_SIZE / rect.width;
        const scaleY = CANVAS_SIZE / rect.height;

        const xScreen = (e.clientX - rect.left) * scaleX;
        const yScreen = (e.clientY - rect.top) * scaleY;

        const logicalX = (xScreen - CANVAS_SIZE / 2) / MULTIPLIER;
        const logicalY = (yScreen - CANVAS_SIZE / 2) / MULTIPLIER;

        let nearestNode: NodeData | null = null;
        let minDist = 3.0; // Increased snapping max distance for mobile touch ease

        Object.values(state.nodes).forEach(node => {
            const d = Math.hypot(node.pos.x - logicalX, node.pos.y - logicalY);
            if (d < minDist) {
                minDist = d;
                nearestNode = node;
            }
        });

        const targetPos = (nearestNode as NodeData | null)?.pos || { x: logicalX, y: logicalY };
        state.setWaypoints(myPlayerId, [...state.players[myPlayerId].waypoints, targetPos]);
    };

    const handleClearPath = () => {
        useGameState.getState().setWaypoints(myPlayerId, []);
    };

    const handleSubmitPath = () => {
        const myWp = useGameState.getState().players[myPlayerId].waypoints;
        room.send("submitWaypoints", { waypoints: myWp });
    };

    const computeWinner = () => {
        const state = useGameState.getState();
        const counts: Record<string, number> = {};
        let winner = 'None';
        let max = -1;
        Object.values(state.nodes).forEach(n => {
            if (n.owner && state.multiplayerActiveIds.includes(n.owner)) {
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
                step={step}
                refs={refs}
                phase={phase}
                isMultiplayer={true}
                myPlayerId={myPlayerId}
                onPointerDown={!isReady ? handlePointerDown : undefined}
                onAnimFinished={() => {
                    room.send("animFinished");
                }}
                renderTopRightHUD={(ctx, timer) => {
                    ctx.fillText(`Server Timer: ${timerDisplay.toFixed(1)}`, CANVAS_SIZE - 200, 20);
                    if (isMovingRef.current) ctx.fillText(`Mov: ${timer.toFixed(1)}/5.0`, CANVAS_SIZE - 200, 40);
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
                                room.leave();
                                window.location.reload();
                            }}
                            style={{ padding: '15px 30px', marginTop: '40px', background: '#e74c3c', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '20px', fontWeight: 'bold' }}
                        >
                            로비로 돌아가기 (Return to Lobby)
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
