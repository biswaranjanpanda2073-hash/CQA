import React from 'react';
import { Activity, Cpu, User } from 'lucide-react';
import './TerminalUI.css';

/**
 * TerminalHeader: Standardized production station header.
 * Displays project/station breadcrumbs, current terminal, active serial number badge,
 * and reliable live system status pills (Live Backend, Operational Station, Scanner Ready, Operator).
 */
export const TerminalHeader = ({
    projectName,
    terminalId,
    stationName,
    unitId,
    user,
    scannerActive = true,
    backendOnline = true,
    stationStatus = 'Operational',
    extraMeta = null
}) => {
    return (
        <header className="terminal-header-card animate-fade-in">
            <div className="terminal-header-titles">
                <div className="terminal-header-breadcrumb">
                    <span>{projectName}</span>
                    <span>/</span>
                    <span>Terminal {terminalId}</span>
                </div>
                <h1 className="terminal-header-station-name">{stationName}</h1>
            </div>

            <div className="terminal-header-meta">
                {unitId && unitId !== 'BATCH' && (
                    <div className="terminal-unit-pill" title="Active Processing Unit">
                        {unitId}
                    </div>
                )}

                <div className="terminal-status-group">
                    {backendOnline && (
                        <div className="terminal-status-pill online" title="Backend connection active">
                            <div className="terminal-dot" />
                            <span>Live MES</span>
                        </div>
                    )}

                    <div className="terminal-status-pill online" title="Station status">
                        <Activity size={13} />
                        <span>{stationStatus}</span>
                    </div>

                    {scannerActive && (
                        <div className="terminal-status-pill online" title="Barcode scanner input ready">
                            <Cpu size={13} />
                            <span>Scanner Ready</span>
                        </div>
                    )}

                    {user?.name && (
                        <div className="terminal-status-pill standby" title={`Operator: ${user.name}`}>
                            <User size={13} />
                            <span>{user.name}</span>
                        </div>
                    )}

                    {extraMeta}
                </div>
            </div>
        </header>
    );
};

export default TerminalHeader;
