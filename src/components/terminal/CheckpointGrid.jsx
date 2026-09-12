import React from 'react';
import './TerminalUI.css';

/**
 * CheckpointGrid: Responsive multi-column grid container for QC / Inspection terminals.
 * Uses intelligent column adaptation:
 *   - Wide desktop (>= 1640px): 4 columns
 *   - Large desktop (>= 1320px): 3 columns
 *   - Medium desktop (>= 900px): 2 columns
 *   - Small screens (< 900px): 1 column
 */
export const CheckpointGrid = ({ children, className = '', style = {} }) => {
    return (
        <div className={`terminal-checkpoint-grid ${className}`} style={style}>
            {children}
        </div>
    );
};

export default CheckpointGrid;
