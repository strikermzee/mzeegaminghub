import React from 'react';
import { PAWN_COLORS } from '../context/GameContext';

const PawnSelector = ({ selectedPawn, onSelect, takenPawns = [], showTakenInfo = false }) => {
  const takenCount = takenPawns.length;

  return (
    <div className="pawn-selection">
      <div className="pawn-selection-title">
        Choose Your Pawn
        {showTakenInfo && takenCount > 0 && (
          <span className="taken-info"> ({takenCount} pawn{takenCount > 1 ? 's' : ''} taken)</span>
        )}
      </div>
      <div className="pawns-grid">
        {PAWN_COLORS.map((pawn) => {
          const isTaken = takenPawns.includes(pawn.id) && selectedPawn !== pawn.id;
          const isSelected = selectedPawn === pawn.id;
          
          return (
            <div
              key={pawn.id}
              className={`pawn-option ${isSelected ? 'selected' : ''} ${isTaken ? 'taken' : ''}`}
              onClick={() => !isTaken && onSelect(pawn.id)}
              title={isTaken ? 'This pawn is already taken' : pawn.name}
            >
              <div className={`pawn-figure pawn-${pawn.id}`}>
                <div className="head" style={{ backgroundColor: pawn.color }}></div>
                <div className="body" style={{ backgroundColor: pawn.color }}></div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PawnSelector;
