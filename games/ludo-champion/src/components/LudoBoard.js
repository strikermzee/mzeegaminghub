import React from 'react';
import '../styles/LudoBoard.css';

const LudoBoard = ({ players = [], pawnsOut = {}, pawnPositions = {}, pawnsHome = {} }) => {
  const isColorActive = (color) => players.some(p => p.pawn === color);

  const getPawnsInHome = (color) => {
    const player = players.find(p => p.pawn === color);
    if (!player) return 0;
    const homeCount = pawnsHome[player.username] || 0;
    return 4 - (pawnsOut[player.username] || 0) - homeCount;
  };

  const getPawnsAtCell = (cellNum) => {
    const pawnsHere = [];
    Object.entries(pawnPositions).forEach(([username, positions]) => {
      const player = players.find(p => p.username === username);
      if (player && positions) {
        positions.forEach((pos, idx) => {
          if (pos === cellNum) pawnsHere.push({ color: player.pawn, index: idx });
        });
      }
    });
    return pawnsHere;
  };

  const renderHomePawns = (color) => {
    const count = getPawnsInHome(color);
    if (!isColorActive(color)) return null;
    return [...Array(4)].map((_, i) => (
      <div key={i} className="pawn-slot">
        {i < count && (
          <div className={`pawn pawn-${color}`}>
            <div className="pawn-head"></div>
            <div className="pawn-body"></div>
          </div>
        )}
      </div>
    ));
  };

  const renderCellPawns = (cellNum) => {
    const pawns = getPawnsAtCell(cellNum);
    if (pawns.length === 0) return null;
    return (
      <div className="cell-pawns">
        {pawns.map((p, i) => (
          <div key={i} className={`board-pawn pawn-${p.color}`}>
            <div className="pawn-head"></div>
            <div className="pawn-body"></div>
          </div>
        ))}
      </div>
    );
  };

  const Cell = ({ num, className, children }) => (
    <div className={`cell ${className}`} data-cell={num}>
      {num && <span className="cell-num">{num}</span>}
      {children}
      {num && renderCellPawns(parseInt(num))}
    </div>
  );

  return (
    <div className="ludo-board">
      {/* Red Home Base - Top Left */}
      <div className="home-base red-base">
        <div className="home-hexagon red-hex-bg">
          <div className="home-inner">{renderHomePawns('red')}</div>
        </div>
      </div>

      {/* Top Path - Cells 1-13 (Red starts at 1, goes clockwise) */}
      <div className="path-section top-path">
        <div className="path-row">
          <Cell num="6" className="white" />
          <Cell num="7" className="white" />
          <Cell num="8" className="white" />
        </div>
        <div className="path-row">
          <Cell num="5" className="white" />
          <Cell className="blue home-path" />
          <Cell num="9" className="blue"><div className="straight-arrow down"></div></Cell>
        </div>
        <div className="path-row">
          <Cell num="4" className="white"><div className="safe-hex blue"></div></Cell>
          <Cell className="blue home-path" />
          <Cell num="10" className="white" />
        </div>
        <div className="path-row">
          <Cell num="3" className="white" />
          <Cell className="blue home-path" />
          <Cell num="11" className="white" />
        </div>
        <div className="path-row">
          <Cell num="2" className="white" />
          <Cell className="blue home-path" />
          <Cell num="12" className="white" />
        </div>
        <div className="path-row">
          <Cell num="1" className="white" />
          <Cell className="blue home-path" />
          <Cell num="13" className="white" />
        </div>
      </div>

      {/* Blue Home Base - Top Right */}
      <div className="home-base blue-base">
        <div className="home-hexagon blue-hex-bg">
          <div className="home-inner">{renderHomePawns('blue')}</div>
        </div>
      </div>

      {/* Left Path - Cells 40-52 (Yellow starts at 40, goes up) */}
      <div className="path-section left-path">
        <div className="path-col">
          <Cell num="47" className="white" />
          <Cell num="46" className="white" />
          <Cell num="45" className="white" />
        </div>
        <div className="path-col">
          <Cell num="48" className="red"><div className="straight-arrow right"></div></Cell>
          <Cell className="red home-path" />
          <Cell num="44" className="white" />
        </div>
        <div className="path-col">
          <Cell num="49" className="white" />
          <Cell className="red home-path" />
          <Cell num="43" className="white"><div className="safe-hex red"></div></Cell>
        </div>
        <div className="path-col">
          <Cell num="50" className="white" />
          <Cell className="red home-path" />
          <Cell num="42" className="white" />
        </div>
        <div className="path-col">
          <Cell num="51" className="white" />
          <Cell className="red home-path" />
          <Cell num="41" className="white" />
        </div>
        <div className="path-col">
          <Cell num="52" className="white" />
          <Cell className="red home-path" />
          <Cell num="40" className="white" />
        </div>
      </div>

      {/* Center Home - shows pawns that reached home */}
      <div className="center-home">
        <div className="triangle-container">
          <div className="center-triangle blue-tri">
            <div className="home-pawns-display">
              {[...Array(pawnsHome[players.find(p => p.pawn === 'blue')?.username] || 0)].map((_, i) => (
                <div key={i} className="home-pawn pawn-blue"><div className="pawn-head"></div><div className="pawn-body"></div></div>
              ))}
            </div>
          </div>
          <div className="center-triangle red-tri">
            <div className="home-pawns-display">
              {[...Array(pawnsHome[players.find(p => p.pawn === 'red')?.username] || 0)].map((_, i) => (
                <div key={i} className="home-pawn pawn-red"><div className="pawn-head"></div><div className="pawn-body"></div></div>
              ))}
            </div>
          </div>
          <div className="center-triangle green-tri">
            <div className="home-pawns-display">
              {[...Array(pawnsHome[players.find(p => p.pawn === 'green')?.username] || 0)].map((_, i) => (
                <div key={i} className="home-pawn pawn-green"><div className="pawn-head"></div><div className="pawn-body"></div></div>
              ))}
            </div>
          </div>
          <div className="center-triangle yellow-tri">
            <div className="home-pawns-display">
              {[...Array(pawnsHome[players.find(p => p.pawn === 'yellow')?.username] || 0)].map((_, i) => (
                <div key={i} className="home-pawn pawn-yellow"><div className="pawn-head"></div><div className="pawn-body"></div></div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Right Path - Cells 14-26 (Blue starts at 14, goes down) */}
      <div className="path-section right-path">
        <div className="path-col">
          <Cell num="14" className="white" />
          <Cell className="yellow home-path" />
          <Cell num="26" className="white" />
        </div>
        <div className="path-col">
          <Cell num="15" className="white" />
          <Cell className="yellow home-path" />
          <Cell num="25" className="white" />
        </div>
        <div className="path-col">
          <Cell num="16" className="white" />
          <Cell className="yellow home-path" />
          <Cell num="24" className="white" />
        </div>
        <div className="path-col">
          <Cell num="17" className="white"><div className="safe-hex yellow"></div></Cell>
          <Cell className="yellow home-path" />
          <Cell num="23" className="white" />
        </div>
        <div className="path-col">
          <Cell num="18" className="white" />
          <Cell className="yellow home-path" />
          <Cell num="22" className="yellow"><div className="straight-arrow left"></div></Cell>
        </div>
        <div className="path-col">
          <Cell num="19" className="white" />
          <Cell num="20" className="white" />
          <Cell num="21" className="white" />
        </div>
      </div>

      {/* Green Home Base - Bottom Left */}
      <div className="home-base green-base">
        <div className="home-hexagon green-hex-bg">
          <div className="home-inner">{renderHomePawns('green')}</div>
        </div>
      </div>

      {/* Bottom Path - Cells 27-39 (Green starts at 27, goes left) */}
      <div className="path-section bottom-path">
        <div className="path-row">
          <Cell num="39" className="white" />
          <Cell className="green home-path" />
          <Cell num="27" className="white" />
        </div>
        <div className="path-row">
          <Cell num="38" className="white" />
          <Cell className="green home-path" />
          <Cell num="28" className="white" />
        </div>
        <div className="path-row">
          <Cell num="37" className="white" />
          <Cell className="green home-path" />
          <Cell num="29" className="white" />
        </div>
        <div className="path-row">
          <Cell num="36" className="white" />
          <Cell className="green home-path" />
          <Cell num="30" className="white"><div className="safe-hex green"></div></Cell>
        </div>
        <div className="path-row">
          <Cell num="35" className="green"><div className="straight-arrow up"></div></Cell>
          <Cell className="green home-path" />
          <Cell num="31" className="white" />
        </div>
        <div className="path-row">
          <Cell num="34" className="white" />
          <Cell num="33" className="white" />
          <Cell num="32" className="white" />
        </div>
      </div>

      {/* Yellow Home Base - Bottom Right */}
      <div className="home-base yellow-base">
        <div className="home-hexagon yellow-hex-bg">
          <div className="home-inner">{renderHomePawns('yellow')}</div>
        </div>
      </div>
    </div>
  );
};

export default LudoBoard;
