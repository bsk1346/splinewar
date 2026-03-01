import React, { useEffect, useRef } from 'react';
import { useGameState, ALL_PLAYERS, type PlayerId } from '../store/useGameState';

export const MULTIPLIER = 12;
export const CANVAS_SIZE = 800;

export const PLAYER_COLORS: Record<PlayerId, string> = {
    P1: '#3498db',
    P2: '#e74c3c',
    P3: '#f1c40f',
    P4: '#2ecc71'
};

interface SharedCanvasProps {
    step: (dt: number) => void;
    refs: any; // Type from useGameLoop
    phase: 'SETTING_PATH' | 'MOVING' | 'FINISHED';

    isMultiplayer: boolean;
    myPlayerId: PlayerId | 'ALL';

    onAnimFinished?: () => void;
    renderTopRightHUD: (ctx: CanvasRenderingContext2D, timer: number) => void;
    onPointerDown?: (e: React.PointerEvent<HTMLCanvasElement>) => void;

    zoom?: number;
    onTouchStart?: (e: React.TouchEvent<HTMLDivElement>) => void;
    onTouchMove?: (e: React.TouchEvent<HTMLDivElement>) => void;

    children?: React.ReactNode;
}

export const SharedCanvas: React.FC<SharedCanvasProps> = ({
    step, refs, phase, isMultiplayer, myPlayerId, onAnimFinished, renderTopRightHUD, onPointerDown, zoom = 1, onTouchStart, onTouchMove, children
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const sentAnimFinishedRef = useRef(false);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let rafId: number;
        let lastTime = performance.now();

        const render = (time: number) => {
            const dt = (time - lastTime) / 1000;
            lastTime = time;

            // Step local physical engine
            step(dt);

            if (phase === 'MOVING' && refs.timer.current >= 5.0 && !sentAnimFinishedRef.current) {
                sentAnimFinishedRef.current = true;
                if (onAnimFinished) onAnimFinished();
            } else if (phase !== 'MOVING') {
                sentAnimFinishedRef.current = false;
            }

            const dpr = window.devicePixelRatio || 1;
            canvas.width = CANVAS_SIZE * dpr;
            canvas.height = CANVAS_SIZE * dpr;

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            ctx.save();
            ctx.scale(dpr, dpr);
            ctx.translate(CANVAS_SIZE / 2, CANVAS_SIZE / 2);
            ctx.scale(MULTIPLIER, MULTIPLIER);

            const state = useGameState.getState();

            let currentActivePlayers: PlayerId[] = [];
            if (isMultiplayer) {
                currentActivePlayers = state.multiplayerActiveIds;
            } else {
                currentActivePlayers.push('P1');
                if (state.activeAIs >= 1) currentActivePlayers.push('P2');
                if (state.activeAIs >= 2) currentActivePlayers.push('P3');
                if (state.activeAIs >= 3) currentActivePlayers.push('P4');
            }

            // Render Nodes
            Object.values(state.nodes).forEach(node => {
                ctx.beginPath();
                let renderAsBase = node.isBase;
                if (node.gridI === 0 && node.gridJ === 8 && !currentActivePlayers.includes('P1')) renderAsBase = false;
                else if (node.gridI === 8 && node.gridJ === 0 && !currentActivePlayers.includes('P2')) renderAsBase = false;
                else if (node.gridI === 0 && node.gridJ === 0 && !currentActivePlayers.includes('P3')) renderAsBase = false;
                else if (node.gridI === 8 && node.gridJ === 8 && !currentActivePlayers.includes('P4')) renderAsBase = false;

                ctx.arc(node.pos.x, node.pos.y, renderAsBase ? 0.6 : 0.2, 0, Math.PI * 2);

                if (renderAsBase) {
                    if (node.gridI === 0 && node.gridJ === 8) ctx.fillStyle = PLAYER_COLORS['P1'];
                    else if (node.gridI === 8 && node.gridJ === 0) ctx.fillStyle = PLAYER_COLORS['P2'];
                    else if (node.gridI === 0 && node.gridJ === 0) ctx.fillStyle = PLAYER_COLORS['P3'];
                    else if (node.gridI === 8 && node.gridJ === 8) ctx.fillStyle = PLAYER_COLORS['P4'];
                } else {
                    ctx.fillStyle = node.owner && currentActivePlayers.includes(node.owner) ? PLAYER_COLORS[node.owner] : '#555';
                }

                ctx.fill();

                if (node.capturedThisRound) {
                    ctx.strokeStyle = 'white';
                    ctx.lineWidth = 0.05;
                    ctx.stroke();
                }
            });

            // Render Segments
            state.segments.forEach(seg => {
                if (!seg.active || !currentActivePlayers.includes(seg.owner)) return;
                ctx.beginPath();
                ctx.moveTo(seg.p1.x, seg.p1.y);
                ctx.lineTo(seg.p2.x, seg.p2.y);

                const hex = PLAYER_COLORS[seg.owner];
                const r = parseInt(hex.substring(1, 3), 16);
                const g = parseInt(hex.substring(3, 5), 16);
                const b = parseInt(hex.substring(5, 7), 16);
                ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.8)`;
                ctx.lineWidth = 0.2;
                ctx.lineCap = 'round';
                ctx.stroke();
            });

            // Render Waypoints
            if (phase === 'SETTING_PATH' || phase === 'MOVING') {
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
                ctx.setLineDash([0.2, 0.2]);
                ctx.lineWidth = 0.1;

                if (phase === 'SETTING_PATH') {
                    if (myPlayerId === 'ALL') {
                        // Drawing P1 waypoints actively
                        const wpP1 = state.players['P1'].waypoints;
                        if (wpP1.length > 0) {
                            ctx.beginPath();
                            ctx.moveTo(state.players['P1'].startPos.x, state.players['P1'].startPos.y);
                            wpP1.forEach(wp => ctx.lineTo(wp.x, wp.y));
                            ctx.stroke();
                        }
                    } else {
                        // My own path
                        const myWp = state.players[myPlayerId].waypoints;
                        if (myWp.length > 0) {
                            ctx.beginPath();
                            ctx.moveTo(state.players[myPlayerId].startPos.x, state.players[myPlayerId].startPos.y);
                            myWp.forEach(wp => ctx.lineTo(wp.x, wp.y));
                            ctx.stroke();
                        }
                    }
                }

                ctx.setLineDash([]);
            }

            // Render Players
            ALL_PLAYERS.forEach(p => {
                if (!currentActivePlayers.includes(p)) return;

                const pos = refs.posRef.current[p];
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, 0.5, 0, Math.PI * 2);

                const hex = PLAYER_COLORS[p];
                const r = parseInt(hex.substring(1, 3), 16);
                const g = parseInt(hex.substring(3, 5), 16);
                const b = parseInt(hex.substring(5, 7), 16);
                ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.9)`;

                ctx.fill();
            });

            ctx.restore();
            ctx.font = '16px monospace';
            ctx.fillStyle = 'white';

            let textY = 20;
            ALL_PLAYERS.forEach((p) => {
                if (!currentActivePlayers.includes(p)) return;
                const spd = refs.spdRef[p];
                ctx.fillText(`${p} Combo: ${spd.buffCombo}/${spd.debuffCombo}`, 10, textY);
                textY += 20;
            });

            renderTopRightHUD(ctx, refs.timer.current);

            rafId = requestAnimationFrame(render);
        };

        if (phase !== 'FINISHED') {
            rafId = requestAnimationFrame(render);
        } else {
            render(performance.now());
        }

        return () => cancelAnimationFrame(rafId);
    }, [step, refs, phase, isMultiplayer, myPlayerId, onAnimFinished, renderTopRightHUD]);

    return (
        <div
            style={{
                position: 'relative',
                width: '100%',
                maxWidth: 'min(100vw, 65vh, 800px)',
                height: 'auto',
                aspectRatio: '1/1',
                overflow: 'hidden',
                touchAction: 'none'
            }}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
        >
            <canvas
                ref={canvasRef}
                style={{
                    width: '100%',
                    height: '100%',
                    background: '#0a0a0a',
                    border: '1px solid #333',
                    borderRadius: '8px',
                    cursor: phase === 'SETTING_PATH' ? 'crosshair' : 'default',
                    transform: `scale(${zoom})`,
                    transformOrigin: 'center center'
                }}
                onPointerDown={onPointerDown}
            />
            {children}
        </div>
    );
};
