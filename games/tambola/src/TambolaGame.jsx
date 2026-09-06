import { useState, useEffect, useRef, useCallback } from "react";

// ═══════════════════════════════════════════════════════════
//  GAME LOGIC
// ═══════════════════════════════════════════════════════════

function generateTicket() {
  while (true) {
    const rowCols = Array.from({ length: 3 }, () =>
      Array.from({ length: 9 }, (_, i) => i)
        .sort(() => Math.random() - 0.5)
        .slice(0, 5)
        .sort((a, b) => a - b)
    );
    const colCounts = Array(9).fill(0);
    rowCols.forEach((cols) => cols.forEach((c) => colCounts[c]++));
    if (colCounts.some((c) => c < 1 || c > 3)) continue;
    const grid = Array.from({ length: 3 }, () => Array(9).fill(null));
    for (let col = 0; col < 9; col++) {
      const min = col === 0 ? 1 : col * 10;
      const max = col === 8 ? 90 : col * 10 + 9;
      const pool = Array.from({ length: max - min + 1 }, (_, i) => min + i).sort(() => Math.random() - 0.5);
      const rows = rowCols.map((cols, r) => (cols.includes(col) ? r : -1)).filter((r) => r >= 0).sort((a, b) => a - b);
      pool.slice(0, rows.length).sort((a, b) => a - b).forEach((n, i) => { grid[rows[i]][col] = n; });
    }
    return grid;
  }
}

function getLineWins(ticket, calledSet) {
  const wins = [];
  ["Top Line", "Middle Line", "Bottom Line"].forEach((label, r) => {
    const nums = ticket[r].filter((n) => n !== null);
    if (nums.length > 0 && nums.every((n) => calledSet.has(n))) wins.push(label);
  });
  if (ticket.flat().filter((n) => n !== null).every((n) => calledSet.has(n))) wins.push("Full House");
  return wins;
}

function countMarked(ticket, calledSet) {
  return ticket.flat().filter((n) => n !== null && calledSet.has(n)).length;
}

const WIN_ORDER = ["Early 5", "Top Line", "Middle Line", "Bottom Line", "Full House"];
const WIN_ICONS = { "Early 5": "⚡", "Top Line": "🔝", "Middle Line": "➡️", "Bottom Line": "⬇️", "Full House": "🏆" };

const BOT_POOL = [
  { id: "b1", name: "Bot Alex",  emoji: "🤖", color: "#7c73e6" },
  { id: "b2", name: "Bot Maya",  emoji: "🎰", color: "#e67373" },
  { id: "b3", name: "Bot Zara",  emoji: "🦊", color: "#73c9e6" },
  { id: "b4", name: "Bot Rohan", emoji: "🐲", color: "#73e69c" },
  { id: "b5", name: "Bot Priya", emoji: "🌙", color: "#e6c073" },
];

// ═══════════════════════════════════════════════════════════
//  CSS
// ═══════════════════════════════════════════════════════════

const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@700&family=Cinzel:wght@400;700&family=Rajdhani:wght@400;500;600;700&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; }
  body { overflow-x: hidden; font-family: 'Rajdhani', sans-serif; background: #070714; }
  button { font-family: 'Rajdhani', sans-serif; }
  input  { font-family: 'Rajdhani', sans-serif; }
  input:focus { outline: none; }
  input::placeholder { color: rgba(255,255,255,0.25); }
  ::-webkit-scrollbar { width: 5px; height: 5px; }
  ::-webkit-scrollbar-track { background: rgba(255,255,255,0.03); }
  ::-webkit-scrollbar-thumb { background: rgba(255,215,0,0.3); border-radius: 4px; }

  @keyframes starTwinkle   { 0%,100%{opacity:.1;} 50%{opacity:.65;} }
  @keyframes numPulse      { 0%,100%{text-shadow:0 0 40px rgba(255,215,0,.8),0 0 80px rgba(255,215,0,.3);}
                              50%{text-shadow:0 0 70px rgba(255,215,0,1),0 0 130px rgba(255,215,0,.5);} }
  @keyframes fadeSlideDown { from{opacity:0;transform:translate(-50%,-20px);} to{opacity:1;transform:translate(-50%,0);} }
  @keyframes popIn         { from{opacity:0;transform:scale(.85);} to{opacity:1;transform:scale(1);} }
  @keyframes winGlow       { 0%,100%{box-shadow:0 0 10px rgba(0,230,118,.3);} 50%{box-shadow:0 0 28px rgba(0,230,118,.65);} }
  @keyframes bounceIn      { 0%{transform:scale(0);} 60%{transform:scale(1.12);} 80%{transform:scale(.95);} 100%{transform:scale(1);} }
  @keyframes pulse         { 0%,100%{opacity:1;} 50%{opacity:.45;} }
  @keyframes logEntry      { from{opacity:0;transform:translateX(-12px);} to{opacity:1;transform:translateX(0);} }
  @keyframes shimmer       { 0%{background-position:-200% 0;} 100%{background-position:200% 0;} }

  input::-webkit-search-cancel-button,
  input::-webkit-clear-button,
  input::-ms-clear { display: none; }
  .btn { transition: all .17s ease; cursor: pointer; }
  .btn:hover  { transform: translateY(-2px) scale(1.015); filter: brightness(1.12); }
  .btn:active { transform: translateY(0) scale(.97); }
  .cell { transition: all .26s cubic-bezier(.34,1.56,.64,1); }
  .num  { transition: background .18s ease, color .18s ease, transform .2s ease, box-shadow .18s ease; }
  .log-entry { animation: logEntry .3s ease forwards; }
`;

// ═══════════════════════════════════════════════════════════
//  STARS
// ═══════════════════════════════════════════════════════════

const Stars = () => {
  const stars = useRef(Array.from({ length: 80 }, () => ({
    size: Math.random() * 2.2 + 0.4,
    left: Math.random() * 100,
    top:  Math.random() * 100,
    dur:  Math.random() * 3 + 2,
    delay:Math.random() * 5,
  })));
  return (
    <div style={{ position:"fixed", inset:0, pointerEvents:"none", zIndex:0 }}>
      {stars.current.map((s,i) => (
        <div key={i} style={{
          position:"absolute", width:s.size, height:s.size, borderRadius:"50%", background:"#fff",
          left:`${s.left}%`, top:`${s.top}%`,
          animation:`starTwinkle ${s.dur}s ease-in-out ${s.delay}s infinite`,
        }}/>
      ))}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
//  TICKET CARD  –  shows full numbers, no abbreviations
// ═══════════════════════════════════════════════════════════

function TicketCard({ ticket, calledSet, label, marked, accent, compact }) {
  const cellH = compact ? 28 : 34;
  const cellFs = compact ? 10 : 12;
  return (
    <div style={{
      background:"linear-gradient(135deg,#0d0d28,#121238)",
      border:`2px solid ${accent || "rgba(255,255,255,.12)"}`,
      borderRadius:14, padding: compact ? "10px 10px 8px" : "14px 14px 10px",
      boxShadow: accent ? `0 0 22px ${accent}22` : "none",
    }}>
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
        <span style={{ color: accent || "rgba(255,255,255,.4)", fontSize:9, letterSpacing:3, fontWeight:700 }}>
          {label}
        </span>
        <span style={{
          background: accent ? `${accent}18` : "rgba(255,255,255,.05)",
          border:`1px solid ${accent ? `${accent}44` : "rgba(255,255,255,.1)"}`,
          borderRadius:20, padding:"1px 9px",
          color: accent || "rgba(255,255,255,.35)", fontSize:10, fontWeight:700,
        }}>{marked}/15</span>
      </div>

      {/* 3 × 9 Grid — full numbers */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(9,1fr)", gap: compact ? 3 : 4 }}>
        {ticket.map((row, r) => row.map((num, c) => {
          const called = num !== null && calledSet.has(num);
          return (
            <div key={`${r}-${c}`} className="cell" style={{
              height: cellH,
              display:"flex", alignItems:"center", justifyContent:"center",
              borderRadius:6,
              fontSize: cellFs,
              fontWeight: called ? 900 : 600,
              background: num === null ? "rgba(0,0,0,.3)"
                        : called      ? "linear-gradient(135deg,#ffd700,#ff9500)"
                        :               "rgba(255,255,255,.07)",
              color: num === null ? "transparent" : called ? "#000" : "#fff",
              border: num !== null && !called ? "1px solid rgba(255,215,0,.08)" : "none",
              boxShadow: called ? `0 0 10px rgba(255,215,0,.5)` : "none",
              transform: called ? "scale(1.06)" : "scale(1)",
            }}>{num ?? ""}</div>
          );
        }))}
      </div>

      {/* Row status — full words */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:3, marginTop:7 }}>
        {["Top Line","Middle Line","Bottom Line"].map((lbl, r) => {
          const nums = ticket[r].filter(n => n !== null);
          const done = nums.length > 0 && nums.every(n => calledSet.has(n));
          return (
            <div key={lbl} style={{
              textAlign:"center", fontSize:8, letterSpacing:.5, fontWeight: done ? 700 : 400,
              color: done ? "#00e676" : "rgba(255,255,255,.18)", transition:"all .3s",
            }}>{done ? "✓ " : ""}{lbl}</div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  GAME LOG PANEL
// ═══════════════════════════════════════════════════════════

function GameLog({ logs, expanded, onToggle }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const panelStyle = expanded ? {
    position:"fixed", inset:0, zIndex:500,
    background:"linear-gradient(160deg,#050510,#08082a,#050510)",
    display:"flex", flexDirection:"column",
    animation:"popIn .25s ease",
  } : {
    background:"linear-gradient(135deg,#0d0d28,#121238)",
    border:"1px solid rgba(255,255,255,.08)",
    borderRadius:14, display:"flex", flexDirection:"column",
    minHeight:260,
  };

  const drawCount  = logs.filter(l => l.type === "number").length;
  const claimCount = logs.filter(l => l.type === "claim").length;
  const winCount   = logs.filter(l => l.type === "win").length;

  return (
    <div style={panelStyle}>
      {/* Header */}
      <div style={{
        display:"flex", alignItems:"center", justifyContent:"space-between",
        padding: expanded ? "16px 28px" : "10px 14px",
        borderBottom:"1px solid rgba(255,255,255,.07)",
        background: expanded ? "rgba(0,0,0,.4)" : "transparent",
        flexShrink:0,
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <span style={{ fontSize: expanded ? 26 : 18 }}>📋</span>
          <div>
            <div style={{ color:"#ffd700", fontWeight:700, fontSize: expanded ? 20 : 12, letterSpacing: expanded ? 4 : 2 }}>
              GAME LOG
            </div>
            {expanded && (
              <div style={{ display:"flex", gap:18, marginTop:5 }}>
                {[
                  { label:"Draws",  val:drawCount,  c:"#ffd700" },
                  { label:"Claims", val:claimCount, c:"#00e676" },
                  { label:"Wins",   val:winCount,   c:"#ff9500" },
                  { label:"Total",  val:logs.length,c:"rgba(255,255,255,.4)" },
                ].map(s => (
                  <div key={s.label} style={{ textAlign:"center" }}>
                    <div style={{ color:s.c, fontWeight:800, fontSize:22 }}>{s.val}</div>
                    <div style={{ color:"rgba(255,255,255,.3)", fontSize:10, letterSpacing:1 }}>{s.label}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          {!expanded && (
            <span style={{ color:"rgba(255,255,255,.2)", fontSize:10 }}>{logs.length} events</span>
          )}
          <button className="btn" onClick={onToggle} style={{
            background: expanded ? "rgba(255,82,82,.12)" : "rgba(255,215,0,.08)",
            border:`1px solid ${expanded ? "rgba(255,82,82,.35)" : "rgba(255,215,0,.2)"}`,
            borderRadius:8, padding: expanded ? "8px 20px" : "5px 12px",
            color: expanded ? "#ff5252" : "rgba(255,215,0,.7)",
            fontSize: expanded ? 13 : 11, fontWeight:700,
          }}>
            {expanded ? "✕ Close Full Screen" : "⛶ Expand"}
          </button>
        </div>
      </div>

      {/* Column headers — only in expanded mode */}
      {expanded && (
        <div style={{
          display:"grid", gridTemplateColumns:"48px 60px 1fr 1fr 110px",
          gap:0, padding:"10px 28px 8px",
          borderBottom:"1px solid rgba(255,255,255,.05)",
          flexShrink:0,
        }}>
          {["#","Type","Event","Details / Who Ticked","Time"].map(h => (
            <div key={h} style={{ color:"rgba(255,215,0,.4)", fontSize:10, letterSpacing:2, fontWeight:700 }}>{h}</div>
          ))}
        </div>
      )}

      {/* Log entries */}
      <div ref={scrollRef} style={{
        flex:1, overflowY:"auto",
        padding: expanded ? "12px 0" : "10px 12px",
        display:"flex", flexDirection:"column",
        gap: expanded ? 0 : 5,
      }}>
        {logs.length === 0 ? (
          <div style={{ color:"rgba(255,255,255,.2)", fontSize:13, textAlign:"center", marginTop:30 }}>
            Draw a number to start the log…
          </div>
        ) : (
          [...logs].reverse().map((entry, i) => {
            const rowBg =
              entry.type === "number" ? "rgba(255,215,0,.035)" :
              entry.type === "win"    ? "rgba(0,230,118,.05)" :
              entry.type === "claim"  ? "rgba(255,215,0,.06)" :
                                        "rgba(255,255,255,.02)";
            const borderL =
              entry.type === "number" ? "#ffd700" :
              entry.type === "win"    ? "#00e676" :
              entry.type === "claim"  ? "#ff9500" :
                                        "rgba(255,255,255,.1)";
            const textColor =
              entry.type === "win"    ? "#00e676" :
              entry.type === "claim"  ? "#ffd700" :
              entry.type === "number" ? "#fff"    : "rgba(255,255,255,.55)";

            return expanded ? (
              /* ── EXPANDED ROW ── */
              <div key={i} style={{
                display:"grid", gridTemplateColumns:"48px 60px 1fr 1fr 110px",
                gap:0, padding:"10px 28px",
                background: i % 2 === 0 ? "rgba(255,255,255,.015)" : "transparent",
                borderLeft:`3px solid ${borderL}`,
                marginLeft:0,
                transition:"background .15s",
              }}
                onMouseEnter={e => e.currentTarget.style.background="rgba(255,215,0,.04)"}
                onMouseLeave={e => e.currentTarget.style.background= i%2===0 ? "rgba(255,255,255,.015)" : "transparent"}
              >
                {/* Seq # */}
                <div style={{ color:"rgba(255,255,255,.25)", fontSize:12, fontWeight:700, alignSelf:"center" }}>
                  {entry.seq}
                </div>

                {/* Icon + type badge */}
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <span style={{ fontSize:16 }}>{entry.icon}</span>
                  <span style={{
                    fontSize:8, fontWeight:800, letterSpacing:1, padding:"2px 5px", borderRadius:4,
                    background: entry.type==="number"?"rgba(255,215,0,.12)":entry.type==="win"?"rgba(0,230,118,.12)":entry.type==="claim"?"rgba(255,150,0,.12)":"rgba(255,255,255,.06)",
                    color: entry.type==="number"?"#ffd700":entry.type==="win"?"#00e676":entry.type==="claim"?"#ff9500":"rgba(255,255,255,.4)",
                    textTransform:"uppercase",
                  }}>
                    {entry.type==="number"?"DRAW":entry.type==="win"?"WIN":entry.type==="claim"?"CLAIM":entry.type.toUpperCase()}
                  </span>
                </div>

                {/* Main event text */}
                <div style={{ color:textColor, fontWeight:700, fontSize:13, alignSelf:"center", paddingRight:8 }}>
                  {entry.text}
                </div>

                {/* Details / Tickers */}
                <div style={{ alignSelf:"center", paddingRight:8 }}>
                  {entry.type === "number" && entry.tickers && entry.tickers.length > 0 ? (
                    <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
                      {entry.tickers.map((t,ti) => (
                        <span key={ti} style={{
                          display:"inline-flex", alignItems:"center", gap:4,
                          background: t.isPlayer ? "rgba(255,215,0,.12)" : "rgba(255,255,255,.07)",
                          border:`1px solid ${t.isPlayer ? "rgba(255,215,0,.3)" : "rgba(255,255,255,.12)"}`,
                          borderRadius:20, padding:"2px 8px",
                          fontSize:11, fontWeight:700,
                          color: t.isPlayer ? "#ffd700" : "rgba(255,255,255,.7)",
                        }}>
                          {t.emoji} {t.name}
                        </span>
                      ))}
                    </div>
                  ) : entry.type === "number" ? (
                    <span style={{ color:"rgba(255,255,255,.2)", fontSize:11, fontStyle:"italic" }}>Not on any ticket</span>
                  ) : (
                    <span style={{ color:"rgba(255,255,255,.35)", fontSize:12 }}>{entry.sub}</span>
                  )}
                </div>

                {/* Timestamp */}
                <div style={{ color:"rgba(255,255,255,.2)", fontSize:11, alignSelf:"center", textAlign:"right" }}>
                  {entry.sub && entry.type !== "number" ? entry.sub : ""}
                </div>
              </div>
            ) : (
              /* ── COMPACT ROW ── */
              <div key={i} className="log-entry" style={{
                display:"flex", alignItems:"flex-start", gap:8,
                padding:"6px 10px", borderRadius:8,
                background: rowBg,
                borderLeft:`2px solid ${borderL}`,
              }}>
                <span style={{ fontSize:13, flexShrink:0, marginTop:1 }}>{entry.icon}</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ color:textColor, fontWeight:700, fontSize:11, letterSpacing:.3 }}>{entry.text}</div>
                  {entry.type === "number" && entry.tickers && entry.tickers.length > 0 && (
                    <div style={{ color:"rgba(255,255,255,.35)", fontSize:10, marginTop:2 }}>
                      ✓ {entry.tickers.map(t=>t.name).join(", ")}
                    </div>
                  )}
                  {entry.type === "number" && (!entry.tickers || entry.tickers.length === 0) && (
                    <div style={{ color:"rgba(255,255,255,.18)", fontSize:10, marginTop:2, fontStyle:"italic" }}>Not on any ticket</div>
                  )}
                  {entry.type !== "number" && entry.sub && (
                    <div style={{ color:"rgba(255,255,255,.28)", fontSize:10, marginTop:1 }}>{entry.sub}</div>
                  )}
                </div>
                <span style={{ color:"rgba(255,255,255,.18)", fontSize:9, flexShrink:0 }}>#{entry.seq}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  RESULTS MODAL
// ═══════════════════════════════════════════════════════════

function ResultsModal({ results, claimedWins, claimDetails, calledNumbers, playerName, onClose, gameMode, playerTicket, botTickets, bots, roomPlayers }) {
  const WIN_ORDER_L = ["Early 5","Top Line","Middle Line","Bottom Line","Full House"];
  const WIN_ICONS_L = { "Early 5":"⚡","Top Line":"🔝","Middle Line":"➡️","Bottom Line":"⬇️","Full House":"🏆" };
  const PRIZE_COLORS = { "🥇 1st Prize":"#ffd700","🥈 2nd Prize":"#c0c0c0","🥉 3rd Prize":"#cd7f32" };

  // Helper: get claims array safely
  const getClaims = (win) => {
    const c = claimedWins[win];
    if (!c) return [];
    if (Array.isArray(c)) return c;
    if (typeof c === 'string') return [{ name: c, points: 10, rank: 1 }]; // legacy
    return [];
  };

  // Build player stats
  const calledSet = new Set(calledNumbers);
  const allPlayers = results?.playerStats || (() => {
    const stats = [];
    const myMarked = playerTicket ? countMarked(playerTicket, calledSet) : 0;
    const myWins = WIN_ORDER_L.filter(w => getClaims(w).some(c => c.name === playerName || c.name === "You"));
    const myPts = WIN_ORDER_L.reduce((sum, w) => {
      const claim = getClaims(w).find(c => c.name === playerName || c.name === "You");
      return sum + (claim?.points || 0);
    }, 0);
    stats.push({ name: playerName, wins: myWins, totalMarked: myMarked, isMe: true, points: myPts });
    (bots || []).forEach(bot => {
      const t = botTickets?.[bot.id];
      const marked = t ? countMarked(t, calledSet) : 0;
      const wins = WIN_ORDER_L.filter(w => getClaims(w).some(c => c.name === bot.name));
      const pts = WIN_ORDER_L.reduce((sum, w) => {
        const claim = getClaims(w).find(c => c.name === bot.name);
        return sum + (claim?.points || 0);
      }, 0);
      stats.push({ name: bot.name, wins, totalMarked: marked, emoji: bot.emoji, points: pts });
    });
    stats.sort((a, b) => b.points - a.points || b.wins.length - a.wins.length);
    return stats;
  })();

  const prizes = results?.prizes || {};

  const totalPrizesCount = WIN_ORDER_L.reduce((n, w) => n + getClaims(w).length, 0);

  return (
    <div style={{
      position:"fixed", inset:0, zIndex:9000,
      background:"rgba(0,0,0,.88)", backdropFilter:"blur(6px)",
      display:"flex", alignItems:"center", justifyContent:"center",
      padding:16, overflowY:"auto",
    }}>
      <div style={{
        background:"linear-gradient(160deg,#080820,#0e0e30,#080820)",
        border:"2px solid rgba(255,215,0,.3)", borderRadius:24,
        width:"100%", maxWidth:720, maxHeight:"92vh", overflowY:"auto",
        boxShadow:"0 0 80px rgba(255,215,0,.12)",
        animation:"popIn .4s ease",
      }}>
        {/* Sticky Header */}
        <div style={{
          padding:"20px 24px 14px",
          borderBottom:"1px solid rgba(255,255,255,.07)",
          display:"flex", justifyContent:"space-between", alignItems:"center",
          position:"sticky", top:0, background:"#080820", zIndex:10,
        }}>
          <div>
            <div style={{ fontFamily:"'Cinzel Decorative',serif", color:"#ffd700", fontSize:18, letterSpacing:3 }}>🏆 FINAL RESULTS</div>
            <div style={{ color:"rgba(255,255,255,.35)", fontSize:12, marginTop:3 }}>
              {calledNumbers.length} numbers drawn · {totalPrizesCount} prizes claimed
            </div>
          </div>
          <button onClick={onClose} style={{
            background:"rgba(255,82,82,.12)", border:"1px solid rgba(255,82,82,.3)",
            borderRadius:10, padding:"9px 18px", color:"#ff5252",
            fontWeight:800, fontSize:13, cursor:"pointer", letterSpacing:1,
          }}>✕ CLOSE</button>
        </div>

        <div style={{ padding:"18px 24px", display:"flex", flexDirection:"column", gap:18 }}>

          {/* ── Points Formula ── */}
          {(() => {
            const n = allPlayers.length || 2;
            const rows = Array.from({ length: n }, (_, i) => ({
              rank: i + 1,
              label: i === 0 ? "🥇 1st" : i === 1 ? "🥈 2nd" : i === 2 ? "🥉 3rd" : `#${i+1}`,
              otherPts: Math.max((n - i) * 5, 5),
              fhPts:    Math.max((n - i) * 10, 10),
            }));
            return (
              <div style={{ borderRadius:12, overflow:"hidden", border:"1px solid rgba(255,215,0,.2)" }}>
                <div style={{ background:"rgba(255,215,0,.1)", padding:"10px 16px", fontWeight:800, fontSize:12, color:"#ffd700", letterSpacing:2 }}>
                  ⭐ POINTS SYSTEM ({n} players)
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"80px 1fr 1fr", background:"rgba(0,0,0,.3)" }}>
                  {["Claim","Early 5 / Lines","Full House"].map(h => (
                    <div key={h} style={{ padding:"7px 12px", color:"rgba(255,255,255,.4)", fontSize:10, letterSpacing:1, fontWeight:700, borderBottom:"1px solid rgba(255,255,255,.06)" }}>{h}</div>
                  ))}
                  {rows.map(r => [
                    <div key={`l${r.rank}`} style={{ padding:"7px 12px", color:"rgba(255,255,255,.7)", fontSize:12, fontWeight:700, borderBottom:"1px solid rgba(255,255,255,.04)" }}>{r.label}</div>,
                    <div key={`o${r.rank}`} style={{ padding:"7px 12px", color:"#00e676", fontSize:12, fontWeight:800, borderBottom:"1px solid rgba(255,255,255,.04)" }}>+{r.otherPts} pts <span style={{color:"rgba(255,255,255,.3)",fontSize:10}}>({n-r.rank+1}×5)</span></div>,
                    <div key={`f${r.rank}`} style={{ padding:"7px 12px", color:"#ffd700", fontSize:12, fontWeight:800, borderBottom:"1px solid rgba(255,255,255,.04)" }}>+{r.fhPts} pts <span style={{color:"rgba(255,255,255,.3)",fontSize:10}}>({n-r.rank+1}×10)</span></div>,
                  ])}
                </div>
              </div>
            );
          })()}

          {/* ── Champion Highlight ── */}
          {allPlayers[0] && allPlayers[0].points > 0 && (() => {
            const champ = allPlayers[0];
            const isMe = champ.name === playerName || champ.isMe;
            return (
              <div style={{
                background:"linear-gradient(135deg,rgba(255,215,0,.15),rgba(255,165,0,.08))",
                border:"2px solid #ffd700", borderRadius:16, padding:"20px 24px",
                display:"flex", alignItems:"center", gap:18,
                boxShadow:"0 0 30px rgba(255,215,0,.12)",
                animation:"winGlow 2s ease-in-out infinite",
              }}>
                <div style={{ fontSize:52 }}>👑</div>
                <div style={{ flex:1 }}>
                  <div style={{ color:"rgba(255,215,0,.6)", fontSize:10, letterSpacing:3, marginBottom:4 }}>HIGHEST POINTS · CHAMPION</div>
                  <div style={{ fontFamily:"'Cinzel',serif", color:"#ffd700", fontSize:22, fontWeight:800 }}>
                    {champ.name}{isMe ? " (You!)" : ""}
                  </div>
                  <div style={{ display:"flex", gap:12, marginTop:6, flexWrap:"wrap" }}>
                    <span style={{ color:"rgba(255,255,255,.6)", fontSize:13 }}>🏆 Won: <strong style={{color:"#fff"}}>{champ.wins?.join(", ") || "—"}</strong></span>
                  </div>
                </div>
                <div style={{ textAlign:"center" }}>
                  <div style={{ fontSize:40, fontWeight:900, color:"#ffd700", lineHeight:1 }}>{champ.points}</div>
                  <div style={{ color:"rgba(255,215,0,.6)", fontSize:12, marginTop:2 }}>POINTS</div>
                </div>
              </div>
            );
          })()}

          {/* ── ALL PLAYERS LEADERBOARD ── */}
          <div>
            <div style={{ color:"rgba(255,215,0,.5)", fontSize:10, letterSpacing:3, marginBottom:10 }}>📊 ALL PLAYERS — FULL LEADERBOARD</div>
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {allPlayers.map((p, i) => {
                const isMe = p.name === playerName || p.isMe;
                const medal = i===0?"🥇":i===1?"🥈":i===2?"🥉":`#${i+1}`;
                const playerPrizes = prizes[p.name] || [];
                const PRIZE_COLORS_L = { "🥇 1st Prize":"#ffd700","🥈 2nd Prize":"#c0c0c0","🥉 3rd Prize":"#cd7f32" };
                const barPct = allPlayers[0]?.points > 0 ? Math.round((p.points / allPlayers[0].points) * 100) : 0;
                return (
                  <div key={p.name} style={{
                    padding:"14px 16px", borderRadius:12,
                    background: i===0 ? "rgba(255,215,0,.08)" : isMe ? "rgba(124,115,230,.08)" : "rgba(255,255,255,.03)",
                    border:`2px solid ${i===0 ? "rgba(255,215,0,.35)" : isMe ? "rgba(124,115,230,.35)" : "rgba(255,255,255,.07)"}`,
                  }}>
                    <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                      <div style={{ fontSize:24, minWidth:30, textAlign:"center" }}>{medal}</div>
                      <div style={{ flex:1 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                          <span style={{ fontWeight:800, fontSize:15, color: i===0 ? "#ffd700" : isMe ? "#a09af0" : "#fff" }}>
                            {p.emoji && <span style={{marginRight:5}}>{p.emoji}</span>}
                            {p.name}{isMe?" (You)":""}
                          </span>
                          {playerPrizes.map(pr => <span key={pr} style={{ fontSize:11, fontWeight:800, color: PRIZE_COLORS_L[pr] }}>{pr}</span>)}
                        </div>
                        {/* Points bar */}
                        <div style={{ height:5, borderRadius:3, background:"rgba(255,255,255,.07)", overflow:"hidden", marginBottom:5 }}>
                          <div style={{
                            height:"100%", borderRadius:3,
                            width:`${barPct}%`,
                            background: i===0 ? "linear-gradient(90deg,#ffd700,#ff9500)" : isMe ? "linear-gradient(90deg,#7c73e6,#a09af0)" : "linear-gradient(90deg,rgba(255,255,255,.2),rgba(255,255,255,.4))",
                            transition:"width .8s ease",
                          }}/>
                        </div>
                        <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                          {p.wins?.length > 0 && <span style={{ color:"rgba(255,255,255,.45)", fontSize:11 }}>🏆 {p.wins.join(", ")}</span>}
                          {p.wins?.length === 0 && <span style={{ color:"rgba(255,255,255,.2)", fontSize:11, fontStyle:"italic" }}>No wins claimed</span>}
                        </div>
                      </div>
                      <div style={{ textAlign:"center", minWidth:60 }}>
                        <div style={{
                          fontSize:28, fontWeight:900,
                          color: i===0 ? "#ffd700" : i===1 ? "#c0c0c0" : i===2 ? "#cd7f32" : "rgba(255,255,255,.5)",
                        }}>{p.points || 0}</div>
                        <div style={{ color:"rgba(255,255,255,.3)", fontSize:10 }}>pts</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Win Claims Detail ── */}
          <div>
            <div style={{ color:"rgba(255,215,0,.5)", fontSize:10, letterSpacing:3, marginBottom:10 }}>🎖 WIN CLAIMS</div>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {WIN_ORDER_L.map(win => {
                const claims = getClaims(win);
                return (
                  <div key={win} style={{
                    padding:"12px 16px", borderRadius:12,
                    background: claims.length > 0 ? "rgba(255,215,0,.04)" : "rgba(255,255,255,.02)",
                    border:`1px solid ${claims.length > 0 ? "rgba(255,215,0,.15)" : "rgba(255,255,255,.05)"}`,
                  }}>
                    <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom: claims.length > 0 ? 8 : 0 }}>
                      <span style={{ fontSize:18 }}>{WIN_ICONS_L[win]}</span>
                      <span style={{ fontWeight:700, fontSize:14, color: claims.length > 0 ? "#fff" : "rgba(255,255,255,.35)" }}>{win}</span>
                      {claims.length === 0 && <span style={{ color:"rgba(255,255,255,.2)", fontSize:11 }}>— Not claimed</span>}
                    </div>
                    {claims.map((c, idx) => {
                      const isMe = c.name === playerName || c.name === "You";
                      const d = claimDetails[`${win}_${c.rank}`];
                      return (
                        <div key={idx} style={{ display:"flex", gap:10, alignItems:"center", paddingLeft:28, marginTop: idx > 0 ? 4 : 0, flexWrap:"wrap" }}>
                          <span style={{
                            fontSize:11, fontWeight:800, padding:"2px 7px", borderRadius:5,
                            background: c.rank===1 ? "rgba(255,215,0,.2)" : "rgba(192,192,192,.15)",
                            border:`1px solid ${c.rank===1 ? "rgba(255,215,0,.4)" : "rgba(192,192,192,.3)"}`,
                            color: c.rank===1 ? "#ffd700" : "#c0c0c0",
                          }}>{c.rank===1 ? "🥇 1st" : "🥈 2nd"} · +{c.points} pts</span>
                          <span style={{ color: isMe ? "#00e676" : "rgba(255,255,255,.7)", fontSize:12, fontWeight:700 }}>
                            👤 {c.name}{isMe?" (You)":""}
                          </span>
                          {d?.drawIndex && <span style={{ color:"rgba(255,215,0,.5)", fontSize:11 }}>🎱 Round {d.drawIndex}</span>}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Summary Stats ── */}
          <div style={{
            display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10,
            padding:"14px 16px", background:"rgba(255,255,255,.03)",
            border:"1px solid rgba(255,255,255,.07)", borderRadius:12,
          }}>
            {[
              { label:"Numbers Drawn", val: calledNumbers.length, c:"#ffd700" },
              { label:"Prizes Claimed", val: totalPrizesCount, c:"#00e676" },
              { label:"Players", val: allPlayers.length, c:"#7c73e6" },
              { label:"Top Score", val: allPlayers[0]?.points || 0, c:"#ff9500" },
            ].map(s => (
              <div key={s.label} style={{ textAlign:"center" }}>
                <div style={{ fontSize:22, fontWeight:900, color:s.c }}>{s.val}</div>
                <div style={{ color:"rgba(255,255,255,.3)", fontSize:10, marginTop:2 }}>{s.label}</div>
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}



export default function TambolaGame() {
  // ── AUTH STATE ──
  // MZeeGamingHub owns the only login. When it has already identified the player we skip
  // this game's local sign-in screen entirely and open straight on the menu.
  const [screen,        setScreen]        = useState(window.__MZEE_PLAYER__ ? "welcome" : "login");
  const [authTab,       setAuthTab]       = useState("login"); // "login" | "register"
  const [authUser,      setAuthUser]      = useState("");
  const [authPass,      setAuthPass]      = useState("");
  const [authError,     setAuthError]     = useState("");
  const [guestName,     setGuestName]     = useState("");
  const [isLoggedIn,    setIsLoggedIn]    = useState(!!window.__MZEE_PLAYER__);
  const [registeredUsers, setRegisteredUsers] = useState({}); // { username: password }

  // ── MULTIPLAYER STATE ──
  const [mpChoice,      setMpChoice]      = useState(null);
  const [joinInput,     setJoinInput]     = useState("");
  const [joinError,     setJoinError]     = useState("");
  const [roomPlayers,   setRoomPlayers]   = useState([]);
  const [isHost,        setIsHost]        = useState(false);
  const [createdRoomCode, setCreatedRoomCode] = useState("");
  const [currentTurnPlayer, setCurrentTurnPlayer] = useState(null);
  const [allTickets,    setAllTickets]    = useState({});
  const [claimDetails,  setClaimDetails]  = useState({});
  const [showResults,   setShowResults]   = useState(false);
  const [finalResults,  setFinalResults]  = useState(null);
  const [endPoll,       setEndPoll]       = useState(null);
  const [pollCountdown, setPollCountdown] = useState(0);
  const [gameEndedMP,   setGameEndedMP]   = useState(false);
  const [lobbyJoinError, setLobbyJoinError] = useState("");
  const [maxPlayers,    setMaxPlayers]    = useState(6);   // host sets this
  const [lobbyCountdown, setLobbyCountdown] = useState(0); // 60s wait timer
  const [gameFrozen,    setGameFrozen]    = useState(false); // poll freezes game

  // ── GAME STATE ──
  const [gameMode,      setGameMode]      = useState(null);
  const [roomCode,      setRoomCode]      = useState("");
  // Seeded from the MZee account that opened the game (see main.jsx) — no second sign-in.
  const [playerName,    setPlayerName]    = useState(() => window.__MZEE_PLAYER__ || "Player 1");
  const [nameInput,     setNameInput]     = useState("");
  const [showHowTo,     setShowHowTo]     = useState(false);

  // ── TURN TIMER ──
  const [turnTimer,     setTurnTimer]     = useState(60);
  const [timerActive,   setTimerActive]   = useState(false);

  const [playerTicket,  setPlayerTicket]  = useState(null);
  const [bots,          setBots]          = useState([]);
  const [botTickets,    setBotTickets]    = useState({});
  const [calledNumbers, setCalledNumbers] = useState([]);
  const [currentNum,    setCurrentNum]    = useState(null);
  const [isAutoPlay,    setIsAutoPlay]    = useState(false);
  const [speed,         setSpeed]         = useState(3);
  const [claimedWins,   setClaimedWins]   = useState({});
  const [announcement,  setAnnouncement]  = useState(null);
  const [gameOver,      setGameOver]      = useState(false);

  const [gameLogs,      setGameLogs]      = useState([]);
  const [logExpanded,   setLogExpanded]   = useState(false);
  const [activeTab,     setActiveTab]     = useState("board"); // "board" | "tickets" | "log"

  const poolRef          = useRef([]);
  const botClaimedRef    = useRef({});
  const botTicketsRef    = useRef({});
  const botsRef          = useRef([]);
  const gameModeRef      = useRef(null);
  const seqRef           = useRef(0);
  const playerTicketRef  = useRef(null);
  const playerNameRef    = useRef(window.__MZEE_PLAYER__ || "Player 1");
  const wsRef            = useRef(null);
  const isHostRef        = useRef(false);
  const screenRef        = useRef("login");
  const multiRoomRef     = useRef("");
  const drawIndexRef     = useRef(0);
  const roomCodeRef      = useRef("");
  const currentTurnRef   = useRef(null);
  const claimOrderRef    = useRef(0);
  const maxPlayersRef    = useRef(6);
  const gameFrozenRef    = useRef(false);
  maxPlayersRef.current  = maxPlayers;
  gameFrozenRef.current  = gameFrozen;
  const applyNumberRef   = useRef(null);
  const addLogRef        = useRef(null);
  const startGameRef     = useRef(null);
  botTicketsRef.current  = botTickets;
  botsRef.current        = bots;
  gameModeRef.current    = gameMode;
  playerTicketRef.current= playerTicket;
  playerNameRef.current  = playerName;
  isHostRef.current      = isHost;
  screenRef.current      = screen;
  roomCodeRef.current    = roomCode;
  currentTurnRef.current = currentTurnPlayer;

  const addLog = useCallback((type, icon, text, sub, tickers) => {
    seqRef.current += 1;
    const seq = seqRef.current;
    const ts = new Date().toLocaleTimeString("en-GB", { hour:"2-digit", minute:"2-digit", second:"2-digit" });
    setGameLogs(prev => [...prev, { type, icon, text, sub: sub || ts, seq, tickers: tickers || [] }]);
  }, []);
  addLogRef.current = addLog;

  // ── START ──
  const startGame = (mode, activeBots, mpRoomCode = "") => {
    poolRef.current       = Array.from({ length: 90 }, (_, i) => i + 1).sort(() => Math.random() - 0.5);
    botClaimedRef.current = {};
    seqRef.current        = 0;
    drawIndexRef.current  = 0;
    claimOrderRef.current = 0;
    multiRoomRef.current  = mpRoomCode || roomCodeRef.current;
    const tickets = {};
    activeBots.forEach(b => { tickets[b.id] = generateTicket(); });
    const myTicket = generateTicket();
    setPlayerTicket(myTicket);
    setBotTickets(tickets);
    setBots(activeBots);
    setCalledNumbers([]);
    setCurrentNum(null);
    setIsAutoPlay(false);
    setClaimedWins({});
    setAnnouncement(null);
    setGameOver(false);
    setGameMode(mode);
    setGameLogs([]);
    setActiveTab("board");
    setLogExpanded(false);
    setTurnTimer(60);
    setTimerActive(false);
    setAllTickets({});
    setCurrentTurnPlayer(null);
    setClaimDetails({});
    setEndPoll(null);
    setPollCountdown(0);
    setGameFrozen(false);
    setGameEndedMP(false);
    setFinalResults(null);
    setShowResults(false);
    setScreen("game");

    // Share our ticket with the server so all players can see it
    if (mode === "private") {
      const code = mpRoomCode || roomCodeRef.current;
      const sendTicket = () => {
        if (wsRef.current?.readyState === 1) {
          wsRef.current.send(JSON.stringify({
            type: 'share_ticket',
            code,
            playerName: playerNameRef.current,
            ticket: myTicket,
          }));
        } else {
          setTimeout(sendTicket, 300);
        }
      };
      setTimeout(sendTicket, 200);
    }
  };
  startGameRef.current = startGame;

  // ── APPLY NUMBER — called by BOTH host (after drawing) and non-host (from WS) ──
  const applyNumber = useCallback((num) => {
    drawIndexRef.current += 1;
    setCurrentNum(num);

    const tickers = [];
    const pTicket = playerTicketRef.current;
    if (pTicket && pTicket.flat().includes(num))
      tickers.push({ name: playerNameRef.current || "You", emoji: "👤", isPlayer: true });
    botsRef.current.forEach(bot => {
      const t = botTicketsRef.current[bot.id];
      if (t && t.flat().includes(num))
        tickers.push({ name: bot.name, emoji: bot.emoji, isPlayer: false });
    });

    addLog("number", "🎱",
      `Draw #${drawIndexRef.current}  →  Number: ${num}`,
      tickers.length > 0 ? `Ticked by: ${tickers.map(t=>t.name).join(", ")}` : `Number ${num} — not on any ticket`,
      tickers
    );

    setCalledNumbers(prev => {
      const next = [...prev, num];
      const cs   = new Set(next);
      botsRef.current.forEach(bot => {
        const ticket = botTicketsRef.current[bot.id];
        if (!ticket) return;
        const marked = countMarked(ticket, cs);
        const wins   = getLineWins(ticket, cs);
          const tryClaimBot = (winType) => {
          const key = `${bot.id}-${winType}`;
          if (botClaimedRef.current[key]) return;
          botClaimedRef.current[key] = true;
          setTimeout(() => {
            setClaimedWins(cw => {
              const existing = Array.isArray(cw[winType]) ? cw[winType] : [];
              if (existing.length >= 2) return cw;
              if (existing.some(c => c.name === bot.name)) return cw;
              const rank = existing.length + 1;
              const totalP = botsRef.current.length + 1;
              const multiplier = winType === "Full House" ? 10 : 5;
              const points = Math.max((totalP - (rank - 1)) * multiplier, multiplier);
              const newClaim = { name: bot.name, points, rank };
              setAnnouncement({ text:`${bot.emoji} ${bot.name} auto-claimed ${rank===1?"🥇 1st":"🥈 2nd"} ${WIN_ICONS[winType]} ${winType}! +${points}pts`, type:"comp" });
              addLog("win", bot.emoji, `${bot.name}: ${rank===1?"🥇 1st":"🥈 2nd"} ${winType}! +${points}pts`, `Round ${num}`);
              if (winType === "Full House" && rank >= 2) setGameOver(true);
              return { ...cw, [winType]: [...existing, newClaim] };
            });
          }, 600 + Math.random() * 1200);
        };
        if (marked >= 5) tryClaimBot("Early 5");
        wins.forEach(tryClaimBot);
      });
      return next;
    });
  }, [addLog]);
  applyNumberRef.current = applyNumber;

  // ── AUTO CLAIM — fires whenever calledNumbers changes ──
  // Automatically claims wins for the human player when eligible
  useEffect(() => {
    if (screen !== "game" || gameOver || !playerTicket) return;
    const cs = new Set(calledNumbers);
    const isMultiplayer = gameMode === "private";
    const pName = playerName || "You";

    const tryAutoClaimPlayer = (winType) => {
      const existing = claimedWins[winType] || [];
      if (Array.isArray(existing) && existing.length >= 2) return; // max 2 per type
      if (Array.isArray(existing) && existing.some(c => c.name === pName)) return; // already claimed

      let eligible = false;
      if (winType === "Early 5") eligible = countMarked(playerTicket, cs) >= 5;
      else if (winType === "Full House") eligible = playerTicket.flat().filter(n => n !== null).every(n => cs.has(n));
      else eligible = getLineWins(playerTicket, cs).includes(winType);

      if (!eligible) return;

      if (isMultiplayer) {
        wsRef.current?.send(JSON.stringify({ type:'claim_win', code:multiRoomRef.current, winType, playerName: pName }));
      } else {
        // Computer mode — apply locally
        claimOrderRef.current += 1;
        const rank = Array.isArray(existing) ? existing.length + 1 : 1;
        const multiplier = winType === "Full House" ? 10 : 5;
        const totalP = (bots.length + 1);
        const points = Math.max((totalP - (rank - 1)) * multiplier, multiplier);
        const newClaim = { name: pName, points, rank };
        setClaimedWins(prev => ({ ...prev, [winType]: [...(Array.isArray(prev[winType]) ? prev[winType] : []), newClaim] }));
        setClaimDetails(prev => ({ ...prev, [`${winType}_${rank}`]: { playerName: pName, drawIndex: calledNumbers.length, points, rank } }));
        const rankLabel = rank === 1 ? "🥇 1st" : "🥈 2nd";
        setAnnouncement({ text:`✅ Auto-claimed! ${rankLabel} ${WIN_ICONS[winType]} ${winType} · +${points} pts`, type:"win" });
        addLog("claim","🏆",`AUTO: ${rankLabel} ${winType}! +${points}pts`,`Round ${calledNumbers.length}`);
        if (winType === "Full House" && rank >= 2) setGameOver(true);
      }
    };

    WIN_ORDER.forEach(tryAutoClaimPlayer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calledNumbers]);
  const callNumber = useCallback(() => {
    if (gameFrozenRef.current) return; // poll in progress — game frozen
    const isMultiplayer = gameModeRef.current === "private";

    // In multiplayer, only the current turn player can draw
    if (isMultiplayer && currentTurnRef.current !== playerNameRef.current) return;

    const pool = poolRef.current;
    if (!pool.length) {
      setGameOver(true);
      addLog("system","🏁","All 90 numbers called — Game Over!","Final draw complete");
      return;
    }

    if (isMultiplayer) {
      // Server manages the pool authoritatively — just request a draw
      wsRef.current?.send(JSON.stringify({
        type: 'draw_number',
        code: multiRoomRef.current,
        playerName: playerNameRef.current,
      }));
    } else {
      // Computer mode: draw from local pool
      const [num, ...rest] = pool;
      poolRef.current = rest;
      applyNumber(num);
    }
  }, [addLog, applyNumber]);

  // ── AUTO PLAY ──
  useEffect(() => {
    if (!isAutoPlay || screen !== "game" || gameOver) return;
    // In multiplayer, only draw if it's our turn
    if (gameMode === "private" && currentTurnPlayer !== playerName) return;
    const ms = Math.round(6500 / speed);
    const t  = setTimeout(callNumber, ms);
    return () => clearTimeout(t);
  }, [isAutoPlay, calledNumbers, screen, gameOver, callNumber, speed, gameMode, currentTurnPlayer, playerName]);

  // ── WEBSOCKET — connect once, handle messages for lobby sync ──
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Namespaced: the hub routes this upgrade to Tambola's WebSocket server.
    const url = `${protocol}//${window.location.host}/games/tambola/ws`;
    let ws;
    let reconnectTimer;

    const connect = () => {
      ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === 'room_update') {
            setRoomPlayers(msg.players || []);
            if (msg.maxPlayers) setMaxPlayers(msg.maxPlayers);
            if (msg.currentTurnPlayer) setCurrentTurnPlayer(msg.currentTurnPlayer);
            if (msg.tickets) setAllTickets(msg.tickets);
            if (msg.claimDetails) setClaimDetails(msg.claimDetails);
            if (msg.claimedWins) setClaimedWins(msg.claimedWins);
            if (msg.endPoll !== undefined) setEndPoll(msg.endPoll);
            if (msg.finalResults) setFinalResults(msg.finalResults);
            if (msg.gameEnded) setGameEndedMP(true);
            if (msg.started && screenRef.current === 'lobby') {
              startGameRef.current("private", []);
            }
          }

          if (msg.type === 'number_drawn') {
            applyNumberRef.current(msg.num);
            if (msg.currentTurnPlayer) setCurrentTurnPlayer(msg.currentTurnPlayer);
          }

          // win_claimed now carries per-win-type claims array
          if (msg.type === 'win_claimed') {
            const { winType, claims, newClaim, drawIndex, alreadyClaimed, maxClaimed } = msg;
            if (alreadyClaimed) { setAnnouncement({ text:`❌ You already claimed ${winType}!`, type:"error" }); return; }
            if (maxClaimed) { setAnnouncement({ text:`❌ ${winType} already has 2 claims!`, type:"error" }); return; }
            // Update claimedWins to store array of {name,points,rank}
            setClaimedWins(prev => ({ ...prev, [winType]: claims }));
            // Store detail keyed by winType_rank
            if (newClaim) {
              setClaimDetails(prev => ({ ...prev, [`${winType}_${newClaim.rank}`]: { playerName: newClaim.name, drawIndex, points: newClaim.points, rank: newClaim.rank } }));
            }
            const isMe = newClaim?.name === playerNameRef.current;
            const pts = newClaim?.points || 10;
            const rankLabel = newClaim?.rank === 1 ? '🥇 1st' : '🥈 2nd';
            setAnnouncement({
              text: isMe ? `🎉 ${rankLabel} ${WIN_ICONS[winType]} ${winType}! +${pts} pts` : `🎊 ${newClaim?.name} got ${rankLabel} ${winType}! +${pts} pts`,
              type: isMe ? "win" : "comp",
            });
            addLogRef.current(isMe ? "claim" : "win", isMe ? "🏆" : "🎊",
              isMe ? `YOU: ${rankLabel} ${winType}! +${pts} pts` : `${newClaim?.name}: ${rankLabel} ${winType}! +${pts} pts`,
              `Round ${drawIndex}`
            );
            if (winType === "Full House" && (claims?.length >= 2 || newClaim?.rank === 2)) setGameOver(true);
          }

          // Poll started — show Yes/No modal to everyone except initiator
          if (msg.type === 'poll_started') {
            setEndPoll({ initiator: msg.initiator, votes: msg.votes, totalPlayers: msg.totalPlayers });
            setPollCountdown(60);
            setGameFrozen(true); // freeze game while poll is active
            setIsAutoPlay(false); // stop auto play
          }

          if (msg.type === 'poll_update') {
            setEndPoll(prev => prev ? { ...prev, votes: msg.votes, totalPlayers: msg.totalPlayers, expired: msg.expired } : null);
          }

          if (msg.type === 'game_ended') {
            setFinalResults(msg.results);
            setGameEndedMP(true);
            setGameOver(true);
            setGameFrozen(false);
            setEndPoll(null);
            setShowResults(true);
          }

          if (msg.type === 'poll_rejected') {
            setEndPoll(null);
            setGameFrozen(false);
            setAnnouncement({ text:`🚫 Poll ended — majority voted No. Game continues!`, type:"error" });
          }

          if (msg.type === 'game_over') {
            setGameOver(true);
            if (msg.results) { setFinalResults(msg.results); setGameEndedMP(true); }
            addLogRef.current("system","🏁","All 90 numbers called — Game Over!","Final draw complete");
          }

          if (msg.type === 'join_error') {
            setLobbyJoinError(msg.message);
            setJoinError(msg.message);
          }

          if (msg.type === 'player_left') {
            setRoomPlayers(prev => prev.filter(p => p.name !== msg.playerName));
          }

          if (msg.type === 'player_renamed') {
            setRoomPlayers(prev => prev.map(p => p.name === msg.oldName ? { ...p, name: msg.newName } : p));
          }

        } catch(e) { /* ignore */ }
      };

      ws.onclose = () => {
        // Reconnect after 2s if still in lobby
        reconnectTimer = setTimeout(() => {
          if (screenRef.current === 'lobby') connect();
        }, 2000);
      };
    };

    connect();
    return () => {
      clearTimeout(reconnectTimer);
      ws?.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── TURN TIMER ──
  useEffect(() => {
    if (!timerActive || screen !== "game" || gameOver) return;
    if (turnTimer <= 0) {
      callNumber();
      setTurnTimer(60);
      return;
    }
    const t = setTimeout(() => setTurnTimer(prev => prev - 1), 1000);
    return () => clearTimeout(t);
  }, [timerActive, turnTimer, screen, gameOver, callNumber]);

  // Reset timer on each new number drawn
  useEffect(() => {
    if (currentNum !== null) setTurnTimer(60);
  }, [currentNum]);


  // ── CLEAR TOAST ──
  useEffect(() => {
    if (!announcement) return;
    const t = setTimeout(() => setAnnouncement(null), 3500);
    return () => clearTimeout(t);
  }, [announcement]);

  // ── LOBBY COUNTDOWN ──
  useEffect(() => {
    if (screen !== "lobby" || !isHost || lobbyCountdown <= 0) return;
    const t = setTimeout(() => {
      setLobbyCountdown(prev => {
        if (prev <= 1) {
          // Auto-start: send to server & navigate
          wsRef.current?.send(JSON.stringify({ type: 'start_game', code: roomCodeRef.current }));
          startGameRef.current("private", []);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lobbyCountdown, screen, isHost]);

  // ── POLL COUNTDOWN ──
  useEffect(() => {
    if (!endPoll || pollCountdown <= 0) return;
    const t = setTimeout(() => setPollCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [endPoll, pollCountdown]);

  // ── CLAIM WIN ──
  const claimWin = (winType) => {
    const isMultiplayer = gameModeRef.current === "private";

    if (isMultiplayer) {
      const cs = new Set(calledNumbers);
      if (winType === "Early 5") {
        if (!playerTicket || countMarked(playerTicket, cs) < 5) {
          setAnnouncement({ text:"❌ Mark 5 numbers first for Early 5!", type:"error" }); return;
        }
      } else if (!playerTicket || !getLineWins(playerTicket, cs).includes(winType)) {
        setAnnouncement({ text:`❌ ${winType} is not complete yet!`, type:"error" }); return;
      }
      wsRef.current?.send(JSON.stringify({ type:'claim_win', code:multiRoomRef.current, winType, playerName: playerName||"You" }));
      return;
    }

    // Computer mode — per-win-type: rank 1=10pts, rank 2=5pts, max 2 claims per type
    const existing = claimedWins[winType] || [];
    const name = playerName || "You";
    if (existing.some(c => c.name === name)) { setAnnouncement({ text:`❌ You already claimed ${winType}!`, type:"error" }); return; }
    if (existing.length >= 2) { setAnnouncement({ text:`❌ ${winType} already has 2 winners!`, type:"error" }); return; }
    const cs = new Set(calledNumbers);
    if (winType === "Early 5") {
      if (!playerTicket || countMarked(playerTicket, cs) < 5) {
        setAnnouncement({ text:"❌ Mark 5 numbers first for Early 5!", type:"error" }); return;
      }
    } else if (!playerTicket || !getLineWins(playerTicket, cs).includes(winType)) {
      setAnnouncement({ text:`❌ ${winType} is not complete yet!`, type:"error" }); return;
    }
    claimOrderRef.current += 1;
    const rank = existing.length + 1;
    const points = rank === 1 ? 10 : 5;
    const newClaim = { name, points, rank };
    setClaimedWins(prev => ({ ...prev, [winType]: [...existing, newClaim] }));
    setClaimDetails(prev => ({ ...prev, [`${winType}_${rank}`]: { playerName: name, drawIndex: calledNumbers.length, points, rank } }));
    const rankLabel = rank === 1 ? '🥇 1st' : '🥈 2nd';
    setAnnouncement({ text:`🎉 ${rankLabel} ${WIN_ICONS[winType]} ${winType}! +${points} pts`, type:"win" });
    addLog("claim","🏆",`YOU: ${rankLabel} ${winType}! +${points} pts`,`Round ${calledNumbers.length}`);
    if (winType === "Full House" && rank === 2) setGameOver(true);
  };

  const calledSet   = new Set(calledNumbers);
  const markedCount = playerTicket ? countMarked(playerTicket, calledSet) : 0;
  const pName       = playerName || "You";

  const BASE = {
    minHeight:"100vh",
    background:"linear-gradient(150deg,#070714 0%,#0c0c22 40%,#080818 100%)",
    color:"#fff", fontFamily:"'Rajdhani','Segoe UI',sans-serif",
    position:"relative", zIndex:1,
  };

  // ══════════════════════════════════════════════
  //  LOGIN SCREEN
  // ══════════════════════════════════════════════
  if (screen === "login") {
    const handleLogin = () => {
      if (!authUser.trim()) { setAuthError("Please enter a username."); return; }
      if (!authPass.trim()) { setAuthError("Please enter a password."); return; }
      if (authTab === "register") {
        if (registeredUsers[authUser]) { setAuthError("Username already taken."); return; }
        setRegisteredUsers(prev => ({ ...prev, [authUser]: authPass }));
        setPlayerName(authUser);
        setIsLoggedIn(true);
        setAuthError("");
        setScreen("welcome");
      } else {
        if (!registeredUsers[authUser]) { setAuthError("User not found. Please register first."); return; }
        if (registeredUsers[authUser] !== authPass) { setAuthError("Incorrect password."); return; }
        setPlayerName(authUser);
        setIsLoggedIn(true);
        setAuthError("");
        setScreen("welcome");
      }
    };
    const handleGuest = () => {
      setPlayerName(guestName.trim() || "Guest");
      setIsLoggedIn(false);
      setScreen("welcome");
    };
    return (
      <div style={{ ...BASE, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"flex-start", padding:"20px 20px" }}>
        <style>{GLOBAL_CSS}</style>
        <Stars/>
        <div style={{ position:"relative", zIndex:2, width:"100%", maxWidth:440, animation:"popIn .4s ease" }}>
          {/* Title */}
          <div style={{ textAlign:"center", marginBottom:28, paddingTop:16 }}>
            <div style={{
              fontFamily:"'Cinzel Decorative',serif",
              fontSize:"clamp(22px,6vw,38px)", fontWeight:700, letterSpacing:4,
              color:"#ffd700", lineHeight:1,
              textShadow:"0 0 40px rgba(255,215,0,.5),0 0 80px rgba(255,215,0,.2)",
            }}>TAMBOLA QUEEN</div>
            <div style={{ color:"rgba(255,255,255,.3)", fontSize:12, letterSpacing:3, marginTop:8 }}>
              Multiplayer board game · Invite friends &amp; play!
            </div>
          </div>

          {/* Card */}
          <div style={{
            background:"linear-gradient(160deg,#0e0e2c,#141445)",
            border:"1px solid rgba(255,255,255,.1)", borderRadius:20,
            padding:"28px 28px 24px", boxShadow:"0 20px 60px rgba(0,0,0,.6)",
          }}>
            {/* Tabs */}
            <div style={{ display:"flex", borderRadius:12, overflow:"hidden", marginBottom:24, border:"1px solid rgba(255,255,255,.08)" }}>
              {["login","register"].map(tab => (
                <button key={tab} onClick={() => { setAuthTab(tab); setAuthError(""); }}
                  style={{
                    flex:1, padding:"12px 0", border:"none", cursor:"pointer",
                    fontFamily:"'Rajdhani',sans-serif", fontWeight:700, fontSize:15, letterSpacing:1,
                    background: authTab===tab ? "linear-gradient(135deg,#ff1493,#cc0077)" : "rgba(255,255,255,.04)",
                    color: authTab===tab ? "#fff" : "rgba(255,255,255,.4)",
                    transition:"all .2s",
                  }}>
                  {tab.charAt(0).toUpperCase()+tab.slice(1)}
                </button>
              ))}
            </div>

            {/* Fields */}
            <div style={{ marginBottom:14 }}>
              <div style={{ color:"rgba(255,255,255,.5)", fontSize:13, marginBottom:6, letterSpacing:.5 }}>Username</div>
              <input value={authUser} onChange={e => { setAuthUser(e.target.value); setAuthError(""); }}
                onKeyDown={e => e.key==="Enter" && handleLogin()}
                placeholder="your username"
                style={{
                  width:"100%", padding:"13px 16px", borderRadius:10,
                  background:"rgba(255,255,255,.07)", border:"1px solid rgba(255,255,255,.12)",
                  color:"#fff", fontSize:15,
                }}
              />
            </div>
            <div style={{ marginBottom:authError ? 10 : 20 }}>
              <div style={{ color:"rgba(255,255,255,.5)", fontSize:13, marginBottom:6, letterSpacing:.5 }}>Password</div>
              <input type="password" value={authPass} onChange={e => { setAuthPass(e.target.value); setAuthError(""); }}
                onKeyDown={e => e.key==="Enter" && handleLogin()}
                placeholder="••••••••"
                style={{
                  width:"100%", padding:"13px 16px", borderRadius:10,
                  background:"rgba(255,255,255,.07)", border:"1px solid rgba(255,255,255,.12)",
                  color:"#fff", fontSize:15,
                }}
              />
            </div>

            {/* Error */}
            {authError && (
              <div style={{ color:"#ff5252", fontSize:13, marginBottom:12, padding:"8px 12px", background:"rgba(255,82,82,.08)", borderRadius:8, border:"1px solid rgba(255,82,82,.2)" }}>
                ⚠ {authError}
              </div>
            )}

            {/* Login button */}
            <button className="btn" onClick={handleLogin} style={{
              width:"100%", padding:"14px 0",
              background:"linear-gradient(135deg,#ff1493,#cc0077)",
              border:"none", borderRadius:12,
              color:"#fff", fontWeight:800, fontSize:16, letterSpacing:1,
              marginBottom:16,
            }}>
              {authTab === "login" ? "Log In" : "Register"}
            </button>

            {/* Divider */}
            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
              <div style={{ flex:1, height:1, background:"rgba(255,255,255,.08)" }}/>
              <span style={{ color:"rgba(255,255,255,.25)", fontSize:12 }}>or play without an account</span>
              <div style={{ flex:1, height:1, background:"rgba(255,255,255,.08)" }}/>
            </div>

            {/* Guest row */}
            <div style={{ display:"flex", gap:10 }}>
              <input value={guestName} onChange={e => setGuestName(e.target.value)}
                placeholder="Your display name (optional)"
                style={{
                  flex:1, padding:"12px 14px", borderRadius:10,
                  background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.1)",
                  color:"#fff", fontSize:14,
                }}
              />
              <button className="btn" onClick={handleGuest} style={{
                padding:"12px 18px", borderRadius:10,
                background:"rgba(255,255,255,.08)", border:"1px solid rgba(255,255,255,.2)",
                color:"#fff", fontWeight:700, fontSize:14, whiteSpace:"nowrap",
              }}>Play as Guest</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════
  //  WELCOME SCREEN
  // ══════════════════════════════════════════════
  if (screen === "welcome") return (
    <div style={{ ...BASE, display:"flex", alignItems:"center", justifyContent:"center", padding:"28px 20px" }}>
      <style>{GLOBAL_CSS}</style>
      <Stars/>
      <div style={{ position:"relative", zIndex:2, width:"100%", maxWidth:500, animation:"popIn .4s ease" }}>
        <div style={{ textAlign:"center", marginBottom:28 }}>
          <div style={{ color:"rgba(255,255,255,.7)", fontSize:22, fontWeight:600 }}>
            Welcome, <span style={{ color:"#ff1493", fontWeight:800 }}>{playerName.toUpperCase()}</span>!
          </div>
        </div>

        {/* Play with Robot */}
        <div className="btn" onClick={() => setScreen("home")} style={{
          background:"rgba(255,255,255,.05)", border:"1px solid rgba(255,255,255,.1)",
          borderRadius:18, padding:"22px 24px", marginBottom:14, cursor:"pointer",
          display:"flex", alignItems:"center", gap:18,
          transition:"all .2s",
        }}
          onMouseEnter={e => e.currentTarget.style.background="rgba(255,255,255,.09)"}
          onMouseLeave={e => e.currentTarget.style.background="rgba(255,255,255,.05)"}
        >
          <div style={{
            width:60, height:60, borderRadius:14,
            background:"linear-gradient(135deg,#ff6b6b,#ee5a24)",
            display:"flex", alignItems:"center", justifyContent:"center", fontSize:32, flexShrink:0,
          }}>🤖</div>
          <div>
            <div style={{ fontWeight:800, fontSize:18, marginBottom:4 }}>Play with Robot</div>
            <div style={{ color:"rgba(255,255,255,.45)", fontSize:14 }}>Play against AI opponents. Practice your strategy solo!</div>
          </div>
        </div>

        {/* Play with Friends */}
        <div className="btn" onClick={() => setScreen("multiplayer")} style={{
          background:"rgba(255,255,255,.05)", border:"1px solid rgba(255,255,255,.1)",
          borderRadius:18, padding:"22px 24px", marginBottom:28, cursor:"pointer",
          display:"flex", alignItems:"center", gap:18,
        }}
          onMouseEnter={e => e.currentTarget.style.background="rgba(255,255,255,.09)"}
          onMouseLeave={e => e.currentTarget.style.background="rgba(255,255,255,.05)"}
        >
          <div style={{
            width:60, height:60, borderRadius:14,
            background:"linear-gradient(135deg,#7b68ee,#5352ed)",
            display:"flex", alignItems:"center", justifyContent:"center", fontSize:32, flexShrink:0,
          }}>👥</div>
          <div>
            <div style={{ fontWeight:800, fontSize:18, marginBottom:4 }}>Play with Friends</div>
            <div style={{ color:"rgba(255,255,255,.45)", fontSize:14 }}>Create or join a room to play with real players online.</div>
          </div>
        </div>

        {/* Log out */}
        <button className="btn" onClick={() => {
          if (window.__MZEE_PLAYER__) {
            // One session for the whole site: end it at the hub, not just here.
            fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" })
              .catch(() => {})
              .then(() => { window.location.href = "/login.html"; });
            return;
          }
          setScreen("login"); setAuthUser(""); setAuthPass(""); setIsLoggedIn(false); setGuestName("");
        }} style={{
          width:"100%", padding:"13px 0",
          background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.1)",
          borderRadius:12, color:"rgba(255,255,255,.5)", fontWeight:700, fontSize:15,
        }}>Log out</button>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════
  //  MULTIPLAYER SCREEN — Create Room / Join Room
  // ══════════════════════════════════════════════
  if (screen === "multiplayer") return (
    <div style={{ ...BASE, display:"flex", alignItems:"center", justifyContent:"center", padding:"28px 20px" }}>
      <style>{GLOBAL_CSS}</style>
      <Stars/>
      <div style={{ position:"relative", zIndex:2, width:"100%", maxWidth:500, animation:"popIn .4s ease" }}>
        <div style={{ textAlign:"center", marginBottom:28 }}>
          <button onClick={() => setScreen("welcome")} style={{ background:"none", border:"none", color:"rgba(255,255,255,.35)", fontSize:13, cursor:"pointer", marginBottom:10 }}>← Back</button>
          <div style={{ fontFamily:"'Cinzel Decorative',serif", color:"#ffd700", fontSize:26, letterSpacing:4 }}>MULTIPLAYER</div>
          <div style={{ color:"rgba(255,255,255,.3)", fontSize:13, marginTop:6 }}>Create a private room or join one</div>
        </div>

        {/* Create Room */}
        <div style={{
          background:"linear-gradient(135deg,rgba(8,35,18,.96),rgba(15,65,35,.96))",
          border:"2px solid #00e676", borderRadius:18, padding:"24px 28px", marginBottom:14,
        }}>
          <div style={{ display:"flex", alignItems:"center", gap:20, marginBottom:16 }}>
            <span style={{ fontSize:44 }}>🏠</span>
            <div>
              <div style={{ fontWeight:800, fontSize:20, color:"#00e676", marginBottom:4 }}>Create Room</div>
              <div style={{ color:"rgba(255,255,255,.45)", fontSize:14 }}>Host sets max players, then shares the code</div>
            </div>
          </div>
          {/* Max player selector */}
          <div style={{ marginBottom:14 }}>
            <div style={{ color:"rgba(0,230,118,.5)", fontSize:9, letterSpacing:3, marginBottom:8 }}>SELECT MAX PLAYERS (HOST ONLY)</div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:6 }}>
              {[2,3,4,5,6].map(n => (
                <button key={n} onClick={() => setMaxPlayers(n)} style={{
                  padding:"10px 4px", borderRadius:10, cursor:"pointer", textAlign:"center",
                  background: maxPlayers===n ? "rgba(0,230,118,.2)" : "rgba(255,255,255,.04)",
                  border:`2px solid ${maxPlayers===n ? "#00e676" : "rgba(255,255,255,.1)"}`,
                  color: maxPlayers===n ? "#00e676" : "rgba(255,255,255,.4)",
                  fontWeight:800, fontSize:16, transition:"all .15s",
                }}>{n}</button>
              ))}
            </div>
            <div style={{ color:"rgba(255,255,255,.3)", fontSize:11, marginTop:6, textAlign:"center" }}>
              Max {maxPlayers} players · Game auto-starts after 60s or when room is full
            </div>
          </div>
          <button className="btn" onClick={() => {
            const code = String(Math.floor(100000 + Math.random() * 900000));
            setCreatedRoomCode(code);
            setRoomCode(code);
            setIsHost(true);
            isHostRef.current = true;
            setRoomPlayers([{ name: playerName, isHost: true, online: true }]);
            setJoinError("");
            setLobbyCountdown(60);
            setScreen("lobby");
            const send = () => {
              if (wsRef.current?.readyState === 1) {
                wsRef.current.send(JSON.stringify({ type: 'create_room', code, playerName, maxPlayers }));
              } else { setTimeout(send, 200); }
            };
            send();
          }} style={{
            width:"100%", padding:"13px", borderRadius:12,
            background:"linear-gradient(135deg,#00e676,#00b85a)",
            border:"none", color:"#000", fontWeight:800, fontSize:16, cursor:"pointer",
          }}>🏠 Create Room ({maxPlayers} players max)</button>
        </div>

        {/* Join Room */}
        <div style={{
          background:"linear-gradient(135deg,rgba(18,8,35,.96),rgba(45,15,65,.96))",
          border:"2px solid #7c73e6", borderRadius:18, padding:"24px 28px",
          marginBottom:14,
        }}>
          <div style={{ display:"flex", alignItems:"center", gap:20, marginBottom:16 }}>
            <span style={{ fontSize:44 }}>🔑</span>
            <div>
              <div style={{ fontWeight:800, fontSize:20, color:"#7c73e6", marginBottom:4 }}>Join Room</div>
              <div style={{ color:"rgba(255,255,255,.45)", fontSize:14 }}>Enter the 6-digit code to join a friend's room</div>
            </div>
          </div>
          <div style={{ display:"flex", gap:10 }}>
            <input value={joinInput}
              onChange={e => { setJoinInput(e.target.value.replace(/\D/g,"").slice(0,6)); setJoinError(""); }}
              onKeyDown={e => { if (e.key==="Enter") {
                if (joinInput.length < 6) { setJoinError("Please enter a 6-digit code."); return; }
                setRoomCode(joinInput); setIsHost(false); isHostRef.current = false;
                setRoomPlayers([{ name: playerName, isHost: false, online: true }]);
                setJoinError(""); setScreen("lobby");
                const send = () => {
                  if (wsRef.current?.readyState === 1) {
                    wsRef.current.send(JSON.stringify({ type: 'join_room', code: joinInput, playerName }));
                  } else { setTimeout(send, 200); }
                };
                send();
              }}}
              placeholder="Enter 6-digit code"
              style={{
                flex:1, padding:"13px 16px", borderRadius:10,
                background:"rgba(255,255,255,.07)", border:`1px solid ${joinError ? "#ff5252" : "rgba(255,255,255,.15)"}`,
                color:"#fff", fontSize:16, letterSpacing:6, fontWeight:700,
              }}
            />
            <button className="btn" onClick={() => {
              if (joinInput.length < 6) { setJoinError("Please enter a 6-digit code."); return; }
              setRoomCode(joinInput); setIsHost(false); isHostRef.current = false;
              setRoomPlayers([{ name: playerName, isHost: false, online: true }]);
              setJoinError(""); setScreen("lobby");
              const send = () => {
                if (wsRef.current?.readyState === 1) {
                  wsRef.current.send(JSON.stringify({ type: 'join_room', code: joinInput, playerName }));
                } else { setTimeout(send, 200); }
              };
              send();
            }} style={{
              padding:"13px 22px", borderRadius:10,
              background:"linear-gradient(135deg,#7c73e6,#5352ed)",
              border:"none", color:"#fff", fontWeight:800, fontSize:15,
            }}>JOIN</button>
          </div>
          {joinError && (
            <div style={{
              marginTop:10, padding:"9px 14px", borderRadius:9,
              background:"rgba(255,82,82,.1)", border:"1px solid rgba(255,82,82,.3)",
              color:"#ff5252", fontSize:13, fontWeight:700,
              animation:"popIn .2s ease",
            }}>⚠ {joinError}</div>
          )}
          <div style={{ marginTop:14 }}>
            <button className="btn" onClick={() => { setJoinInput(""); setJoinError(""); setScreen("welcome"); }} style={{
              background:"transparent", border:"none",
              color:"rgba(255,255,255,.35)", fontSize:13, cursor:"pointer", padding:0,
            }}>← Back to Menu</button>
          </div>
        </div>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════
  //  HOME SCREEN  (Robot mode — reached from Welcome)
  // ══════════════════════════════════════════════
  if (screen === "home") return (
    <div style={{ ...BASE, display:"flex", alignItems:"center", justifyContent:"center", padding:"28px 20px" }}>
      <style>{GLOBAL_CSS}</style>
      <Stars/>
      {[700,520,350].map((s,i) => (
        <div key={i} style={{
          position:"fixed", width:s, height:s, borderRadius:"50%",
          border:`1px solid rgba(255,215,0,${.025+i*.015})`,
          top:"50%", left:"50%", transform:"translate(-50%,-50%)",
          pointerEvents:"none", zIndex:0,
        }}/>
      ))}

      <div style={{ position:"relative", zIndex:2, width:"100%", maxWidth:500, animation:"popIn .45s ease" }}>

        {/* Back + Logo */}
        <div style={{ textAlign:"center", marginBottom:38 }}>
          <button onClick={() => setScreen("welcome")} style={{ background:"none", border:"none", color:"rgba(255,255,255,.35)", fontSize:13, cursor:"pointer", display:"block", margin:"0 auto 12px" }}>← Back</button>
          <div style={{
            fontFamily:"'Cinzel Decorative',serif",
            fontSize:"clamp(24px,6vw,40px)", fontWeight:700, letterSpacing:5,
            color:"#ffd700", lineHeight:1,
            textShadow:"0 0 40px rgba(255,215,0,.5),0 0 80px rgba(255,215,0,.2)",
          }}>TAMBOLA QUEEN</div>
          <div style={{ fontFamily:"'Cinzel',serif", color:"rgba(255,215,0,.38)", letterSpacing:7, fontSize:10, marginTop:12 }}>
            ✦ THE ULTIMATE HOUSIE EXPERIENCE ✦
          </div>
        </div>

        {/* VS Computer */}
        <div style={{
          background:"linear-gradient(135deg,rgba(18,18,65,.96),rgba(30,30,100,.96))",
          border:"2px solid #ffd700", borderRadius:18, marginBottom:12, overflow:"hidden",
          boxShadow:"0 4px 24px rgba(255,215,0,.1)",
        }}>
          <div style={{ display:"flex", alignItems:"center", gap:16, padding:"16px 20px 12px" }}>
            <span style={{ fontSize:36 }}>🤖</span>
            <div>
              <div style={{ fontWeight:700, fontSize:17, letterSpacing:1 }}>Play vs Computer</div>
              <div style={{ color:"rgba(255,255,255,.38)", fontSize:13, marginTop:2 }}>Choose how many AI bots to face</div>
            </div>
          </div>
          <div style={{ padding:"0 16px 16px" }}>
            <div style={{ color:"rgba(255,215,0,.45)", fontSize:9, letterSpacing:3, marginBottom:8 }}>SELECT NUMBER OF OPPONENTS</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
              {[
                { count:1, label:"1 Bot",  sub:"2 players total", icon:"🤖" },
                { count:3, label:"3 Bots", sub:"4 players total", icon:"👥" },
                { count:5, label:"5 Bots", sub:"6 players total", icon:"🎪" },
              ].map(opt => (
                <button key={opt.count} className="btn"
                  onClick={() => startGame("computer", BOT_POOL.slice(0, opt.count))}
                  style={{
                    padding:"13px 8px", borderRadius:14,
                    background:"rgba(255,215,0,.07)", border:"2px solid rgba(255,215,0,.3)",
                    color:"#fff", textAlign:"center",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background="rgba(255,215,0,.18)"; e.currentTarget.style.borderColor="#ffd700"; }}
                  onMouseLeave={e => { e.currentTarget.style.background="rgba(255,215,0,.07)"; e.currentTarget.style.borderColor="rgba(255,215,0,.3)"; }}
                >
                  <div style={{ fontSize:22, marginBottom:4 }}>{opt.icon}</div>
                  <div style={{ fontWeight:800, fontSize:17, color:"#ffd700" }}>{opt.label}</div>
                  <div style={{ fontSize:11, color:"rgba(255,255,255,.35)", marginTop:2 }}>{opt.sub}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* How to Play */}
        <div style={{ textAlign:"center", marginTop:18 }}>
          <button onClick={() => setShowHowTo(!showHowTo)} style={{
            background:"transparent", border:"none",
            color:"rgba(255,215,0,.38)", fontSize:13, cursor:"pointer", letterSpacing:1,
          }}>{showHowTo ? "▲ Hide Rules" : "▼ How to Play"}</button>
          {showHowTo && (
            <div style={{
              marginTop:12, background:"rgba(255,215,0,.04)", border:"1px solid rgba(255,215,0,.12)",
              borderRadius:14, padding:"14px 18px", textAlign:"left",
              color:"rgba(255,255,255,.6)", fontSize:13, lineHeight:1.8, animation:"popIn .3s ease",
            }}>
              <div style={{ color:"#ffd700", fontWeight:700, marginBottom:6, fontSize:14 }}>📖 How to Play</div>
              <div>• Numbers 1–90 are called one by one</div>
              <div>• Numbers on your ticket highlight automatically</div>
              <div>• Claim wins as soon as you complete a pattern:</div>
              <div style={{ paddingLeft:16, marginTop:3 }}>
                {WIN_ORDER.map(w => (
                  <div key={w}>{WIN_ICONS[w]} <strong>{w}</strong>
                    {w==="Early 5"?" – first 5 marked":w==="Full House"?" – all 15 numbers":" – complete that row"}
                  </div>
                ))}
              </div>
              <div style={{ marginTop:7, color:"rgba(255,215,0,.6)" }}>⚡ Click CLAIM before someone else does!</div>
            </div>
          )}
        </div>
        <div style={{ textAlign:"center", marginTop:20, color:"rgba(255,255,255,.08)", fontSize:11, letterSpacing:2 }}>
          TAMBOLA QUEEN v1.0 · Made with ♥
        </div>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════
  //  LOBBY
  // ══════════════════════════════════════════════

  if (screen === "lobby") {
    const playerCount = roomPlayers.length;
    const canStart = isHost && playerCount >= 2;

    const handleStartGame = () => {
      if (!canStart) return;
      setLobbyCountdown(0);
      wsRef.current?.send(JSON.stringify({ type: 'start_game', code: roomCode }));
      startGame("private", []);
    };

    return (
      <div style={{ ...BASE, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
        <style>{GLOBAL_CSS}</style>
        <Stars/>
        <div style={{
          position:"relative", zIndex:2,
          background:"linear-gradient(135deg,#0e0e2c,#141440)",
          border:"2px solid rgba(255,255,255,.1)", borderRadius:24, padding:"36px 32px",
          maxWidth:480, width:"100%",
          boxShadow:"0 0 60px rgba(0,0,0,.6),0 20px 60px rgba(0,0,0,.5)",
          animation:"popIn .4s ease",
        }}>
          {/* Share code */}
          <div style={{ textAlign:"center", marginBottom:20 }}>
            <div style={{ color:"rgba(255,255,255,.4)", fontSize:12, letterSpacing:3, marginBottom:14 }}>Share this code with friends</div>
            <div style={{
              fontSize:58, fontWeight:900, letterSpacing:14, fontFamily:"'Rajdhani',sans-serif",
              color:"#ff1493", lineHeight:1,
              textShadow:"0 0 30px rgba(255,20,147,.5)",
              animation:"numPulse 2s ease-in-out infinite",
            }}>{roomCode}</div>
          </div>

          {/* Copy code */}
          <div style={{ textAlign:"center", marginBottom:24 }}>
            <button className="btn" onClick={() => navigator.clipboard?.writeText(roomCode)} style={{
              background:"rgba(255,255,255,.08)", border:"1px solid rgba(255,255,255,.18)",
              borderRadius:10, padding:"9px 22px",
              color:"rgba(255,255,255,.7)", fontWeight:700, fontSize:13,
            }}>📋 Copy code</button>
          </div>

          {/* Players list */}
          <div style={{
            background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.1)",
            borderRadius:16, padding:"16px 18px", marginBottom:20,
          }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
              <div style={{ color:"rgba(255,255,255,.5)", fontSize:13, fontWeight:700 }}>
                Players ({playerCount}/{maxPlayers})
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                {/* 60s lobby countdown for host */}
                {isHost && lobbyCountdown > 0 && (
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <div style={{
                      width:34, height:34, borderRadius:"50%",
                      border:`3px solid ${lobbyCountdown <= 15 ? "#ff5252" : "#ffd700"}`,
                      display:"flex", alignItems:"center", justifyContent:"center",
                      color: lobbyCountdown <= 15 ? "#ff5252" : "#ffd700",
                      fontWeight:900, fontSize:13,
                      animation: lobbyCountdown <= 15 ? "pulse .6s ease-in-out infinite" : "none",
                    }}>{lobbyCountdown}</div>
                    <span style={{ color:"rgba(255,255,255,.35)", fontSize:11 }}>auto-start</span>
                  </div>
                )}
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <div style={{ width:7, height:7, borderRadius:"50%", background:"#00e676", animation:"pulse 1.4s ease-in-out infinite" }}/>
                  <span style={{ color:"rgba(0,230,118,.6)", fontSize:11, fontWeight:700, letterSpacing:1 }}>LIVE</span>
                </div>
              </div>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {roomPlayers.map((p, i) => (
                <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"9px 12px", background:"rgba(255,255,255,.03)", borderRadius:10, border:"1px solid rgba(255,255,255,.06)" }}>
                  <div style={{
                    width:38, height:38, borderRadius:"50%",
                    background: p.isHost ? "rgba(255,215,0,.2)" : "rgba(255,255,255,.12)",
                    border: p.isHost ? "2px solid rgba(255,215,0,.5)" : "2px solid rgba(255,255,255,.1)",
                    display:"flex", alignItems:"center", justifyContent:"center",
                    fontSize:18, flexShrink:0,
                  }}>{p.isHost ? "👑" : "🧍"}</div>
                  <div style={{ flex:1 }}>
                    <span style={{ fontWeight:700, fontSize:15 }}>{p.name}</span>
                    {p.isHost && <span style={{ color:"rgba(255,215,0,.8)", fontSize:11, marginLeft:8, fontWeight:700 }}>(host)</span>}
                  </div>
                  <div style={{ width:10, height:10, borderRadius:"50%", background:"#00e676", boxShadow:"0 0 6px #00e676" }}/>
                </div>
              ))}
            </div>
            {playerCount < 2 && (
              <div style={{ color:"rgba(255,255,255,.3)", fontSize:13, marginTop:14, textAlign:"center", animation:"pulse 2s ease-in-out infinite" }}>
                ⏳ Waiting for at least 1 more player…
              </div>
            )}
            {playerCount >= 2 && isHost && (
              <div style={{ color:"rgba(0,230,118,.8)", fontSize:13, marginTop:14, textAlign:"center", fontWeight:700 }}>
                ✅ {playerCount} players ready — tap Start Game!
              </div>
            )}
            {playerCount >= 2 && !isHost && (
              <div style={{ color:"rgba(255,215,0,.6)", fontSize:13, marginTop:14, textAlign:"center", animation:"pulse 2s ease-in-out infinite" }}>
                ⏳ Waiting for host to start the game…
              </div>
            )}
          </div>

          {/* Buttons */}
          <div style={{ display:"flex", gap:12 }}>
            <button className="btn" onClick={() => {
              wsRef.current?.send(JSON.stringify({ type:'leave_room', code: roomCode, playerName }));
              setScreen("multiplayer");
            }} style={{
              flex:1, padding:"13px 0", borderRadius:12,
              background:"transparent", border:"1px solid rgba(255,255,255,.12)",
              color:"rgba(255,255,255,.45)", fontSize:14, fontWeight:700,
            }}>← Back</button>

            {isHost ? (
              <button className="btn" onClick={handleStartGame} style={{
                flex:2, padding:"13px 0", borderRadius:12,
                background: canStart ? "linear-gradient(135deg,#ffd700,#ff9500)" : "rgba(255,255,255,.06)",
                border: canStart ? "none" : "1px solid rgba(255,255,255,.08)",
                color: canStart ? "#000" : "rgba(255,255,255,.2)",
                fontWeight:800, fontSize:16,
                cursor: canStart ? "pointer" : "default",
                transition:"all .2s",
              }}>{canStart ? "🚀 Start Game" : "Waiting for players…"}</button>
            ) : (
              <div style={{
                flex:2, padding:"13px 0", borderRadius:12,
                background:"rgba(255,215,0,.05)", border:"1px solid rgba(255,215,0,.15)",
                color:"rgba(255,215,0,.5)", fontSize:14, fontWeight:700,
                textAlign:"center", display:"flex", alignItems:"center", justifyContent:"center",
              }}>⏳ Waiting for host to start…</div>
            )}
          </div>
        </div>
      </div>
    );
  }


  // ══════════════════════════════════════════════
  //  GAME SCREEN
  // ══════════════════════════════════════════════
  if (screen === "game") {
    const TAB_STYLE = (active) => ({
      flex:1, padding:"9px 6px",
      background: active ? "rgba(255,215,0,.12)" : "transparent",
      border:`1px solid ${active ? "rgba(255,215,0,.4)" : "rgba(255,255,255,.08)"}`,
      borderRadius:10, color: active ? "#ffd700" : "rgba(255,255,255,.4)",
      fontWeight:700, fontSize:12, letterSpacing:1, cursor:"pointer",
      transition:"all .15s ease",
    });

    return (
      <div style={{ ...BASE, padding:"10px 12px" }}>
        <style>{GLOBAL_CSS}</style>

        {/* Toast */}
        {announcement && (
          <div style={{
            position:"fixed", top:18, left:"50%",
            animation:"fadeSlideDown .35s ease forwards",
            background:
              announcement.type==="error" ? "linear-gradient(135deg,#5a0000,#990000)" :
              announcement.type==="win"   ? "linear-gradient(135deg,#094020,#0d7040)" :
                                            "linear-gradient(135deg,#14146b,#2020bb)",
            border:`2px solid ${announcement.type==="error"?"#ff5252":announcement.type==="win"?"#00e676":"#ffd700"}`,
            borderRadius:14, padding:"12px 28px",
            color:"#fff", fontSize:15, fontWeight:700,
            zIndex:9999, whiteSpace:"nowrap",
            boxShadow:"0 8px 40px rgba(0,0,0,.7)",
          }}>{announcement.text}</div>
        )}

        {/* Results Modal */}
        {showResults && (
          <ResultsModal
            results={finalResults}
            claimedWins={claimedWins}
            claimDetails={claimDetails}
            calledNumbers={calledNumbers}
            playerName={pName}
            gameMode={gameMode}
            roomPlayers={roomPlayers}
            playerTicket={playerTicket}
            allTickets={allTickets}
            botTickets={botTickets}
            bots={bots}
            onClose={() => setShowResults(false)}
          />
        )}

        {/* Frozen overlay — poll in progress */}
        {gameFrozen && endPoll && (
          <div style={{
            position:"fixed", inset:0, zIndex:8000,
            background:"rgba(0,0,0,.7)", backdropFilter:"blur(4px)",
            display:"flex", alignItems:"center", justifyContent:"center", padding:20,
          }}>
            <div style={{
              background:"linear-gradient(135deg,#0e0e2c,#1a1a40)",
              border:"2px solid rgba(124,115,230,.5)", borderRadius:20,
              padding:"32px 36px", maxWidth:420, width:"100%", textAlign:"center",
              animation:"popIn .35s ease",
            }}>
              <div style={{ fontSize:44, marginBottom:12 }}>🗳</div>
              <div style={{ fontFamily:"'Cinzel',serif", color:"#ffd700", fontSize:20, marginBottom:8 }}>End Game Poll</div>
              <div style={{ color:"rgba(255,255,255,.5)", fontSize:13, marginBottom:20 }}>
                <strong style={{color:"#fff"}}>{endPoll.initiator}</strong> wants to end the game.
              </div>
              {/* Countdown ring */}
              <div style={{ display:"flex", justifyContent:"center", marginBottom:20 }}>
                <div style={{
                  width:72, height:72, borderRadius:"50%",
                  border:`5px solid ${pollCountdown <= 15 ? "#ff5252" : "#7c73e6"}`,
                  display:"flex", alignItems:"center", justifyContent:"center",
                  color: pollCountdown <= 15 ? "#ff5252" : "#a09af0",
                  fontWeight:900, fontSize:28,
                  animation: pollCountdown <= 15 ? "pulse .5s ease-in-out infinite" : "none",
                }}>{pollCountdown}</div>
              </div>
              {/* Vote buttons — only if haven't voted */}
              {!endPoll.votes?.[playerName] ? (
                <div style={{ display:"flex", gap:12, marginBottom:16 }}>
                  <button onClick={() => wsRef.current?.send(JSON.stringify({ type:'vote_end', code:multiRoomRef.current, playerName, vote:'yes' }))}
                    style={{ flex:1, padding:"13px", borderRadius:12, background:"linear-gradient(135deg,#00c851,#009c40)", border:"none", color:"#fff", fontWeight:800, fontSize:15, cursor:"pointer" }}>
                    ✅ Yes, End
                  </button>
                  <button onClick={() => wsRef.current?.send(JSON.stringify({ type:'vote_end', code:multiRoomRef.current, playerName, vote:'no' }))}
                    style={{ flex:1, padding:"13px", borderRadius:12, background:"linear-gradient(135deg,#ff4444,#cc0000)", border:"none", color:"#fff", fontWeight:800, fontSize:15, cursor:"pointer" }}>
                    ❌ No, Continue
                  </button>
                </div>
              ) : (
                <div style={{ color: endPoll.votes[playerName]==='yes' ? "#00e676" : "#ff5252", fontWeight:700, fontSize:15, marginBottom:16 }}>
                  {endPoll.votes[playerName]==='yes' ? "✅ You voted Yes" : "❌ You voted No"} — waiting for others…
                </div>
              )}
              {/* Vote status */}
              <div style={{ display:"flex", gap:6, flexWrap:"wrap", justifyContent:"center" }}>
                {roomPlayers.map(p => {
                  const v = endPoll.votes?.[p.name];
                  return (
                    <div key={p.name} style={{
                      display:"flex", alignItems:"center", gap:5, padding:"4px 12px",
                      background: v==='yes' ? "rgba(0,230,118,.12)" : v==='no' ? "rgba(255,82,82,.12)" : v==='timeout' ? "rgba(255,165,0,.1)" : "rgba(255,255,255,.05)",
                      border:`1px solid ${v==='yes' ? "rgba(0,230,118,.35)" : v==='no' ? "rgba(255,82,82,.35)" : v==='timeout' ? "rgba(255,165,0,.3)" : "rgba(255,255,255,.1)"}`,
                      borderRadius:20, fontSize:12,
                    }}>
                      <span>{v==='yes'?'✅':v==='no'?'❌':v==='timeout'?'⏳':'○'}</span>
                      <span style={{ color: v ? "#fff" : "rgba(255,255,255,.4)" }}>{p.name}</span>
                    </div>
                  );
                })}
              </div>
              <div style={{ color:"rgba(255,255,255,.25)", fontSize:11, marginTop:12 }}>
                {Object.values(endPoll.votes||{}).filter(v=>v==='yes').length} yes · {Object.values(endPoll.votes||{}).filter(v=>v==='no').length} no · {roomPlayers.length - Object.keys(endPoll.votes||{}).length} pending
              </div>
            </div>
          </div>
        )}

        {/* Log full-screen overlay */}
        {logExpanded && (
          <GameLog logs={gameLogs} expanded={true} onToggle={() => setLogExpanded(false)}/>
        )}

        <div style={{ maxWidth:1400, margin:"0 auto" }}>

          {/* Header */}
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
            <button className="btn" onClick={() => { setIsAutoPlay(false); setTimerActive(false); setScreen("welcome"); }} style={{
              background:"rgba(255,255,255,.05)", border:"1px solid rgba(255,255,255,.1)",
              borderRadius:10, padding:"7px 15px", color:"rgba(255,255,255,.5)", fontSize:13,
            }}>← Exit</button>
            <div style={{ fontFamily:"'Cinzel Decorative',serif", color:"#ffd700", fontSize:16, letterSpacing:4, textShadow:"0 0 20px rgba(255,215,0,.3)" }}>TAMBOLA QUEEN</div>
            <div style={{ display:"flex", gap:10, alignItems:"center" }}>
              <span style={{ color:"rgba(255,255,255,.35)", fontSize:13 }}>{calledNumbers.length} / 90</span>
              {gameMode === "private" && currentTurnPlayer && !gameOver && (
                <span style={{
                  fontSize:12, fontWeight:700, padding:"4px 10px", borderRadius:8,
                  background: currentTurnPlayer === playerName ? "rgba(0,230,118,.15)" : "rgba(255,215,0,.08)",
                  border: `1px solid ${currentTurnPlayer === playerName ? "rgba(0,230,118,.4)" : "rgba(255,215,0,.2)"}`,
                  color: currentTurnPlayer === playerName ? "#00e676" : "rgba(255,215,0,.7)",
                  animation: currentTurnPlayer === playerName ? "pulse 1s ease-in-out infinite" : "none",
                }}>
                  {currentTurnPlayer === playerName ? "🎱 YOUR TURN" : `⏳ ${currentTurnPlayer}'s turn`}
                </span>
              )}
              {gameOver && <span style={{ color:"#ff5252", fontWeight:700, fontSize:13, letterSpacing:1 }}>GAME OVER</span>}
              <button className="btn" onClick={() => {
                if (!document.fullscreenElement) {
                  document.documentElement.requestFullscreen?.();
                } else {
                  document.exitFullscreen?.();
                }
              }} style={{
                background:"rgba(255,255,255,.1)", border:"1px solid #fff",
                borderRadius:9, padding:"6px 12px",
                color:"#fff", fontSize:14, fontWeight:700, letterSpacing:.5,
              }} title="Toggle fullscreen">⛶ Full Screen</button>
            </div>
          </div>

          {/* 3-column layout */}
          <div style={{ display:"grid", gridTemplateColumns:"320px 1fr 300px", gap:12 }}>

            {/* ══ COL 1 — Number board + controls ══ */}
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>

              {/* Big number */}
              <div style={{
                background:"linear-gradient(135deg,#0d0d28,#121238)",
                border:"2px solid #ffd700", borderRadius:16, padding:"18px 14px",
                textAlign:"center", boxShadow:"0 0 28px rgba(255,215,0,.07)",
              }}>
                <div style={{ color:"rgba(255,215,0,.4)", fontSize:9, letterSpacing:5, marginBottom:5 }}>CURRENT NUMBER</div>
                <div style={{
                  fontFamily:"'Rajdhani',sans-serif",
                  fontSize:96, fontWeight:700, lineHeight:1, color:"#ffd700", minHeight:96,
                  display:"flex", alignItems:"center", justifyContent:"center",
                  animation: currentNum ? "numPulse 2s ease-in-out infinite" : "none",
                }}>{currentNum || "•"}</div>
                <div style={{ color:"rgba(255,255,255,.18)", fontSize:11, marginTop:7, letterSpacing:1 }}>
                  {calledNumbers.length > 1
                    ? `Prev: ${[...calledNumbers].slice(-4,-1).reverse().join(" · ")}`
                    : "Press Draw or Auto to begin"}
                </div>
              </div>

              {/* Draw controls */}
              <div style={{ background:"linear-gradient(135deg,#0d0d28,#121238)", border:"1px solid rgba(255,255,255,.08)", borderRadius:14, padding:12 }}>
                {/* Turn Timer */}
                <div style={{
                  display:"flex", alignItems:"center", justifyContent:"space-between",
                  marginBottom:9, padding:"8px 12px",
                  background: timerActive ? (turnTimer <= 10 ? "rgba(255,82,82,.12)" : "rgba(0,230,118,.07)") : "rgba(255,255,255,.03)",
                  border:`1px solid ${timerActive ? (turnTimer <= 10 ? "rgba(255,82,82,.4)" : "rgba(0,230,118,.25)") : "rgba(255,255,255,.07)"}`,
                  borderRadius:10,
                }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{ fontSize:16 }}>⏱</span>
                    <span style={{ color:"rgba(255,255,255,.5)", fontSize:12, fontWeight:700, letterSpacing:1 }}>TURN TIMER</span>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    {timerActive && (
                      <span style={{
                        fontSize:22, fontWeight:900,
                        color: turnTimer <= 10 ? "#ff5252" : "#00e676",
                        animation: turnTimer <= 10 ? "pulse .6s ease-in-out infinite" : "none",
                        minWidth:36, textAlign:"right",
                      }}>{turnTimer}s</span>
                    )}
                    <button className="btn" onClick={() => setTimerActive(!timerActive)} disabled={gameOver} style={{
                      padding:"5px 12px", borderRadius:8, fontSize:11, fontWeight:700,
                      background: timerActive ? "rgba(255,82,82,.15)" : "rgba(0,230,118,.12)",
                      border:`1px solid ${timerActive ? "rgba(255,82,82,.4)" : "rgba(0,230,118,.35)"}`,
                      color: timerActive ? "#ff5252" : "#00e676", cursor:"pointer",
                    }}>{timerActive ? "Stop" : "Start"}</button>
                  </div>
                </div>
                <div style={{ display:"flex", gap:8, marginBottom:9 }}>
                  {/* In multiplayer: show draw button only on your turn */}
                  {gameMode === "private" ? (
                    currentTurnPlayer === playerName ? (<>
                      <button className="btn" onClick={callNumber} disabled={gameOver}
                        style={{
                          flex:1, padding:"11px 6px",
                          background: gameOver ? "rgba(50,50,50,.5)" : "linear-gradient(135deg,#00e676,#00b85a)",
                          border:"none", borderRadius:11,
                          color: gameOver ? "#444" : "#000", fontWeight:800, fontSize:15,
                          cursor: gameOver ? "default" : "pointer",
                          animation:"winGlow 1.5s ease-in-out infinite",
                        }}>🎱 Your Turn — Draw!</button>
                      <button className="btn" onClick={() => setIsAutoPlay(!isAutoPlay)} disabled={gameOver} style={{
                        flex:1, padding:"11px 6px",
                        background: isAutoPlay ? "linear-gradient(135deg,rgba(160,0,0,.9),rgba(210,0,0,.9))"
                                               : "linear-gradient(135deg,rgba(0,70,25,.9),rgba(0,120,45,.9))",
                        border:`2px solid ${isAutoPlay ? "#ff5252" : "#00e676"}`,
                        borderRadius:11, color:"#fff", fontWeight:700, fontSize:15, cursor:"pointer",
                      }}>{isAutoPlay ? "⏸ Pause" : "▶ Auto"}</button>
                    </>) : (
                      <div style={{
                        flex:1, padding:"13px 8px", borderRadius:11, textAlign:"center",
                        background:"rgba(255,215,0,.05)", border:"1px solid rgba(255,215,0,.15)",
                        color:"rgba(255,215,0,.7)", fontSize:13, fontWeight:700,
                        animation:"pulse 1.5s ease-in-out infinite",
                      }}>⏳ {currentTurnPlayer ? `${currentTurnPlayer}'s turn to draw…` : "Waiting…"}</div>
                    )
                  ) : (<>
                  <button className="btn" onClick={callNumber}
                    disabled={gameOver || poolRef.current.length === 0}
                    style={{
                      flex:1, padding:"11px 6px",
                      background: gameOver ? "rgba(50,50,50,.5)" : "linear-gradient(135deg,#ffd700,#ff9500)",
                      border:"none", borderRadius:11,
                      color: gameOver ? "#444" : "#000", fontWeight:800, fontSize:15,
                      cursor: gameOver ? "default" : "pointer",
                    }}>🎱 Draw</button>
                  <button className="btn" onClick={() => setIsAutoPlay(!isAutoPlay)} disabled={gameOver} style={{
                    flex:1, padding:"11px 6px",
                    background: isAutoPlay ? "linear-gradient(135deg,rgba(160,0,0,.9),rgba(210,0,0,.9))"
                                           : "linear-gradient(135deg,rgba(0,70,25,.9),rgba(0,120,45,.9))",
                    border:`2px solid ${isAutoPlay ? "#ff5252" : "#00e676"}`,
                    borderRadius:11, color:"#fff", fontWeight:700, fontSize:15, cursor:"pointer",
                  }}>{isAutoPlay ? "⏸ Pause" : "▶ Auto"}</button>
                  </>)}
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <span style={{ color:"rgba(255,255,255,.3)", fontSize:11, minWidth:36 }}>Speed</span>
                  <input type="range" min={1} max={5} value={speed}
                    onChange={e => setSpeed(Number(e.target.value))}
                    style={{ flex:1, accentColor:"#ffd700", cursor:"pointer" }}
                  />
                  <span style={{ color:"#ffd700", fontSize:11, fontWeight:700, minWidth:46, textAlign:"right" }}>
                    {["","Slow","Easy","Medium","Quick","Fast"][speed]}
                  </span>
                </div>
              </div>

              {/* Number Board — all 90 full numbers */}
              <div style={{
                background:"linear-gradient(135deg,#0d0d28,#121238)",
                border:"1px solid rgba(255,255,255,.08)", borderRadius:14, padding:12, flex:1,
              }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:9 }}>
                  <div style={{ color:"rgba(255,255,255,.22)", fontSize:9, letterSpacing:4 }}>NUMBER BOARD 1–90</div>
                  <div style={{ color:"rgba(255,215,0,.5)", fontSize:10, fontWeight:700 }}>
                    {calledNumbers.length} called
                  </div>
                </div>

                {/* 9 rows × 10 cols */}
                <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                  {Array.from({ length: 9 }, (_, row) => (
                    <div key={row} style={{ display:"grid", gridTemplateColumns:"repeat(10,1fr)", gap:2 }}>
                      {Array.from({ length: 10 }, (_, col) => {
                        const n     = row * 10 + col + 1;
                        if (n > 90) return <div key={col}/>;
                        const called = calledSet.has(n);
                        const curr   = n === currentNum;
                        return (
                          <div key={col} className="num" style={{
                            height:24,
                            display:"flex", alignItems:"center", justifyContent:"center",
                            borderRadius:5, fontSize:10, fontWeight: curr||called ? 800 : 500,
                            background: curr   ? "#ff1744"
                                      : called ? "linear-gradient(135deg,#ffd700,#ff9500)"
                                      :          "rgba(255,255,255,.04)",
                            color: curr||called ? "#000" : "rgba(255,255,255,.3)",
                            boxShadow: curr   ? "0 0 12px rgba(255,23,68,.9)"
                                     : called ? "0 0 5px rgba(255,215,0,.35)"
                                     : "none",
                            transform: curr ? "scale(1.3)" : "scale(1)",
                            zIndex: curr ? 2 : 0, position:"relative",
                          }}>{n}</div>
                        );
                      })}
                    </div>
                  ))}
                </div>

                <div style={{ display:"flex", gap:12, marginTop:9, justifyContent:"center" }}>
                  {[
                    { c:"#ff1744", l:"Current" },
                    { c:"#ffd700", l:"Called" },
                    { c:"rgba(255,255,255,.08)", l:"Pending" },
                  ].map(x => (
                    <div key={x.l} style={{ display:"flex", alignItems:"center", gap:4, fontSize:9, color:"rgba(255,255,255,.22)" }}>
                      <div style={{ width:9, height:9, borderRadius:3, background:x.c }}/>{x.l}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ══ COL 2 — Tickets tabs ══ */}
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>

              {/* Tab switcher */}
              <div style={{ display:"flex", gap:6 }}>
                <button style={TAB_STYLE(activeTab==="board")} onClick={() => setActiveTab("board")}>📋 My Ticket</button>
                {(bots.length > 0 || gameMode === "private") && (
                  <button style={TAB_STYLE(activeTab==="tickets")} onClick={() => setActiveTab("tickets")}>
                    🎫 All Tickets ({gameMode === "private" ? roomPlayers.length : bots.length + 1})
                  </button>
                )}
                <button style={TAB_STYLE(activeTab==="log")} onClick={() => setActiveTab("log")}>📝 Game Log</button>
              </div>

              {/* ── Tab: My Ticket + Win Claims ── */}
              {activeTab === "board" && (
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {playerTicket && (
                    <TicketCard
                      ticket={playerTicket} calledSet={calledSet}
                      label={`${pName.toUpperCase()}'S TICKET`}
                      marked={markedCount} accent="#ffd700"
                    />
                  )}

                  {/* Win Claims */}
                  <div style={{ background:"linear-gradient(135deg,#0d0d28,#121238)", border:"1px solid rgba(255,255,255,.08)", borderRadius:14, padding:14 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:11 }}>
                      <div style={{ color:"rgba(255,255,255,.22)", fontSize:9, letterSpacing:4 }}>WIN CLAIMS · 1st=🥇10pts · 2nd=🥈5pts</div>
                      <button onClick={() => setShowResults(true)} style={{
                        background:"linear-gradient(135deg,rgba(255,215,0,.15),rgba(255,150,0,.1))",
                        border:"1px solid rgba(255,215,0,.35)", borderRadius:8,
                        padding:"4px 12px", color:"#ffd700", fontSize:11, fontWeight:700, cursor:"pointer",
                      }}>📊 Results</button>
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                      {WIN_ORDER.map(win => {
                        const claims = Array.isArray(claimedWins[win]) ? claimedWins[win] : [];
                        const myRank = claims.findIndex(c => c.name === pName || c.name === "You");
                        const canClaim = claims.length < 2 && myRank === -1;
                        return (
                          <div key={win} style={{
                            padding:"10px 13px", borderRadius:11,
                            background: claims.length > 0 ? "rgba(255,215,0,.04)" : "rgba(255,255,255,.03)",
                            border:`1px solid ${claims.length > 0 ? "rgba(255,215,0,.15)" : "rgba(255,255,255,.07)"}`,
                          }}>
                            {/* Header row */}
                            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                                <span style={{ fontSize:20 }}>{WIN_ICONS[win]}</span>
                                <span style={{ color:"rgba(255,255,255,.9)", fontWeight:700, fontSize:14 }}>{win}</span>
                                <span style={{ color:"rgba(255,255,255,.25)", fontSize:11 }}>{claims.length}/2 claimed</span>
                              </div>
                              {canClaim && !gameOver && (
                                <span style={{ color:"rgba(255,215,0,.4)", fontSize:11, fontStyle:"italic" }}>auto ⚡</span>
                              )}
                              {!canClaim && myRank >= 0 && <span style={{ fontSize:18 }}>🏆</span>}
                              {!canClaim && myRank === -1 && claims.length >= 2 && <span style={{ color:"rgba(255,255,255,.2)", fontSize:11 }}>Full</span>}
                            </div>
                            {/* Claims list */}
                            {claims.map((c, idx) => {
                              const isMe = c.name === pName || c.name === "You";
                              const detail = claimDetails[`${win}_${c.rank}`];
                              return (
                                <div key={idx} style={{ display:"flex", gap:10, marginTop:6, paddingLeft:28, flexWrap:"wrap", alignItems:"center" }}>
                                  <span style={{
                                    fontSize:11, fontWeight:800, padding:"2px 7px", borderRadius:5,
                                    background: c.rank === 1 ? "rgba(255,215,0,.18)" : "rgba(124,115,230,.18)",
                                    border:`1px solid ${c.rank === 1 ? "rgba(255,215,0,.4)" : "rgba(124,115,230,.4)"}`,
                                    color: c.rank === 1 ? "#ffd700" : "#a09af0",
                                  }}>{c.rank === 1 ? "🥇 1st" : "🥈 2nd"} · +{c.points} pts</span>
                                  <span style={{ color: isMe ? "#00e676" : "rgba(255,255,255,.55)", fontSize:11, fontWeight:700 }}>
                                    👤 {c.name}{isMe ? " (You)" : ""}
                                  </span>
                                  {detail?.drawIndex && <span style={{ color:"rgba(255,215,0,.5)", fontSize:11 }}>🎱 Rd {detail.drawIndex}</span>}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* End Game Poll (multiplayer only) */}
                  {gameMode === "private" && !gameEndedMP && (() => {
                    const votes = endPoll?.votes || {};
                    const myVote = votes[playerName];
                    const isInitiator = endPoll?.initiator === playerName;
                    return (
                      <div style={{
                        background:"rgba(100,50,200,.08)", border:"1px solid rgba(124,115,230,.25)",
                        borderRadius:14, padding:"14px",
                      }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                          <div>
                            <div style={{ color:"rgba(255,255,255,.8)", fontWeight:700, fontSize:13 }}>🗳 End Game Poll</div>
                            <div style={{ color:"rgba(255,255,255,.35)", fontSize:11, marginTop:2 }}>
                              {endPoll ? `${endPoll.initiator} wants to end the game` : "Vote to end game & publish results"}
                            </div>
                          </div>
                          {/* Countdown if poll is active */}
                          {endPoll && pollCountdown > 0 && (
                            <div style={{
                              width:44, height:44, borderRadius:"50%",
                              border:`3px solid ${pollCountdown <= 15 ? "#ff5252" : "#7c73e6"}`,
                              display:"flex", alignItems:"center", justifyContent:"center",
                              color: pollCountdown <= 15 ? "#ff5252" : "#a09af0",
                              fontWeight:900, fontSize:16,
                              animation: pollCountdown <= 15 ? "pulse .6s ease-in-out infinite" : "none",
                            }}>{pollCountdown}</div>
                          )}
                        </div>

                        {/* No active poll — show "Vote to End" button */}
                        {!endPoll && (
                          <button onClick={() => wsRef.current?.send(JSON.stringify({ type:'vote_end', code:multiRoomRef.current, playerName }))} style={{
                            width:"100%", padding:"9px", borderRadius:9,
                            background:"rgba(124,115,230,.15)", border:"1px solid rgba(124,115,230,.35)",
                            color:"#a09af0", fontWeight:700, fontSize:13, cursor:"pointer",
                          }}>🗳 Vote to End Game</button>
                        )}

                        {/* Poll active — show Yes/No for non-initiator, status for all */}
                        {endPoll && !myVote && !isInitiator && (
                          <div style={{ display:"flex", gap:10, marginBottom:10 }}>
                            <button onClick={() => wsRef.current?.send(JSON.stringify({ type:'vote_end', code:multiRoomRef.current, playerName, vote:'yes' }))} style={{
                              flex:1, padding:"9px", borderRadius:9,
                              background:"rgba(0,230,118,.15)", border:"1px solid rgba(0,230,118,.4)",
                              color:"#00e676", fontWeight:800, fontSize:14, cursor:"pointer",
                            }}>✅ Yes, End Game</button>
                            <button onClick={() => wsRef.current?.send(JSON.stringify({ type:'vote_end', code:multiRoomRef.current, playerName, vote:'no' }))} style={{
                              flex:1, padding:"9px", borderRadius:9,
                              background:"rgba(255,82,82,.12)", border:"1px solid rgba(255,82,82,.35)",
                              color:"#ff5252", fontWeight:800, fontSize:14, cursor:"pointer",
                            }}>❌ No, Keep Playing</button>
                          </div>
                        )}
                        {endPoll && isInitiator && !myVote && (
                          <div style={{ color:"rgba(0,230,118,.7)", fontSize:12, fontWeight:700, marginBottom:8 }}>✓ You started the poll — waiting for others…</div>
                        )}
                        {endPoll && myVote && (
                          <div style={{ color: myVote === 'yes' ? "#00e676" : myVote === 'no' ? "#ff5252" : "rgba(255,255,255,.35)", fontSize:12, fontWeight:700, marginBottom:8 }}>
                            {myVote === 'yes' ? "✅ You voted Yes" : myVote === 'no' ? "❌ You voted No" : "⏳ Your time expired"}
                          </div>
                        )}

                        {/* Vote status for all players */}
                        {endPoll && (
                          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                            {roomPlayers.map(p => {
                              const v = votes[p.name];
                              return (
                                <div key={p.name} style={{
                                  display:"flex", alignItems:"center", gap:5, padding:"3px 10px",
                                  background: v === 'yes' ? "rgba(0,230,118,.1)" : v === 'no' ? "rgba(255,82,82,.1)" : v === 'timeout' ? "rgba(255,165,0,.1)" : "rgba(255,255,255,.04)",
                                  border:`1px solid ${v === 'yes' ? "rgba(0,230,118,.3)" : v === 'no' ? "rgba(255,82,82,.3)" : v === 'timeout' ? "rgba(255,165,0,.3)" : "rgba(255,255,255,.1)"}`,
                                  borderRadius:20, fontSize:11,
                                }}>
                                  <span>{v === 'yes' ? '✅' : v === 'no' ? '❌' : v === 'timeout' ? '⏳' : '○'}</span>
                                  <span style={{ color: v ? "#fff" : "rgba(255,255,255,.35)" }}>{p.name}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {gameEndedMP && (
                    <button onClick={() => setShowResults(true)} style={{
                      width:"100%", padding:"13px", borderRadius:12,
                      background:"linear-gradient(135deg,#ffd700,#ff9500)",
                      border:"none", color:"#000", fontWeight:800, fontSize:15, cursor:"pointer",
                      animation:"winGlow 2s ease-in-out infinite",
                    }}>🏆 View Final Results</button>
                  )}

                  {/* Game Over */}
                  {gameOver && (
                    <div style={{
                      background:"linear-gradient(135deg,rgba(15,8,0,.98),rgba(50,25,0,.98))",
                      border:"2px solid #ffd700", borderRadius:16, padding:"24px 20px", textAlign:"center",
                      boxShadow:"0 0 50px rgba(255,215,0,.14)", animation:"bounceIn .5s ease",
                    }}>
                      <div style={{ fontSize:50, marginBottom:8 }}>🏆</div>
                      <div style={{ fontFamily:"'Cinzel',serif", color:"#ffd700", fontSize:20, letterSpacing:3, marginBottom:6 }}>Game Over!</div>
                      <div style={{ color:"rgba(255,255,255,.35)", fontSize:13, marginBottom:6 }}>{calledNumbers.length} numbers were called</div>
                      <div style={{ color:"rgba(255,255,255,.6)", fontSize:13, marginBottom:18 }}>
                        {WIN_ORDER.filter(w => (claimedWins[w]||[]).some(c=>c.name===pName||c.name==="You")).length > 0
                          ? `🏆 You won: ${WIN_ORDER.filter(w=>(claimedWins[w]||[]).some(c=>c.name===pName||c.name==="You")).join(", ")}`
                          : "Better luck next time! 🎯"}
                      </div>
                      <div style={{ display:"flex", gap:10, justifyContent:"center", flexWrap:"wrap" }}>
                        <button className="btn" onClick={() => setShowResults(true)} style={{
                          background:"linear-gradient(135deg,rgba(255,215,0,.2),rgba(255,150,0,.15))",
                          border:"1px solid rgba(255,215,0,.4)", borderRadius:12, padding:"11px 20px",
                          color:"#ffd700", fontWeight:800, fontSize:14, cursor:"pointer",
                        }}>📊 Final Results</button>
                        <button className="btn" onClick={() => setScreen("welcome")} style={{
                          background:"linear-gradient(135deg,#ffd700,#ff9500)",
                          border:"none", borderRadius:12, padding:"11px 20px",
                          color:"#000", fontWeight:800, fontSize:14, cursor:"pointer",
                        }}>Play Again</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Tab: All Tickets ── */}
              {activeTab === "tickets" && (
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {/* Your ticket */}
                  {playerTicket && (
                    <TicketCard
                      ticket={playerTicket} calledSet={calledSet}
                      label={`👤 ${pName.toUpperCase()} (YOU)`}
                      marked={markedCount} accent="#ffd700"
                    />
                  )}
                  {/* Multiplayer: other players' tickets received via WS */}
                  {gameMode === "private" && roomPlayers.filter(p => p.name !== pName).map(p => {
                    const ticket = allTickets[p.name];
                    const marked = ticket ? countMarked(ticket, calledSet) : 0;
                    const isMyTurn = p.name === currentTurnPlayer;
                    return (
                      <div key={p.name}>
                        <div style={{
                          display:"flex", alignItems:"center", gap:10,
                          padding:"8px 14px",
                          background: isMyTurn ? "rgba(0,230,118,.12)" : "rgba(255,255,255,.05)",
                          border:`1px solid ${isMyTurn ? "rgba(0,230,118,.4)" : "rgba(255,255,255,.1)"}`,
                          borderRadius:"12px 12px 0 0", marginBottom:-2,
                        }}>
                          <span style={{ fontSize:18 }}>{p.isHost ? "👑" : "🧍"}</span>
                          <span style={{ fontWeight:700, fontSize:13, color: isMyTurn ? "#00e676" : "#fff" }}>{p.name}</span>
                          {isMyTurn && <span style={{ fontSize:11, color:"#00e676", fontWeight:700 }}>← drawing now</span>}
                          <div style={{ flex:1 }}>
                            <div style={{ height:4, borderRadius:2, background:"rgba(255,255,255,.07)", overflow:"hidden" }}>
                              <div style={{
                                height:"100%", borderRadius:2,
                                width:`${Math.round((marked/15)*100)}%`,
                                background:"linear-gradient(90deg,#7c73e677,#7c73e6)",
                                transition:"width .6s ease",
                              }}/>
                            </div>
                          </div>
                          <span style={{ color:"rgba(255,255,255,.3)", fontSize:10 }}>{marked}/15</span>
                        </div>
                        {ticket ? (
                          <TicketCard ticket={ticket} calledSet={calledSet}
                            label={`${p.name.toUpperCase()}'S TICKET`}
                            marked={marked} accent="#7c73e6" compact={true}
                          />
                        ) : (
                          <div style={{
                            background:"linear-gradient(135deg,#0d0d28,#121238)",
                            border:"1px solid rgba(255,255,255,.08)", borderRadius:"0 0 12px 12px",
                            padding:"18px", textAlign:"center",
                            color:"rgba(255,255,255,.2)", fontSize:12, fontStyle:"italic",
                          }}>Waiting for ticket…</div>
                        )}
                      </div>
                    );
                  })}
                  {/* Bot tickets */}
                  {bots.map(bot => {
                    const ticket = botTickets[bot.id];
                    const marked = ticket ? countMarked(ticket, calledSet) : 0;
                    const wins   = WIN_ORDER.filter(w => (claimedWins[w]||[]).some(c=>c.name===bot.name));
                    return (
                      <div key={bot.id}>
                        <div style={{
                          display:"flex", alignItems:"center", gap:10,
                          padding:"8px 14px",
                          background:`${bot.color}14`,
                          border:`1px solid ${bot.color}33`,
                          borderRadius:"12px 12px 0 0", marginBottom:-2,
                        }}>
                          <span style={{ fontSize:18 }}>{bot.emoji}</span>
                          <span style={{ color:bot.color, fontWeight:700, fontSize:13 }}>{bot.name}</span>
                          <div style={{ flex:1 }}>
                            <div style={{ height:4, borderRadius:2, background:"rgba(255,255,255,.07)", overflow:"hidden" }}>
                              <div style={{
                                height:"100%", borderRadius:2,
                                width:`${Math.round((marked/15)*100)}%`,
                                background:`linear-gradient(90deg,${bot.color}77,${bot.color})`,
                                transition:"width .6s ease",
                              }}/>
                            </div>
                          </div>
                          <span style={{ color:"rgba(255,255,255,.3)", fontSize:10 }}>{marked}/15</span>
                          {wins.map(w => <span key={w} style={{ fontSize:14 }}>🏆</span>)}
                        </div>
                        {ticket && (
                          <TicketCard ticket={ticket} calledSet={calledSet}
                            label={`${bot.name.toUpperCase()}'S TICKET`}
                            marked={marked} accent={bot.color} compact={true}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── Tab: Log (inline) ── */}
              {activeTab === "log" && (
                <div style={{ flex:1 }}>
                  <GameLog
                    logs={gameLogs}
                    expanded={false}
                    onToggle={() => setLogExpanded(true)}
                  />
                </div>
              )}
            </div>

            {/* ══ COL 3 — Opponents + mini log ══ */}
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>

              {/* Opponents panel */}
              {bots.length > 0 && (
                <div style={{ background:"linear-gradient(135deg,#0d0d28,#121238)", border:"1px solid rgba(255,255,255,.08)", borderRadius:14, padding:14 }}>
                  <div style={{ color:"rgba(255,255,255,.22)", fontSize:9, letterSpacing:4, marginBottom:11 }}>
                    OPPONENTS — {bots.length} BOTS
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                    {bots.map(bot => {
                      const ticket   = botTickets[bot.id];
                      const marked   = ticket ? countMarked(ticket, calledSet) : 0;
                      const pct      = Math.round((marked/15)*100);
                      const botWins  = WIN_ORDER.filter(w => (claimedWins[w]||[]).some(c=>c.name===bot.name));
                      return (
                        <div key={bot.id} style={{
                          padding:"10px 12px", borderRadius:12,
                          background:"rgba(255,255,255,.03)", border:`1px solid ${bot.color}22`,
                        }}>
                          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:7 }}>
                            <span style={{ fontSize:24 }}>{bot.emoji}</span>
                            <div style={{ flex:1 }}>
                              <div style={{ color:bot.color, fontWeight:700, fontSize:14 }}>{bot.name}</div>
                              <div style={{ color:"rgba(255,255,255,.25)", fontSize:10 }}>{marked}/15 marked</div>
                            </div>
                            <div style={{ display:"flex", gap:2 }}>
                              {botWins.map(w => <span key={w} title={w} style={{ fontSize:14 }}>🏆</span>)}
                            </div>
                          </div>
                          <div style={{ height:5, borderRadius:3, background:"rgba(255,255,255,.06)", overflow:"hidden" }}>
                            <div style={{
                              height:"100%", borderRadius:3, width:`${pct}%`,
                              background:`linear-gradient(90deg,${bot.color}55,${bot.color})`,
                              transition:"width .6s ease",
                            }}/>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Mini Game Log in col 3 */}
              <div style={{ flex:1 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                  <div style={{ color:"rgba(255,255,255,.22)", fontSize:9, letterSpacing:4 }}>LIVE LOG</div>
                  <span style={{ color:"rgba(255,215,0,.5)", fontSize:10, fontWeight:700 }}>{gameLogs.length} events</span>
                </div>
                <div style={{
                  background:"linear-gradient(135deg,#0d0d28,#121238)",
                  border:"1px solid rgba(255,255,255,.08)", borderRadius:14, padding:"8px 10px",
                  height:240, overflowY:"auto", display:"flex", flexDirection:"column", gap:4,
                }}>
                  {gameLogs.length === 0
                    ? <div style={{ color:"rgba(255,255,255,.18)", fontSize:12, textAlign:"center", marginTop:30 }}>Draw a number to start log…</div>
                    : [...gameLogs].reverse().slice(0,30).map((entry,i) => {
                        const borderL = entry.type==="number"?"#ffd700":entry.type==="win"?"#00e676":entry.type==="claim"?"#ff9500":"rgba(255,255,255,.12)";
                        const textColor = entry.type==="win"?"#00e676":entry.type==="claim"?"#ffd700":entry.type==="number"?"#fff":"rgba(255,255,255,.5)";
                        return (
                          <div key={i} style={{
                            padding:"5px 8px", borderRadius:7, borderLeft:`2px solid ${borderL}`,
                            background:"rgba(255,255,255,.025)",
                          }}>
                            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                              <span style={{ fontSize:11, flexShrink:0 }}>{entry.icon}</span>
                              <span style={{ color:textColor, fontWeight:700, fontSize:11, flex:1,
                                whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                                {entry.text}
                              </span>
                              <span style={{ color:"rgba(255,255,255,.15)", fontSize:9 }}>#{entry.seq}</span>
                            </div>
                            {entry.type === "number" && entry.tickers && entry.tickers.length > 0 && (
                              <div style={{ color:"rgba(0,230,118,.7)", fontSize:10, marginTop:2, paddingLeft:17 }}>
                                ✓ {entry.tickers.map(t=>t.name).join(", ")}
                              </div>
                            )}
                            {entry.type === "number" && (!entry.tickers || entry.tickers.length === 0) && (
                              <div style={{ color:"rgba(255,255,255,.15)", fontSize:10, marginTop:2, paddingLeft:17, fontStyle:"italic" }}>
                                Not on any ticket
                              </div>
                            )}
                          </div>
                        );
                      })
                  }
                </div>
                {/* Expand full log button */}
                <button className="btn" onClick={() => setLogExpanded(true)} style={{
                  width:"100%", marginTop:7, padding:"10px",
                  background:"linear-gradient(135deg,rgba(255,215,0,.08),rgba(255,165,0,.06))",
                  border:"1px solid rgba(255,215,0,.25)",
                  borderRadius:10, color:"#ffd700", fontSize:12, fontWeight:800, letterSpacing:1,
                }}>⛶ EXPAND FULL SCREEN LOG</button>
              </div>
            </div>

          </div>{/* end 3-col grid */}
        </div>
      </div>
    );
  }

  return null;
}
