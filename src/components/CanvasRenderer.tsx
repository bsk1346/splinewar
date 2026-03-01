import React, { useEffect } from 'react';
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

    useEffect(() => {
        useGameState.getState().initMap();
    }, []);

    const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const state = useGameState.getState();
        if (state.phase !== 'SETTING_PATH') return;

        const rect = e.currentTarget.getBoundingClientRect();
        const xScreen = e.clientX - rect.left;
        const yScreen = e.clientY - rect.top;

        const logicalX = (xScreen - CANVAS_SIZE / 2) / MULTIPLIER;
        const logicalY = (yScreen - CANVAS_SIZE / 2) / MULTIPLIER;

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

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: '#111', minHeight: '100vh', color: 'white', fontFamily: 'sans-serif', paddingBottom: '40px' }}>
            <h2 style={{ margin: '10px 0' }}>Round: {round} / 7 | Phase: {phase}</h2>

            <div style={{ display: 'flex', gap: '20px', marginBottom: '10px', background: '#222', padding: '10px 20px', borderRadius: '8px', alignItems: 'center' }}>
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

                {activeAiList.map(ai => (
                    <div key={ai} style={{ display: 'flex', alignItems: 'center', gap: '8px', borderLeft: '1px solid #555', paddingLeft: '15px' }}>
                        <span style={{ color: PLAYER_COLORS[ai], fontWeight: 'bold' }}>{ai}:</span>
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
            />

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
        </div>
    );
};
