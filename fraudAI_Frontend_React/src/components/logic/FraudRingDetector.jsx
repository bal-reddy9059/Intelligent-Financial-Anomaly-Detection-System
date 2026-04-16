import { useEffect, useState, useRef, useCallback } from 'react';
import { collection, getDocs, query, where, limit, doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from './firebase';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Network, AlertTriangle, Shield, ZoomIn, ZoomOut, RefreshCw,
  Info, Users, TrendingUp, Eye, ChevronRight, Crosshair, Layers,
} from 'lucide-react';

/* ── Union-Find for cluster detection ──────────────────── */
class UnionFind {
  constructor() { this.parent = {}; this.rank = {}; }
  find(x) {
    if (this.parent[x] === undefined) { this.parent[x] = x; this.rank[x] = 0; }
    if (this.parent[x] !== x) this.parent[x] = this.find(this.parent[x]);
    return this.parent[x];
  }
  union(x, y) {
    const px = this.find(x), py = this.find(y);
    if (px === py) return;
    if ((this.rank[px] || 0) < (this.rank[py] || 0)) { this.parent[px] = py; }
    else if ((this.rank[px] || 0) > (this.rank[py] || 0)) { this.parent[py] = px; }
    else { this.parent[py] = px; this.rank[px] = (this.rank[px] || 0) + 1; }
  }
  clusters() {
    const map = {};
    Object.keys(this.parent).forEach((k) => {
      const root = this.find(k);
      if (!map[root]) map[root] = [];
      map[root].push(k);
    });
    return Object.values(map);
  }
}

/* ── helpers ─────────────────────────────────────────────── */
function getAmount(tx) {
  const v = parseFloat(tx.amount ?? tx.Amount ?? 0);
  return isNaN(v) ? 0 : v;
}
const fmt = (n) => `₹${Number(n ?? 0).toLocaleString('en-IN')}`;

function buildGraph(txs, selfUpiId) {
  const nodes = {};    // id → { id, label, risk, totalAmount, txCount, isSelf }
  const edges = [];    // { source, target, amount, isFraud }
  const uf    = new UnionFind();

  const addNode = (id, label, verdict) => {
    if (!nodes[id]) {
      const riskScore = verdict === 'HIGH_RISK' ? 90 : verdict === 'MEDIUM_RISK' ? 55 : 10;
      nodes[id] = { id, label: label || id, risk: riskScore, totalAmount: 0, txCount: 0, isSelf: id === selfUpiId };
    }
  };

  txs.forEach((tx) => {
    const src = tx.senderUPI   || tx.sender   || 'you';
    const dst = tx.receiverUPI || tx.receiver || 'unknown';
    const verdict = tx.fraudVerdict || tx.fraud_verdict || 'SAFE';
    const amount  = getAmount(tx);
    const isFraud = verdict === 'HIGH_RISK' || verdict === 'MEDIUM_RISK';

    addNode(src, tx.senderName   || src,  verdict);
    addNode(dst, tx.receiverName || dst, isFraud ? verdict : 'SAFE');

    nodes[src].totalAmount += amount;
    nodes[dst].totalAmount += amount;
    nodes[src].txCount++;
    nodes[dst].txCount++;

    if (isFraud) {
      nodes[src].risk = Math.max(nodes[src].risk, 60);
      nodes[dst].risk = Math.max(nodes[dst].risk, 75);
    }

    edges.push({ source: src, target: dst, amount, isFraud, verdict });
    uf.union(src, dst);
  });

  // Propagate risk through clusters (if any node in cluster is HIGH_RISK, raise others)
  const clusters = uf.clusters();
  clusters.forEach((cluster) => {
    const maxRisk = Math.max(...cluster.map((id) => nodes[id]?.risk || 0));
    if (maxRisk >= 75) {
      cluster.forEach((id) => {
        if (nodes[id] && nodes[id].risk < 40) nodes[id].risk = Math.max(nodes[id].risk, 35);
      });
    }
  });

  // Assign cluster indices
  const clusterRoots = {};
  clusters.forEach((cluster, i) => cluster.forEach((id) => { clusterRoots[id] = i; }));
  Object.keys(nodes).forEach((id) => { nodes[id].cluster = clusterRoots[id] ?? 0; });

  const nodeList = Object.values(nodes);
  const fraudRings = clusters.filter((c) =>
    c.some((id) => nodes[id]?.risk >= 75) && c.length >= 2
  );

  return { nodes: nodeList, edges, clusters, fraudRings };
}

/* ── Force-directed layout (simple spring) ──────────────── */
function useForceLayout(nodes, edges, width, height) {
  const [positions, setPositions] = useState({});
  const frameRef = useRef(null);

  useEffect(() => {
    if (!nodes.length || !width || !height) return;
    cancelAnimationFrame(frameRef.current);

    // Initialize positions in a circle
    const pos = {};
    nodes.forEach((n, i) => {
      const angle = (i / nodes.length) * 2 * Math.PI;
      const r = Math.min(width, height) * 0.3;
      pos[n.id] = {
        x: width / 2 + r * Math.cos(angle) + (Math.random() - 0.5) * 40,
        y: height / 2 + r * Math.sin(angle) + (Math.random() - 0.5) * 40,
        vx: 0, vy: 0,
      };
    });

    const edgeMap = {};
    edges.forEach((e) => {
      if (!edgeMap[e.source]) edgeMap[e.source] = [];
      if (!edgeMap[e.target]) edgeMap[e.target] = [];
      edgeMap[e.source].push(e.target);
      edgeMap[e.target].push(e.source);
    });

    let tick = 0;
    const TICKS = 120;
    const simulate = () => {
      if (tick++ >= TICKS) { setPositions({ ...pos }); return; }

      const alpha = 1 - tick / TICKS;

      // Repulsion
      const nodeIds = Object.keys(pos);
      for (let i = 0; i < nodeIds.length; i++) {
        for (let j = i + 1; j < nodeIds.length; j++) {
          const a = pos[nodeIds[i]], b = pos[nodeIds[j]];
          const dx = b.x - a.x, dy = b.y - a.y;
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = (5000 / (d * d)) * alpha;
          const fx = (dx / d) * force, fy = (dy / d) * force;
          a.vx -= fx; a.vy -= fy;
          b.vx += fx; b.vy += fy;
        }
      }

      // Attraction along edges
      edges.forEach((e) => {
        const a = pos[e.source], b = pos[e.target];
        if (!a || !b) return;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const ideal = 120;
        const force = ((d - ideal) / d) * 0.05 * alpha;
        const fx = dx * force, fy = dy * force;
        a.vx += fx; a.vy += fy;
        b.vx -= fx; b.vy -= fy;
      });

      // Center gravity
      nodeIds.forEach((id) => {
        const p = pos[id];
        p.vx += (width / 2 - p.x) * 0.005 * alpha;
        p.vy += (height / 2 - p.y) * 0.005 * alpha;
        p.x += p.vx * 0.8; p.y += p.vy * 0.8;
        p.vx *= 0.7; p.vy *= 0.7;
        // Clamp
        p.x = Math.max(40, Math.min(width - 40, p.x));
        p.y = Math.max(40, Math.min(height - 40, p.y));
      });

      if (tick % 10 === 0) setPositions({ ...pos });
      frameRef.current = requestAnimationFrame(simulate);
    };
    frameRef.current = requestAnimationFrame(simulate);
    return () => cancelAnimationFrame(frameRef.current);
  }, [nodes.length, edges.length, width, height]);

  return positions;
}

/* ── Node colour ─────────────────────────────────────────── */
function nodeColor(risk, isSelf) {
  if (isSelf) return '#6366f1';
  if (risk >= 75) return '#ef4444';
  if (risk >= 50) return '#f59e0b';
  return '#10b981';
}

/* ── SVG Graph Canvas ────────────────────────────────────── */
function GraphCanvas({ nodes, edges, positions, onNodeClick, selectedNode, scale, offset }) {
  return (
    <g transform={`translate(${offset.x},${offset.y}) scale(${scale})`}>
      {/* Edges */}
      {edges.map((e, i) => {
        const s = positions[e.source], t = positions[e.target];
        if (!s || !t) return null;
        return (
          <line key={i}
            x1={s.x} y1={s.y} x2={t.x} y2={t.y}
            stroke={e.isFraud ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.1)'}
            strokeWidth={e.isFraud ? 2 : 1}
            strokeDasharray={e.isFraud ? '6 3' : undefined}
          />
        );
      })}

      {/* Nodes */}
      {nodes.map((n) => {
        const p = positions[n.id];
        if (!p) return null;
        const color = nodeColor(n.risk, n.isSelf);
        const isSelected = selectedNode?.id === n.id;
        const r = n.isSelf ? 18 : n.risk >= 75 ? 14 : 10;
        return (
          <g key={n.id} style={{ cursor: 'pointer' }} onClick={() => onNodeClick(n)}>
            {/* Glow */}
            <circle cx={p.x} cy={p.y} r={r + 8} fill={color} opacity={isSelected ? 0.25 : 0.1} />
            {/* Node circle */}
            <circle cx={p.x} cy={p.y} r={r}
              fill={color + '30'} stroke={color}
              strokeWidth={isSelected ? 3 : n.isSelf ? 2.5 : 1.5}
            />
            {/* Self dot */}
            {n.isSelf && <circle cx={p.x} cy={p.y} r={5} fill={color} />}
            {/* Risk > 75 exclamation */}
            {n.risk >= 75 && !n.isSelf && (
              <text x={p.x} y={p.y + 4} textAnchor="middle" fill={color} fontSize="10" fontWeight="900">!</text>
            )}
            {/* Label */}
            <text x={p.x} y={p.y + r + 12} textAnchor="middle"
              fill="rgba(255,255,255,0.6)" fontSize="9"
              style={{ pointerEvents: 'none', userSelect: 'none' }}>
              {n.label.length > 14 ? n.label.slice(0, 12) + '…' : n.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════ */
export default function FraudRingDetector() {
  const [txs, setTxs]               = useState([]);
  const [graph, setGraph]           = useState(null);
  const [selfUpi, setSelfUpi]       = useState('');
  const [loading, setLoading]       = useState(true);
  const [selectedNode, setSelectedNode] = useState(null);
  const [scale, setScale]           = useState(1);
  const [offset, setOffset]         = useState({ x: 0, y: 0 });
  const [dragging, setDragging]     = useState(false);
  const [dragStart, setDragStart]   = useState(null);
  const svgRef = useRef(null);
  const W = 820, H = 520;

  /* ── fetch ───────────────────────────────────────────── */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) { setLoading(false); return; }
      try {
        let upiId = null;
        const userDoc = await getDoc(doc(db, 'users', u.uid));
        if (userDoc.exists()) upiId = userDoc.data().upiId || null;
        setSelfUpi(upiId || u.uid);

        const snap1 = await getDocs(query(collection(db, 'transactions'), where('userId', '==', u.uid), limit(300)));
        let all = snap1.docs.map((d) => ({ id: d.id, ...d.data() }));
        if (upiId) {
          const snap2 = await getDocs(query(collection(db, 'transactions'), where('senderUPI', '==', upiId), limit(300)));
          const ids = new Set(all.map((t) => t.id));
          snap2.docs.forEach((d) => { if (!ids.has(d.id)) all.push({ id: d.id, ...d.data() }); });
        }
        setTxs(all);
        setGraph(buildGraph(all, upiId || u.uid));
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    });
    return unsub;
  }, []);

  const positions = useForceLayout(graph?.nodes || [], graph?.edges || [], W, H);

  const rebuild = () => {
    setGraph(null);
    setTimeout(() => setGraph(buildGraph(txs, selfUpi)), 50);
    setSelectedNode(null);
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  /* ── drag to pan ─────────────────────────────────────── */
  const onMouseDown = (e) => { setDragging(true); setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y }); };
  const onMouseMove = (e) => { if (dragging && dragStart) setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y }); };
  const onMouseUp   = () => { setDragging(false); setDragStart(null); };

  /* ── stats ───────────────────────────────────────────── */
  const highRiskNodes  = graph?.nodes.filter((n) => n.risk >= 75).length || 0;
  const fraudRingCount = graph?.fraudRings.length || 0;
  const totalNodes     = graph?.nodes.length || 0;
  const totalEdges     = graph?.edges.length || 0;

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <motion.div className="text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <motion.div className="w-16 h-16 mx-auto mb-4 rounded-full border-4 border-red-500/30 border-t-red-500"
          animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} />
        <p className="text-white/50 text-sm">Building fraud network graph…</p>
      </motion.div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6 space-y-6">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center">
            <Network className="h-5 w-5 text-red-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Fraud Ring Detector</h1>
            <p className="text-white/40 text-xs">Graph-based fraud cluster analysis • Union-Find algorithm</p>
          </div>
        </div>
        <button onClick={rebuild}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-sm">
          <RefreshCw className="h-3.5 w-3.5" />
          Rebuild Graph
        </button>
      </motion.div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Network Nodes',    value: totalNodes,     icon: Users,      color: 'text-blue-400' },
          { label: 'Transactions',     value: totalEdges,     icon: TrendingUp, color: 'text-violet-400' },
          { label: 'High-Risk Nodes',  value: highRiskNodes,  icon: AlertTriangle, color: 'text-red-400' },
          { label: 'Fraud Rings',      value: fraudRingCount, icon: Crosshair,  color: fraudRingCount > 0 ? 'text-red-400' : 'text-emerald-400' },
        ].map(({ label, value, icon: Icon, color }) => (
          <motion.div key={label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl bg-white/[0.04] border border-white/[0.07] p-4 flex items-center gap-3">
            <Icon className={`h-5 w-5 ${color}`} />
            <div>
              <p className={`text-xl font-black ${color}`}>{value}</p>
              <p className="text-white/40 text-xs">{label}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Fraud Ring Alert */}
      <AnimatePresence>
        {fraudRingCount > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="rounded-2xl bg-red-500/10 border border-red-500/30 p-4 flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="h-5 w-5 text-red-400" />
            </div>
            <div>
              <p className="font-bold text-red-300 mb-1">
                {fraudRingCount} Fraud Ring{fraudRingCount > 1 ? 's' : ''} Detected
              </p>
              <p className="text-white/50 text-sm">
                Our Union-Find algorithm identified {fraudRingCount} cluster{fraudRingCount > 1 ? 's' : ''} of interconnected accounts with suspicious transaction patterns.
                Nodes highlighted in <span className="text-red-400 font-semibold">red</span> are directly involved. Review them immediately.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main content: graph + details */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">

        {/* SVG Graph */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
          className="rounded-2xl bg-white/[0.04] border border-white/[0.07] overflow-hidden relative">

          {/* Toolbar */}
          <div className="absolute top-3 right-3 z-10 flex gap-1.5">
            <button onClick={() => setScale((s) => Math.min(s + 0.2, 3))}
              className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setScale((s) => Math.max(s - 0.2, 0.3))}
              className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => { setScale(1); setOffset({ x: 0, y: 0 }); }}
              className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
              <Layers className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Legend */}
          <div className="absolute bottom-3 left-3 z-10 flex items-center gap-4 bg-gray-950/80 backdrop-blur rounded-lg px-3 py-2 text-xs">
            {[
              { color: '#6366f1', label: 'You' },
              { color: '#10b981', label: 'Safe' },
              { color: '#f59e0b', label: 'Medium Risk' },
              { color: '#ef4444', label: 'High Risk' },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-white/40">{label}</span>
              </div>
            ))}
          </div>

          {totalNodes === 0 ? (
            <div className="flex items-center justify-center" style={{ height: H }}>
              <div className="text-center text-white/30">
                <Network className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No transaction network data found.</p>
                <p className="text-xs mt-1">Send or receive money to build your network graph.</p>
              </div>
            </div>
          ) : (
            <svg ref={svgRef} width="100%" height={H}
              style={{ cursor: dragging ? 'grabbing' : 'grab' }}
              onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
              onWheel={(e) => setScale((s) => Math.max(0.3, Math.min(3, s - e.deltaY * 0.001)))}
            >
              <defs>
                <radialGradient id="bgGrad" cx="50%" cy="50%">
                  <stop offset="0%" stopColor="#1e1b4b" stopOpacity="0.5" />
                  <stop offset="100%" stopColor="#030712" stopOpacity="1" />
                </radialGradient>
              </defs>
              <rect width="100%" height={H} fill="url(#bgGrad)" />
              {graph && Object.keys(positions).length > 0 && (
                <GraphCanvas nodes={graph.nodes} edges={graph.edges}
                  positions={positions} onNodeClick={setSelectedNode}
                  selectedNode={selectedNode} scale={scale} offset={offset} />
              )}
            </svg>
          )}
        </motion.div>

        {/* Node detail panel */}
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}
          className="rounded-2xl bg-white/[0.04] border border-white/[0.07] p-5 flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <Eye className="h-4 w-4 text-indigo-400" />
            <h2 className="font-semibold text-sm">Node Inspector</h2>
          </div>

          {!selectedNode ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center text-white/25 py-12">
              <Network className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Click any node in the graph to inspect it</p>
            </div>
          ) : (
            <div className="space-y-4 flex-1">
              {/* Risk badge */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-white truncate max-w-[180px]">{selectedNode.label}</p>
                  <p className="text-white/30 text-xs truncate">{selectedNode.id}</p>
                </div>
                <div className="px-2.5 py-1 rounded-full text-xs font-bold"
                  style={{
                    color: nodeColor(selectedNode.risk, selectedNode.isSelf),
                    background: nodeColor(selectedNode.risk, selectedNode.isSelf) + '25',
                  }}>
                  {selectedNode.isSelf ? 'YOU' : selectedNode.risk >= 75 ? 'HIGH RISK' : selectedNode.risk >= 50 ? 'MEDIUM' : 'SAFE'}
                </div>
              </div>

              {/* Risk score bar */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-white/40">Risk Score</span>
                  <span className="font-bold" style={{ color: nodeColor(selectedNode.risk, selectedNode.isSelf) }}>
                    {selectedNode.risk}/100
                  </span>
                </div>
                <div className="w-full bg-white/5 rounded-full h-2">
                  <motion.div className="h-full rounded-full"
                    style={{ backgroundColor: nodeColor(selectedNode.risk, selectedNode.isSelf) }}
                    initial={{ width: 0 }} animate={{ width: `${selectedNode.risk}%` }}
                    transition={{ duration: 0.6 }} />
                </div>
              </div>

              {/* Stats */}
              {[
                { label: 'Total Transacted', value: fmt(selectedNode.totalAmount) },
                { label: 'Transaction Count', value: selectedNode.txCount },
                { label: 'Network Cluster', value: `#${selectedNode.cluster + 1}` },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between items-center py-2 border-b border-white/[0.06]">
                  <span className="text-white/40 text-sm">{label}</span>
                  <span className="font-semibold text-sm">{value}</span>
                </div>
              ))}

              {/* Connected edges */}
              <div>
                <p className="text-white/40 text-xs mb-2">Connected Transactions</p>
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {graph.edges
                    .filter((e) => e.source === selectedNode.id || e.target === selectedNode.id)
                    .slice(0, 10)
                    .map((e, i) => {
                      const other = e.source === selectedNode.id ? e.target : e.source;
                      return (
                        <button key={i} onClick={() => setSelectedNode(graph.nodes.find((n) => n.id === other))}
                          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.07] transition-colors text-xs">
                          <span className="text-white/60 truncate max-w-[140px]">{other}</span>
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold">{fmt(e.amount)}</span>
                            {e.isFraud && <span className="text-red-400 text-[9px] font-bold">FRAUD</span>}
                            <ChevronRight className="h-3 w-3 text-white/20" />
                          </div>
                        </button>
                      );
                    })}
                </div>
              </div>

              {selectedNode.risk >= 75 && (
                <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-300">
                  <AlertTriangle className="h-3.5 w-3.5 inline-block mr-1.5" />
                  This node is connected to fraudulent transactions. Avoid sending money to this account.
                </div>
              )}
            </div>
          )}
        </motion.div>
      </div>

      {/* Fraud rings table */}
      {graph?.fraudRings.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
          className="rounded-2xl bg-white/[0.04] border border-white/[0.07] p-5">
          <div className="flex items-center gap-2 mb-4">
            <Crosshair className="h-4 w-4 text-red-400" />
            <h2 className="font-semibold">Detected Fraud Rings</h2>
            <span className="text-xs text-white/30 ml-auto">Union-Find cluster analysis</span>
          </div>
          <div className="space-y-3">
            {graph.fraudRings.map((ring, i) => (
              <div key={i} className="rounded-xl bg-red-500/5 border border-red-500/15 p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-red-300 font-semibold text-sm">Ring #{i + 1}</p>
                  <span className="text-xs text-white/30">{ring.length} nodes</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {ring.map((id) => {
                    const n = graph.nodes.find((nd) => nd.id === id);
                    return (
                      <button key={id} onClick={() => setSelectedNode(n)}
                        className="px-2 py-0.5 rounded-full text-[10px] font-semibold transition-colors"
                        style={{
                          background: nodeColor(n?.risk || 0, n?.isSelf) + '20',
                          color: nodeColor(n?.risk || 0, n?.isSelf),
                          border: `1px solid ${nodeColor(n?.risk || 0, n?.isSelf)}40`,
                        }}>
                        {(n?.label || id).slice(0, 16)}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}
