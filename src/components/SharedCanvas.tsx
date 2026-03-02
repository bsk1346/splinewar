import React, { useEffect, useRef } from 'react';
import { useGameState, ALL_PLAYERS, type PlayerId, type NodeData, type LineSegment } from '../store/useGameState';
import type { GameState } from '../schema/GameState';

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
    roomState?: GameState;
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
    step, refs, phase, isMultiplayer, roomState, myPlayerId, onAnimFinished, renderTopRightHUD, onPointerDown, zoom = 1, onTouchStart, onTouchMove, children
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

            const zustandState = useGameState.getState();

            // Unified Abstraction for rendering data
            let renderNodes: NodeData[] = [];
            let renderSegments: LineSegment[] = [];
            let renderPos: Record<PlayerId, { x: number, y: number }> = { P1: { x: 0, y: 0 }, P2: { x: 0, y: 0 }, P3: { x: 0, y: 0 }, P4: { x: 0, y: 0 } };
            let renderActivePlayers: PlayerId[] = [];
            let renderWpP1: { x: number, y: number }[] = [];
            let renderMyWp: { x: number, y: number }[] = [];
            let renderStartPos: Record<PlayerId, { x: number, y: number }> = { P1: { x: 0, y: 0 }, P2: { x: 0, y: 0 }, P3: { x: 0, y: 0 }, P4: { x: 0, y: 0 } };

            if (isMultiplayer && roomState) {
                // Parse Server State
                roomState.players.forEach(p => {
                    if (p.connected) {
                        const pid = p.id as PlayerId;
                        renderActivePlayers.push(pid);
                        renderPos[pid] = { x: p.currentPos.x, y: p.currentPos.y };
                        renderStartPos[pid] = { x: p.startPos.x, y: p.startPos.y };
                        if (pid === myPlayerId) {
                            renderMyWp = Array.from(p.waypoints)
                                .filter(w => w !== undefined && w !== null)
                                .map((w: any) => ({ x: w.x, y: w.y }));
                        }
                    }
                });

                roomState.nodes.forEach(n => {
                    renderNodes.push({
                        id: n.id, gridI: n.gridI, gridJ: n.gridJ,
                        pos: { x: n.pos.x, y: n.pos.y }, owner: n.owner as PlayerId | null,
                        capturedThisRound: n.capturedThisRound, isBase: n.isBase
                    });
                });

                roomState.segments.forEach(s => {
                    if (s.active) {
                        renderSegments.push({
                            id: s.id, p1: { x: s.p1.x, y: s.p1.y }, p2: { x: s.p2.x, y: s.p2.y },
                            owner: s.owner as PlayerId, active: s.active, createdAtRound: s.createdAtRound
                        });
                    }
                });
            } else {
                // Parse Zustand State
                renderActivePlayers.push('P1');
                if (zustandState.activeAIs >= 1) renderActivePlayers.push('P2');
                if (zustandState.activeAIs >= 2) renderActivePlayers.push('P3');
                if (zustandState.activeAIs >= 3) renderActivePlayers.push('P4');

                renderNodes = Object.values(zustandState.nodes);
                renderSegments = zustandState.segments;

                ALL_PLAYERS.forEach(p => {
                    renderPos[p] = refs.posRef.current[p];
                    renderStartPos[p] = zustandState.players[p].startPos;
                });

                renderWpP1 = zustandState.players['P1'].waypoints;
                if (myPlayerId !== 'ALL') renderMyWp = zustandState.players[myPlayerId].waypoints;
            }

            // Render Nodes
            renderNodes.forEach(node => {
                ctx.beginPath();
                let renderAsBase = node.isBase;
                if (node.gridI === 0 && node.gridJ === 8 && !renderActivePlayers.includes('P1')) renderAsBase = false;
                else if (node.gridI === 8 && node.gridJ === 0 && !renderActivePlayers.includes('P2')) renderAsBase = false;
                else if (node.gridI === 0 && node.gridJ === 0 && !renderActivePlayers.includes('P3')) renderAsBase = false;
                else if (node.gridI === 8 && node.gridJ === 8 && !renderActivePlayers.includes('P4')) renderAsBase = false;

                ctx.arc(node.pos.x, node.pos.y, renderAsBase ? 0.6 : 0.2, 0, Math.PI * 2);

                if (renderAsBase) {
                    if (node.gridI === 0 && node.gridJ === 8) ctx.fillStyle = PLAYER_COLORS['P1'];
                    else if (node.gridI === 8 && node.gridJ === 0) ctx.fillStyle = PLAYER_COLORS['P2'];
                    else if (node.gridI === 0 && node.gridJ === 0) ctx.fillStyle = PLAYER_COLORS['P3'];
                    else if (node.gridI === 8 && node.gridJ === 8) ctx.fillStyle = PLAYER_COLORS['P4'];
                } else {
                    const ownerStr = node.owner as string;
                    ctx.fillStyle = ownerStr && ownerStr !== "" && renderActivePlayers.includes(ownerStr as PlayerId) ? PLAYER_COLORS[ownerStr as PlayerId] : '#555';
                }

                ctx.fill();

                if (node.capturedThisRound) {
                    ctx.strokeStyle = 'white';
                    ctx.lineWidth = 0.05;
                    ctx.stroke();
                }

                // Initial Highlight Ping (Round 1, first 3 seconds)
                if (renderAsBase && zustandState.round === 1 && phase === 'SETTING_PATH' && (30 - refs.timer.current) <= 3) {
                    const elapsed = 30 - refs.timer.current; // 0 to 3
                    const pingRadius = 0.6 + (elapsed % 1.5) * 1.5;
                    const pingAlpha = Math.max(0, 1 - (elapsed % 1.5) / 1.5);

                    let pingColor = '255, 255, 255';
                    if (node.gridI === 0 && node.gridJ === 8 && (myPlayerId === 'P1' || myPlayerId === 'ALL')) pingColor = '52, 152, 219'; // P1 color
                    else if (node.gridI === 8 && node.gridJ === 0 && (myPlayerId === 'P2' || myPlayerId === 'ALL')) pingColor = '231, 76, 60';
                    else if (node.gridI === 0 && node.gridJ === 0 && (myPlayerId === 'P3' || myPlayerId === 'ALL')) pingColor = '241, 196, 15';
                    else if (node.gridI === 8 && node.gridJ === 8 && (myPlayerId === 'P4' || myPlayerId === 'ALL')) pingColor = '46, 204, 113';

                    // Only draw ping for the player themselves (or all in local)
                    if (
                        (node.gridI === 0 && node.gridJ === 8 && (myPlayerId === 'P1' || myPlayerId === 'ALL')) ||
                        (node.gridI === 8 && node.gridJ === 0 && (myPlayerId === 'P2' || myPlayerId === 'ALL')) ||
                        (node.gridI === 0 && node.gridJ === 0 && (myPlayerId === 'P3' || myPlayerId === 'ALL')) ||
                        (node.gridI === 8 && node.gridJ === 8 && (myPlayerId === 'P4' || myPlayerId === 'ALL'))
                    ) {
                        ctx.beginPath();
                        ctx.arc(node.pos.x, node.pos.y, pingRadius, 0, Math.PI * 2);
                        ctx.strokeStyle = `rgba(${pingColor}, ${pingAlpha})`;
                        ctx.lineWidth = 0.1;
                        ctx.stroke();
                    }
                }
            });

            // Render Segments
            renderSegments.forEach(seg => {
                if (!seg.active || !renderActivePlayers.includes(seg.owner)) return;
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
                        if (renderWpP1.length > 0) {
                            ctx.beginPath();
                            ctx.moveTo(renderStartPos['P1'].x, renderStartPos['P1'].y);
                            renderWpP1.forEach(wp => ctx.lineTo(wp.x, wp.y));
                            ctx.stroke();
                        }
                    } else {
                        if (renderMyWp.length > 0) {
                            ctx.beginPath();
                            ctx.moveTo(renderStartPos[myPlayerId].x, renderStartPos[myPlayerId].y);
                            renderMyWp.forEach(wp => ctx.lineTo(wp.x, wp.y));
                            ctx.stroke();
                        }
                    }
                }

                ctx.setLineDash([]);
            }

            // Render Players
            ALL_PLAYERS.forEach(p => {
                if (!renderActivePlayers.includes(p)) return;

                const pos = renderPos[p];
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

            if (!isMultiplayer) {
                let textY = 20;
                ALL_PLAYERS.forEach((p) => {
                    if (!renderActivePlayers.includes(p)) return;
                    const spd = refs.spdRef[p];
                    ctx.fillText(`${p} Combo: ${spd.buffCombo}/${spd.debuffCombo}`, 10, textY);
                    textY += 20;
                });
            }

            renderTopRightHUD(ctx, refs.timer.current);

            rafId = requestAnimationFrame(render);
        };

        if (phase !== 'FINISHED') {
            rafId = requestAnimationFrame(render);
        } else {
            render(performance.now());
        }

        return () => cancelAnimationFrame(rafId);
    }, [step, refs, phase, isMultiplayer, roomState, myPlayerId, onAnimFinished, renderTopRightHUD]);

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
                onPointerDown={(e) => {
                    const canvas = canvasRef.current;
                    if (!canvas) return;
                    const rect = canvas.getBoundingClientRect();
                    // Using getBoundingClientRect directly handles CSS transform scale automatically!
                    const scaleX = CANVAS_SIZE / rect.width;
                    const scaleY = CANVAS_SIZE / rect.height;

                    const clientX = e.clientX;
                    const clientY = e.clientY;

                    // Compute logical pixel offsets relative to the Canvas' native 800x800 resolution
                    const canvasPixelX = (clientX - rect.left) * scaleX;
                    const canvasPixelY = (clientY - rect.top) * scaleY;

                    // We modify the synthetic event to pass these pre-calculated canvas pixels
                    // Or we just pass the raw clientX/Y and let parent handle it if we want.
                    // To keep things simple, let's inject a custom property or fire a modified event:

                    if (onPointerDown) {
                        (e as any).canvasPixelX = canvasPixelX;
                        (e as any).canvasPixelY = canvasPixelY;
                        onPointerDown(e);
                    }
                }}
            />
            {children}
        </div>
    );
};
