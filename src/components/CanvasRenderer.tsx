import React, { useEffect, useState } from 'react';
import { useGameState, type NodeData, type PlayerId } from '../store/useGameState';
import { useGameLoop } from '../hooks/useGameLoop';
import { AIManager, type AIMode } from '../utils/AIManager';
import { SharedCanvas, CANVAS_SIZE, MULTIPLIER, PLAYER_COLORS } from './SharedCanvas';

export const CanvasRenderer: React.FC = () => {
    const { step, refs, startMoving } = useGameLoop();

    // Tie to Zustand to re-render UI
    const round = useGameState(s => s.round);
    const phase = useGameState(s => s.phase);

    // AI Settings
    const activeAIs = useGameState(s => s.activeAIs);
    const aiModes = useGameState(s => s.aiModes);

    const [isConfigOpen, setIsConfigOpen] = useState(false);

    useEffect(() => {
        useGameState.getState().initMap();
    }, []);

    const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const state = useGameState.getState();
        if (state.phase !== 'SETTING_PATH') return;

        // Logical coordinates have an origin at the CENTER of the canvas
        // And they are scaled down by MULTIPLIER
        const xCanvasPixel = (e as any).canvasPixelX ?? e.nativeEvent.offsetX;
        const yCanvasPixel = (e as any).canvasPixelY ?? e.nativeEvent.offsetY;

        const logicalX = (xCanvasPixel - CANVAS_SIZE / 2) / MULTIPLIER;
        const logicalY = (yCanvasPixel - CANVAS_SIZE / 2) / MULTIPLIER;

        // Snapping: Find nearest node
        let nearestNode: NodeData | null = null;
        let minDist = 3.0; // Snapping max distance increased for mobile touch ease (36px roughly)

        Object.values(state.nodes).forEach(node => {
            const d = Math.hypot(node.pos.x - logicalX, node.pos.y - logicalY);
            if (d < minDist) {
                minDist = d;
                nearestNode = node;
            }
        });

        const targetPos = (nearestNode as NodeData | null)?.pos || { x: logicalX, y: logicalY };

        // For simplicity of prototype, clicking adds waypoint to P1
        state.setWaypoints('P1', [...state.players['P1'].waypoints, targetPos]);
    };

    // UI Helpers
    const handleSetAIMode = (p: PlayerId, m: AIMode) => {
        useGameState.getState().setAIMode(p, m);
    }

    const activeAiList: PlayerId[] = [];
    if (activeAIs >= 1) activeAiList.push('P2');
    if (activeAIs >= 2) activeAiList.push('P3');
    if (activeAIs >= 3) activeAiList.push('P4');

    const computeWinner = () => {
        const counts: Record<string, number> = {};
        let winner = 'None';
        let max = -1;
        Object.values(useGameState.getState().nodes).forEach(n => {
            if (n.owner) {
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
            <h2 style={{ margin: '10px 0' }}>Round: {round} / 7 | Phase: {phase}</h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '10px', background: '#222', borderRadius: '8px', overflow: 'hidden', maxWidth: '90vw' }}>
                <button
                    onClick={() => setIsConfigOpen(!isConfigOpen)}
                    style={{ padding: '10px', background: '#333', color: 'white', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 'bold' }}
                >
                    <span>⚙️ AI Settings ({activeAIs} Opponents)</span>
                    <span>{isConfigOpen ? '▲' : '▼'}</span>
                </button>

                {isConfigOpen && (
                    <div style={{ padding: '15px 20px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <span style={{ fontWeight: 'bold' }}>Number of AI Opponents:</span>
                            <select
                                value={activeAIs}
                                onChange={(e) => useGameState.getState().setActiveAIs(parseInt(e.target.value))}
                                style={{ padding: '5px 10px', background: '#444', color: 'white', border: 'none', borderRadius: '4px' }}
                                disabled={phase !== 'SETTING_PATH'}
                            >
                                <option value={1}>1 (P2)</option>
                                <option value={2}>2 (P2, P3)</option>
                                <option value={3}>3 (P2, P3, P4)</option>
                            </select>
                        </div>

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                            {activeAiList.map(ai => (
                                <div key={ai} style={{ display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid #555', padding: '5px 10px', borderRadius: '4px' }}>
                                    <span style={{ color: PLAYER_COLORS[ai], fontWeight: 'bold' }}>{ai} AI:</span>
                                    <select
                                        value={aiModes[ai]}
                                        onChange={(e) => handleSetAIMode(ai, e.target.value as AIMode)}
                                        style={{ padding: '5px', background: '#333', color: 'white', border: '1px solid #555', borderRadius: '4px', fontSize: '13px' }}
                                        disabled={phase !== 'SETTING_PATH'}
                                    >
                                        <option value="RANDOM">Random</option>
                                        <option value="GREEDY">Greedy</option>
                                        <option value="AGGRESSIVE">Aggressive</option>
                                        <option value="TRAJECTORY">Trajectory</option>
                                    </select>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <SharedCanvas
                step={step}
                refs={refs}
                phase={phase}
                isMultiplayer={false}
                myPlayerId="ALL"
                onPointerDown={handlePointerDown}
                renderTopRightHUD={(ctx, timer) => {
                    const timerDisp = phase === 'SETTING_PATH' ? (30 - timer).toFixed(1) : timer.toFixed(1);
                    ctx.fillText(`Timer: ${timerDisp}`, CANVAS_SIZE - 120, 20);
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
                                useGameState.getState().resetGame();
                            }}
                            style={{ padding: '15px 30px', marginTop: '40px', background: '#3498db', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '20px', fontWeight: 'bold' }}
                        >
                            다시 플레이하기 (Play Again)
                        </button>
                    </div>
                )}
            </SharedCanvas>

            {phase !== 'FINISHED' && (
                <div style={{ marginTop: '20px', display: 'flex', gap: '15px' }}>
                    <button
                        onClick={() => {
                            const state = useGameState.getState();

                            // Generate AI waypoints for active AIs
                            activeAiList.forEach(aiPlayer => {
                                const aiPts = AIManager.generateWaypoints(
                                    state.aiModes[aiPlayer],
                                    state.players[aiPlayer].startPos,
                                    state.nodes,
                                    state.segments,
                                    [], aiPlayer
                                );
                                state.setWaypoints(aiPlayer, aiPts);
                            });

                            state.setReady('P1', true);
                            activeAiList.forEach(ai => state.setReady(ai, true));

                            startMoving();
                        }}
                        style={{ padding: '10px 20px', background: '#3498db', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold' }}
                        disabled={phase !== 'SETTING_PATH'}
                    >
                        P1 Ready (Start Move)
                    </button>
                </div>
            )}
        </div>
    );
};
