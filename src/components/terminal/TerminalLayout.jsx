import React from 'react';
import './TerminalUI.css';

/**
 * TerminalLayout: Top-level desktop-optimized viewport and container wrapper.
 * Centers content and utilizes up to 1720px width at 100% zoom without cramped 960px constraints.
 */
export const TerminalLayout = ({ children, className = '', style = {} }) => {
    return (
        <div className={`terminal-viewport ${className}`} style={style}>
            <div className="terminal-container">
                {children}
            </div>
        </div>
    );
};

export default TerminalLayout;
