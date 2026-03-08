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

    // posRef holds client-side interpolated positions for smooth rendering during MOVING.
    // SharedCanvas reads posRef during MOVING phase (see SharedCanvas.tsx renderPos logic).
    const refsForCanvas = useRef({
        spdRef: { P1: null as any, P2: null as any, P3: null as any, P4: null as any },
        posRef: { current: { P1: { x: 0, y: 0 }, P2: { x: 0, y: 0 }, P3: { x: 0, y: 0 }, P4: { x: 0, y: 0 } } as Record<PlayerId, { x: number, y: number }> },
        distRef: { current: { P1: 0, P2: 0, P3: 0, P4: 0 } },
        trajRef: { current: { P1: null, P2: null, P3: null, P4: null } },
        timer: { current: 0 }
    });

    // Interpolation step: called every RAF frame by SharedCanvas.
    // Smoothly lerps client posRef toward the latest server currentPos.
    const interpStep = (dt: number) => {
        if (!isMovingRef.current) return;
        room.state.players.forEach((p: any) => {
            if (!p.connected) return;
            const pid = p.id as PlayerId;
            const target = { x: p.currentPos.x, y: p.currentPos.y };
            const curr = refsForCanvas.current.posRef.current[pid];
            if (!curr) return;
            // lerp factor: higher = faster catch-up (15 ≈ ~67ms to close gap at 60fps)
            const alpha = Math.min(1, dt * 15);
            curr.x += (target.x - curr.x) * alpha;
            curr.y += (target.y - curr.y) * alpha;
        });
    };

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

            const me = s.players.get(room.sessionId);
            if (me) {
                setIsReady(me.ready);
                if (myPlayerId !== me.id) setMyPlayerId(me.id as PlayerId);
            }

            // Phase transitions are handled by room.state.listen("phase") below.
            // Only sync round and active IDs here.
            let activeIds: PlayerId[] = [];
            s.players.forEach(p => {
                if (p.connected) activeIds.push(p.id as PlayerId);
            });
            useGameState.getState().setMultiplayerActiveIds(activeIds);
        });

        // Dedicated high-frequency listeners for timer and phase
        room.state.listen("timer", (currentTimer: number) => {
            // Only show the countdown timer during path-setting; hide it during movement
            if (room.state.phase === 'SETTING_PATH') {
                setTimerDisplay(currentTimer);
            }
        });

        room.state.listen("phase", (currentPhase: string) => {
            if (currentPhase === 'MOVING') {
                setPhase('MOVING');
                isMovingRef.current = true;
                useGameState.getState().setPhase('MOVING');
                // Seed interpolated positions from server's current values
                room.state.players.forEach((p: any) => {
                    if (!p.connected) return;
                    const pid = p.id as PlayerId;
                    refsForCanvas.current.posRef.current[pid] = { x: p.currentPos.x, y: p.currentPos.y };
                    const mappedWP = Array.from(p.waypoints as any[]).filter((w: any) => w).map((w: any) => ({ x: w.x, y: w.y }));
                    useGameState.getState().setWaypoints(pid, mappedWP);
                });
            } else if (currentPhase === 'SETTING_PATH') {
                setTimerDisplay(room.state.timer);
                isMovingRef.current = false;
                setPhase('SETTING_PATH'); // triggers useEffect below to clear waypoints
                setZoom(1);
                useGameState.getState().setPhase('SETTING_PATH');
            } else if (currentPhase === 'FINISHED') {
                setPhase('FINISHED');
                isMovingRef.current = false;
            }
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

    // Clear local waypoints at the start of every new SETTING_PATH round.
    // Uses React state deps to always get the correct myPlayerId — avoids stale closure.
    useEffect(() => {
        if (phase === 'SETTING_PATH') {
            useGameState.getState().setWaypoints(myPlayerId, []);
            setIsReady(false);
        }
    }, [phase, myPlayerId]);


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
        let minDist = 6.0; // Snapping radius: must be >= max node distance (~5.0 for diagonals)

        Object.values(state.nodes).forEach(node => {
            const d = Math.hypot(node.pos.x - logicalX, node.pos.y - logicalY);
            if (d < minDist) {
                minDist = d;
                nearestNode = node;
            }
        });

        const myWp = state.players[myPlayerId].waypoints;

        let startPos = { x: 0, y: 0 };
        room.state.players.forEach((p, sId) => {
            if (sId === room.sessionId) {
                startPos = { x: p.startPos.x, y: p.startPos.y };
            }
        });

        const lastNodePos = myWp.length > 0 ? myWp[myWp.length - 1] : startPos;

        if (nearestNode) {
            // No adjacency restriction - any node can be selected freely (same as singleplayer)
            const d = Math.hypot((nearestNode as NodeData).pos.x - lastNodePos.x, (nearestNode as NodeData).pos.y - lastNodePos.y);

            if (d > 0.1) { // Only prevent selecting the exact same node twice
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
                step={interpStep} // Lerp posRef toward server currentPos each frame for smooth motion
                refs={refsForCanvas.current}
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
