import React, { useState, useEffect, useMemo } from 'react';
import {
    Layers,
    Plus,
    Search,
    Edit3,
    Copy,
    Archive,
    Sliders,
    Check,
    X,
    RefreshCw,
    Terminal,
    ChevronRight
} from 'lucide-react';
import { db, collection, doc, setDoc, onSnapshot } from '../../firebase.js';
import { hasPermission, PERMISSIONS } from '../../utils/rbacEngine.js';
import { logAdminAction, AUDIT_ACTIONS } from '../../utils/auditLogger.js';
import { INITIAL_PROJECTS } from '../../utils/configBootstrap.js';

const PROJECT_DISPLAY_ORDER = ['Device', 'Peripherals', 'Inward QC', 'Calculator'];

const sortProjectsInOrder = (list) => {
    return [...list].sort((a, b) => {
        const idxA = PROJECT_DISPLAY_ORDER.indexOf(a.id);
        const idxB = PROJECT_DISPLAY_ORDER.indexOf(b.id);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return (a.name || '').localeCompare(b.name || '');
    });
};

export const ProjectStudio = ({ user, onNavigateToWorkflow }) => {
    const isSuperAdmin = user?.role === 'Super Admin';
    const canCreate = isSuperAdmin || hasPermission(user, PERMISSIONS.PROJECT_CREATE);
    const canEdit = isSuperAdmin || hasPermission(user, PERMISSIONS.PROJECT_EDIT);
    const canArchive = isSuperAdmin || hasPermission(user, PERMISSIONS.PROJECT_ARCHIVE);

    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [categoryFilter, setCategoryFilter] = useState('ALL');

    // Modals
    const [editingProject, setEditingProject] = useState(null); // null, 'new', or project object
    const [cloningProject, setCloningProject] = useState(null);
    const [specsProject, setSpecsProject] = useState(null);
    const [serialRulesProject, setSerialRulesProject] = useState(null);
    const [archivingProject, setArchivingProject] = useState(null);
    const [archiveReason, setArchiveReason] = useState('');

    // Form states
    const [formData, setFormData] = useState({
        id: '',
        name: '',
        code: '',
        category: 'Device',
        status: 'Active',
        description: ''
    });

    const [specsData, setSpecsData] = useState({
        productTypes: [],
        models: [],
        hwRevisions: [],
        swRevisions: []
    });
    const [specInputs, setSpecInputs] = useState({
        productType: '',
        model: '',
        hwRevision: '',
        swRevision: ''
    });

    const [serialRulesData, setSerialRulesData] = useState({
        regex: '^[A-Z0-9-]{6,25}$',
        duplicatePolicy: 'LOOPER',
        requirePcbScan: false,
        requireTopPanelScan: false,
        requireBottomPanelScan: false,
        requireBatteryScan: false,
        requireDisplayScan: false
    });
    const [serialTestValue, setSerialTestValue] = useState('');

    // Clone form state
    const [cloneData, setCloneData] = useState({
        newId: '',
        newName: '',
        newCode: ''
    });

    // Real-time Firestore sync
    useEffect(() => {
        const unsub = onSnapshot(collection(db, 'projects'), (snap) => {
            if (!snap.empty) {
                const list = [];
                snap.forEach(d => list.push({ ...d.data(), id: d.id }));
                list.sort((a, b) => a.name.localeCompare(b.name));
                setProjects(list);
            } else {
                // Fallback to default initial projects
                setProjects(INITIAL_PROJECTS);
            }
            setLoading(false);
        }, (err) => {
            console.warn('[ProjectStudio] Falling back to default projects:', err);
            setProjects(INITIAL_PROJECTS);
            setLoading(false);
        });

        return () => unsub();
    }, []);

    // Filtered projects sorted in exact required sequence
    const filteredProjects = useMemo(() => {
        const filtered = projects.filter(p => {
            const matchesSearch = !searchTerm ||
                p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                p.id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                p.code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                p.description?.toLowerCase().includes(searchTerm.toLowerCase());

            const matchesStatus = statusFilter === 'ALL' || p.status === statusFilter;
            const matchesCategory = categoryFilter === 'ALL' || p.category === categoryFilter;

            return matchesSearch && matchesStatus && matchesCategory;
        });

        return sortProjectsInOrder(filtered);
    }, [projects, searchTerm, statusFilter, categoryFilter]);

    // Categories list
    const categories = useMemo(() => {
        const set = new Set(projects.map(p => p.category || 'Device'));
        return ['ALL', ...Array.from(set)];
    }, [projects]);

    // Open Create Project Modal
    const handleOpenCreate = () => {
        setFormData({
            id: '',
            name: '',
            code: '',
            category: 'Device',
            status: 'Active',
            description: ''
        });
        setEditingProject('new');
    };

    // Open Edit Project Modal
    const handleOpenEdit = (proj) => {
        setFormData({
            id: proj.id,
            name: proj.name || '',
            code: proj.code || '',
            category: proj.category || 'Device',
            status: proj.status || 'Active',
            description: proj.description || ''
        });
        setEditingProject(proj);
    };

    // Save Project (Create or Update)
    const handleSaveProject = async (e) => {
        e.preventDefault();
        const isNew = editingProject === 'new';

        let targetId = formData.id.trim();
        if (isNew) {
            if (!targetId) {
                targetId = formData.name.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
            }
            if (!targetId) {
                alert('Project ID is required.');
                return;
            }
            if (projects.some(p => p.id.toLowerCase() === targetId.toLowerCase())) {
                alert(`A project with ID "${targetId}" already exists.`);
                return;
            }
        }

        const payload = {
            id: targetId,
            name: formData.name.trim(),
            code: (formData.code || targetId.slice(0, 4)).toUpperCase().trim(),
            category: formData.category,
            status: formData.status,
            description: formData.description.trim(),
            updatedAt: new Date().toISOString(),
            updatedBy: user?.name || user?.id || 'Admin'
        };

        if (isNew) {
            payload.createdAt = new Date().toISOString();
            payload.createdBy = user?.name || user?.id || 'Admin';
            payload.version = 1;
            payload.defaultSpecs = {
                productTypes: ['Reverse', 'RTO', 'Manufacturing Defects', 'Others'],
                models: [],
                hwRevisions: ['V1.0'],
                swRevisions: ['1.0.0']
            };
            payload.serialRules = {
                regex: '^[A-Z0-9-]{6,25}$',
                duplicatePolicy: 'LOOPER',
                requirePcbScan: false,
                requireTopPanelScan: false,
                requireBottomPanelScan: false,
                requireBatteryScan: false,
                requireDisplayScan: false
            };
        }

        try {
            await setDoc(doc(db, 'projects', targetId), payload, { merge: true });

            await logAdminAction({
                actor: user,
                action: isNew ? AUDIT_ACTIONS.PROJECT_CREATED : AUDIT_ACTIONS.PROJECT_UPDATED,
                entity: 'project',
                entityId: targetId,
                project: targetId,
                previousValue: isNew ? null : editingProject,
                newValue: payload,
                reason: isNew ? 'Created new project master' : 'Updated project profile'
            });

            setEditingProject(null);
        } catch (err) {
            console.error('Failed to save project:', err);
            alert(`Error saving project: ${err.message}`);
        }
    };

    // Open Specs Editor
    const handleOpenSpecs = (proj) => {
        setSpecsProject(proj);
        setSpecsData({
            productTypes: [...(proj.defaultSpecs?.productTypes || [])],
            models: [...(proj.defaultSpecs?.models || [])],
            hwRevisions: [...(proj.defaultSpecs?.hwRevisions || [])],
            swRevisions: [...(proj.defaultSpecs?.swRevisions || [])]
        });
        setSpecInputs({
            productType: '',
            model: '',
            hwRevision: '',
            swRevision: ''
        });
    };

    const handleAddSpecItem = (field, inputKey) => {
        const val = specInputs[inputKey].trim();
        if (!val) return;
        if (specsData[field].includes(val)) {
            alert(`"${val}" already exists in this list.`);
            return;
        }
        setSpecsData(prev => ({
            ...prev,
            [field]: [...prev[field], val]
        }));
        setSpecInputs(prev => ({ ...prev, [inputKey]: '' }));
    };

    const handleRemoveSpecItem = (field, item) => {
        setSpecsData(prev => ({
            ...prev,
            [field]: prev[field].filter(x => x !== item)
        }));
    };

    const handleSaveSpecs = async () => {
        if (!specsProject) return;
        try {
            const projRef = doc(db, 'projects', specsProject.id);
            const prevSpecs = specsProject.defaultSpecs || {};
            await setDoc(projRef, {
                defaultSpecs: specsData,
                updatedAt: new Date().toISOString(),
                updatedBy: user?.name || user?.id || 'Admin'
            }, { merge: true });

            await logAdminAction({
                actor: user,
                action: AUDIT_ACTIONS.PROJECT_UPDATED,
                entity: 'project',
                entityId: specsProject.id,
                project: specsProject.id,
                previousValue: { defaultSpecs: prevSpecs },
                newValue: { defaultSpecs: specsData },
                reason: 'Updated project specifications and models'
            });

            setSpecsProject(null);
        } catch (err) {
            console.error('Failed to update specs:', err);
            alert(`Error updating specs: ${err.message}`);
        }
    };

    // Open Serial Governance Editor
    const handleOpenSerialRules = (proj) => {
        setSerialRulesProject(proj);
        setSerialRulesData({
            regex: proj.serialRules?.regex || '^[A-Z0-9-]{6,25}$',
            duplicatePolicy: proj.serialRules?.duplicatePolicy || 'LOOPER',
            requirePcbScan: !!proj.serialRules?.requirePcbScan,
            requireTopPanelScan: !!proj.serialRules?.requireTopPanelScan,
            requireBottomPanelScan: !!proj.serialRules?.requireBottomPanelScan,
            requireBatteryScan: !!proj.serialRules?.requireBatteryScan,
            requireDisplayScan: !!proj.serialRules?.requireDisplayScan
        });
        setSerialTestValue('');
    };

    const isSerialTestValid = useMemo(() => {
        if (!serialTestValue.trim()) return null;
        try {
            const re = new RegExp(serialRulesData.regex);
            return re.test(serialTestValue.trim());
        } catch {
            return false;
        }
    }, [serialRulesData.regex, serialTestValue]);

    const handleSaveSerialRules = async () => {
        if (!serialRulesProject) return;
        try {
            // Validate regex string syntax
            new RegExp(serialRulesData.regex);
        } catch (e) {
            alert(`Invalid regular expression syntax: ${e.message}`);
            return;
        }

        try {
            const projRef = doc(db, 'projects', serialRulesProject.id);
            const prevRules = serialRulesProject.serialRules || {};
            await setDoc(projRef, {
                serialRules: serialRulesData,
                updatedAt: new Date().toISOString(),
                updatedBy: user?.name || user?.id || 'Admin'
            }, { merge: true });

            await logAdminAction({
                actor: user,
                action: AUDIT_ACTIONS.PROJECT_UPDATED,
                entity: 'project',
                entityId: serialRulesProject.id,
                project: serialRulesProject.id,
                previousValue: { serialRules: prevRules },
                newValue: { serialRules: serialRulesData },
                reason: 'Updated serial number validation rules and governance'
            });

            setSerialRulesProject(null);
        } catch (err) {
            console.error('Failed to update serial rules:', err);
            alert(`Error updating serial rules: ${err.message}`);
        }
    };

    // Clone Project
    const handleOpenClone = (proj) => {
        setCloningProject(proj);
        setCloneData({
            newId: `${proj.id}_Copy`,
            newName: `${proj.name} (Copy)`,
            newCode: `${(proj.code || 'PRJ').slice(0, 3)}C`
        });
    };

    const handleExecuteClone = async (e) => {
        e.preventDefault();
        const targetId = cloneData.newId.trim();
        if (!targetId) {
            alert('New Project ID is required.');
            return;
        }
        if (projects.some(p => p.id.toLowerCase() === targetId.toLowerCase())) {
            alert(`A project with ID "${targetId}" already exists.`);
            return;
        }

        const newProjectPayload = {
            ...cloningProject,
            id: targetId,
            name: cloneData.newName.trim(),
            code: cloneData.newCode.toUpperCase().trim(),
            status: 'Draft',
            version: 1,
            createdAt: new Date().toISOString(),
            createdBy: user?.name || user?.id || 'Admin',
            updatedAt: new Date().toISOString(),
            updatedBy: user?.name || user?.id || 'Admin',
            clonedFrom: cloningProject.id
        };

        try {
            await setDoc(doc(db, 'projects', targetId), newProjectPayload);

            await logAdminAction({
                actor: user,
                action: AUDIT_ACTIONS.PROJECT_CLONED,
                entity: 'project',
                entityId: targetId,
                project: targetId,
                previousValue: { sourceProjectId: cloningProject.id },
                newValue: newProjectPayload,
                reason: `Cloned from project ${cloningProject.id}`
            });

            setCloningProject(null);
        } catch (err) {
            console.error('Failed to clone project:', err);
            alert(`Error cloning project: ${err.message}`);
        }
    };

    // Archive / Deactivate Project
    const handleOpenArchive = (proj) => {
        setArchivingProject(proj);
        setArchiveReason('');
    };

    const handleExecuteArchive = async () => {
        if (!archivingProject) return;
        if (!archiveReason.trim()) {
            alert('Please provide an operational reason for archiving this project.');
            return;
        }

        try {
            const projRef = doc(db, 'projects', archivingProject.id);
            const updatedPayload = {
                status: 'Archived',
                archivedAt: new Date().toISOString(),
                archivedBy: user?.name || user?.id || 'Admin',
                archiveReason: archiveReason.trim()
            };

            await setDoc(projRef, updatedPayload, { merge: true });

            await logAdminAction({
                actor: user,
                action: AUDIT_ACTIONS.PROJECT_ARCHIVED,
                entity: 'project',
                entityId: archivingProject.id,
                project: archivingProject.id,
                previousValue: { status: archivingProject.status },
                newValue: updatedPayload,
                reason: archiveReason.trim()
            });

            setArchivingProject(null);
        } catch (err) {
            console.error('Failed to archive project:', err);
            alert(`Error archiving project: ${err.message}`);
        }
    };

    return (
        <div className="animate-fade-in" style={{ paddingBottom: '2rem' }}>
            {/* Header & Controls Bar */}
            <div className="card" style={{ padding: '1.25rem', marginBottom: '18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                            <span className="status-pill primary" style={{ fontSize: '10px' }}>
                                Phase 2 Studio
                            </span>
                            <span className="text-xs text-muted font-bold">
                                {filteredProjects.length} of {projects.length} Projects
                            </span>
                        </div>
                        <h2 className="font-extrabold text-xl" style={{ margin: 0 }}>
                            Project Master Studio
                        </h2>
                        <p className="text-muted text-xs" style={{ margin: '0.25rem 0 0 0' }}>
                            Define and govern project profiles, multi-stage model variants, specifications, and serial validation rules
                        </p>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        {canCreate && (
                            <button className="btn btn-primary" onClick={handleOpenCreate}>
                                <Plus size={16} />
                                <span>Create Project</span>
                            </button>
                        )}
                    </div>
                </div>

                {/* Filter & Search Bar */}
                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ flex: 1, minWidth: 240, position: 'relative' }}>
                        <Search size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input
                            type="text"
                            className="form-control"
                            placeholder="Search by project name, ID, code, or description..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{ paddingLeft: '2.2rem' }}
                        />
                    </div>

                    {/* Status Filter */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <span className="text-xs font-bold text-muted uppercase">Status:</span>
                        {['ALL', 'Active', 'Draft', 'Archived'].map(st => (
                            <button
                                key={st}
                                className={`btn-ghost ${statusFilter === st ? 'font-bold' : ''}`}
                                onClick={() => setStatusFilter(st)}
                                style={{
                                    padding: '0.35rem 0.65rem',
                                    fontSize: '0.75rem',
                                    borderRadius: 'var(--radius-sm)',
                                    background: statusFilter === st ? 'var(--primary-alpha)' : 'transparent',
                                    color: statusFilter === st ? 'var(--primary)' : 'var(--text-muted)'
                                }}
                            >
                                {st}
                            </button>
                        ))}
                    </div>

                    {/* Category Filter */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <span className="text-xs font-bold text-muted uppercase">Category:</span>
                        <select
                            className="form-control"
                            value={categoryFilter}
                            onChange={(e) => setCategoryFilter(e.target.value)}
                            style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem', width: 'auto' }}
                        >
                            {categories.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* Project Cards (Single-Column Vertical Layout: 1 card per row) */}
            {loading ? (
                <div className="card p-8 text-center">
                    <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 1rem', color: 'var(--primary)' }} />
                    <p className="text-muted text-sm">Loading project masters...</p>
                </div>
            ) : filteredProjects.length === 0 ? (
                <div className="card p-8 text-center">
                    <Layers size={36} style={{ margin: '0 auto 1rem', color: 'var(--text-muted)' }} />
                    <h3 className="font-bold text-base mb-1">No Projects Found</h3>
                    <p className="text-muted text-xs">Try adjusting your search or category filters</p>
                </div>
            ) : (
                <div className="project-studio-single-column" style={{ display: 'flex', flexDirection: 'column', gap: '18px', width: '100%' }}>
                    {filteredProjects.map(proj => {
                        const isArchived = proj.status === 'Archived';
                        const isDraft = proj.status === 'Draft';
                        const modelsCount = proj.defaultSpecs?.models?.length || 0;
                        const hwCount = proj.defaultSpecs?.hwRevisions?.length || 0;
                        const swCount = proj.defaultSpecs?.swRevisions?.length || 0;
                        const hasSubScans = proj.serialRules?.requirePcbScan ||
                            proj.serialRules?.requireTopPanelScan ||
                            proj.serialRules?.requireBottomPanelScan ||
                            proj.serialRules?.requireBatteryScan;

                        return (
                            <div
                                key={proj.id}
                                className="project-card-row"
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    opacity: isArchived ? 0.75 : 1,
                                    border: isDraft ? '1px dashed var(--warning)' : '1px solid var(--border)',
                                    borderRadius: 'var(--radius-lg)',
                                    background: 'var(--bg-card)',
                                    boxShadow: 'var(--shadow-sm)',
                                    width: '100%',
                                    overflow: 'hidden',
                                    transition: 'box-shadow 0.2s ease, border-color 0.2s ease'
                                }}
                            >
                                {/* Row 1: Code + Category + Name + ID + Inline Specs + Policy + Status */}
                                <div style={{
                                    padding: '0.75rem 1.25rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.65rem',
                                    flexWrap: 'wrap',
                                    borderBottom: '1px solid var(--border-light)'
                                }}>
                                    <span className="project-code-badge" style={{ flexShrink: 0 }}>
                                        {proj.code || proj.id.slice(0, 4).toUpperCase()}
                                    </span>
                                    <span className="status-pill" style={{
                                        fontSize: '10px',
                                        padding: '2px 8px',
                                        background: proj.category === 'Calculator' ? 'rgba(124, 58, 237, 0.12)' : 'rgba(2, 132, 199, 0.12)',
                                        color: proj.category === 'Calculator' ? '#7c3aed' : '#0284c7',
                                        flexShrink: 0
                                    }}>
                                        {proj.category || 'Device'}
                                    </span>
                                    <span className="font-extrabold text-base" style={{ color: 'var(--text-main)', letterSpacing: '-0.01em' }}>
                                        {proj.name}
                                    </span>
                                    <span className="text-muted" style={{ fontSize: '11px', fontFamily: 'monospace', flexShrink: 0 }}>
                                        ID: {proj.id}
                                    </span>

                                    <div style={{ width: '1px', height: '14px', background: 'var(--border)', margin: '0 0.15rem', flexShrink: 0 }} />

                                    {/* Inline Quick Specs */}
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.35rem',
                                        background: 'var(--bg-main)',
                                        border: '1px solid var(--border-light)',
                                        borderRadius: 'var(--radius-sm)',
                                        padding: '2px 8px',
                                        fontSize: '0.7rem',
                                        flexShrink: 0
                                    }}>
                                        <span className="text-muted font-bold">Models:</span>
                                        <span className="font-bold" style={{ color: 'var(--text-main)' }}>{modelsCount}</span>
                                    </div>

                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.35rem',
                                        background: 'var(--bg-main)',
                                        border: '1px solid var(--border-light)',
                                        borderRadius: 'var(--radius-sm)',
                                        padding: '2px 8px',
                                        fontSize: '0.7rem',
                                        flexShrink: 0
                                    }}>
                                        <span className="text-muted font-bold">Revisions:</span>
                                        <span className="font-bold" style={{ color: 'var(--text-main)' }}>{hwCount} HW &bull; {swCount} SW</span>
                                    </div>

                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.35rem',
                                        background: 'var(--bg-main)',
                                        border: '1px solid var(--border-light)',
                                        borderRadius: 'var(--radius-sm)',
                                        padding: '2px 8px',
                                        fontSize: '0.7rem',
                                        flexShrink: 0,
                                        maxWidth: '220px'
                                    }} title={proj.serialRules?.regex}>
                                        <span className="text-muted font-bold">Regex:</span>
                                        <span className="font-mono font-semibold truncate" style={{ color: 'var(--text-secondary)' }}>
                                            {proj.serialRules?.regex || 'Standard'}
                                        </span>
                                    </div>

                                    {/* Right-aligned tags */}
                                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.45rem', flexShrink: 0 }}>
                                        {hasSubScans && (
                                            <span className="status-pill info" style={{ fontSize: '9px', padding: '2px 7px' }}>
                                                Sub-Assemblies
                                            </span>
                                        )}
                                        <span className="status-pill default" style={{ fontSize: '9px', padding: '2px 7px' }}>
                                            Policy: {proj.serialRules?.duplicatePolicy || 'LOOPER'}
                                        </span>
                                        <span className={`status-pill ${isArchived ? 'default' : isDraft ? 'warning' : 'success'}`} style={{
                                            fontSize: '10px',
                                            padding: '2px 8px',
                                            fontWeight: 700
                                        }}>
                                            {proj.status || 'Active'}
                                        </span>
                                    </div>
                                </div>

                                {/* Row 2: Description + Actions */}
                                <div style={{
                                    padding: '0.55rem 1.25rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: '1rem',
                                    background: 'var(--bg-main)'
                                }}>
                                    <p className="text-muted text-xs" style={{
                                        margin: 0,
                                        lineHeight: 1.5,
                                        flex: 1,
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis'
                                    }} title={proj.description}>
                                        {proj.description || 'No description provided.'}
                                    </p>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', flexShrink: 0 }}>
                                        {canEdit && (
                                            <>
                                                <button
                                                    className="btn-ghost"
                                                    title="Edit Project Profile"
                                                    onClick={() => handleOpenEdit(proj)}
                                                    style={{ padding: '0.3rem', borderRadius: 'var(--radius-sm)' }}
                                                >
                                                    <Edit3 size={14} />
                                                </button>
                                                <button
                                                    className="btn-ghost"
                                                    title="Configure Models & Specifications"
                                                    onClick={() => handleOpenSpecs(proj)}
                                                    style={{ padding: '0.3rem', borderRadius: 'var(--radius-sm)' }}
                                                >
                                                    <Sliders size={14} />
                                                </button>
                                                <button
                                                    className="btn-ghost"
                                                    title="Serial Validation Rules & Governance"
                                                    onClick={() => handleOpenSerialRules(proj)}
                                                    style={{ padding: '0.3rem', borderRadius: 'var(--radius-sm)' }}
                                                >
                                                    <Terminal size={14} />
                                                </button>
                                            </>
                                        )}

                                        {canCreate && (
                                            <button
                                                className="btn-ghost"
                                                title="Clone Project Configuration"
                                                onClick={() => handleOpenClone(proj)}
                                                style={{ padding: '0.3rem', borderRadius: 'var(--radius-sm)' }}
                                            >
                                                <Copy size={14} />
                                            </button>
                                        )}

                                        {canArchive && !isArchived && (
                                            <button
                                                className="btn-ghost"
                                                title="Archive Project"
                                                onClick={() => handleOpenArchive(proj)}
                                                style={{ padding: '0.3rem', borderRadius: 'var(--radius-sm)', color: 'var(--error)' }}
                                            >
                                                <Archive size={14} />
                                            </button>
                                        )}

                                        {onNavigateToWorkflow && (
                                            <>
                                                <div style={{ width: '1px', height: '14px', background: 'var(--border)', margin: '0 0.25rem' }} />
                                                <button
                                                    className="btn-ghost"
                                                    onClick={() => onNavigateToWorkflow(proj.id)}
                                                    style={{
                                                        color: 'var(--primary)',
                                                        padding: '0.25rem 0.6rem',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 700,
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '0.25rem',
                                                        borderRadius: 'var(--radius-sm)'
                                                    }}
                                                >
                                                    <span>Workflow</span>
                                                    <ChevronRight size={13} />
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ─── MODAL: CREATE / EDIT PROJECT ─── */}
            {editingProject && (
                <div className="modal-overlay" onClick={() => setEditingProject(null)}>
                    <div className="card modal-box animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: 540 }}>
                        <div className="modal-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Layers size={20} color="var(--primary)" />
                                <h3 className="font-extrabold text-lg" style={{ margin: 0 }}>
                                    {editingProject === 'new' ? 'Create Project Master' : 'Edit Project Profile'}
                                </h3>
                            </div>
                            <button className="btn-ghost" onClick={() => setEditingProject(null)}>
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleSaveProject}>
                            <div className="form-row">
                                <div>
                                    <label className="form-label text-xs font-bold">Project Display Name *</label>
                                    <input
                                        type="text"
                                        className="form-control"
                                        required
                                        placeholder="e.g. Soundbox V2"
                                        value={formData.name}
                                        onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))}
                                    />
                                </div>

                                <div>
                                    <label className="form-label text-xs font-bold">Project Code *</label>
                                    <input
                                        type="text"
                                        className="form-control"
                                        required
                                        maxLength={6}
                                        placeholder="e.g. SBX"
                                        value={formData.code}
                                        onChange={(e) => setFormData(p => ({ ...p, code: e.target.value.toUpperCase() }))}
                                    />
                                </div>
                            </div>

                            <div className="form-row">
                                <div>
                                    <label className="form-label text-xs font-bold">Category *</label>
                                    <select
                                        className="form-control"
                                        value={formData.category}
                                        onChange={(e) => setFormData(p => ({ ...p, category: e.target.value }))}
                                    >
                                        <option value="Device">Device (Smart POS)</option>
                                        <option value="Peripherals">Peripherals</option>
                                        <option value="Inward QC">Inward QC</option>
                                        <option value="Calculator">Calculator Refurbishment</option>
                                        <option value="Custom">Custom Manufacturing</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="form-label text-xs font-bold">Status *</label>
                                    <select
                                        className="form-control"
                                        value={formData.status}
                                        onChange={(e) => setFormData(p => ({ ...p, status: e.target.value }))}
                                    >
                                        <option value="Active">Active</option>
                                        <option value="Draft">Draft</option>
                                        <option value="Archived">Archived</option>
                                    </select>
                                </div>
                            </div>

                            <div style={{ marginBottom: '0.75rem' }}>
                                <label className="form-label text-xs font-bold">
                                    Project Identifier (ID) {editingProject !== 'new' && '(Immutable)'}
                                </label>
                                <input
                                    type="text"
                                    className="form-control"
                                    disabled={editingProject !== 'new'}
                                    placeholder={editingProject === 'new' ? 'Leave empty to auto-slug from name' : formData.id}
                                    value={formData.id}
                                    onChange={(e) => setFormData(p => ({ ...p, id: e.target.value }))}
                                    style={{ fontFamily: 'monospace' }}
                                />
                                <span className="text-muted text-xs">Used as internal unique database key.</span>
                            </div>

                            <div style={{ marginBottom: 0 }}>
                                <label className="form-label text-xs font-bold">Description</label>
                                <textarea
                                    className="form-control"
                                    rows={3}
                                    placeholder="Operational scope, product line specifications, line purpose..."
                                    value={formData.description}
                                    onChange={(e) => setFormData(p => ({ ...p, description: e.target.value }))}
                                />
                            </div>

                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setEditingProject(null)}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary">
                                    {editingProject === 'new' ? 'Create Project' : 'Save Changes'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ─── MODAL: PROJECT SPECS & VARIANTS ─── */}
            {specsProject && (
                <div className="modal-overlay" onClick={() => setSpecsProject(null)}>
                    <div className="card modal-box animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: 640 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <div>
                                <h3 className="font-extrabold text-lg" style={{ margin: 0 }}>
                                    Project Specifications & Variants
                                </h3>
                                <span className="text-muted text-xs">
                                    Project: <strong>{specsProject.name}</strong> ({specsProject.code})
                                </span>
                            </div>
                            <button className="btn-ghost" onClick={() => setSpecsProject(null)}>
                                <X size={18} />
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxHeight: '60vh', overflowY: 'auto', paddingRight: '0.25rem' }}>
                            {/* Product Types */}
                            <div>
                                <label className="form-label text-xs font-bold">Product Types (Intake Sources)</label>
                                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                    <input
                                        type="text"
                                        className="form-control"
                                        placeholder="Add product type (e.g. Reverse, RTO, Warranty)..."
                                        value={specInputs.productType}
                                        onChange={(e) => setSpecInputs(p => ({ ...p, productType: e.target.value }))}
                                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddSpecItem('productTypes', 'productType'); } }}
                                    />
                                    <button type="button" className="btn btn-secondary" onClick={() => handleAddSpecItem('productTypes', 'productType')}>
                                        Add
                                    </button>
                                </div>
                                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                                    {specsData.productTypes.map(item => (
                                        <span key={item} className="status-pill primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                            {item}
                                            <button type="button" onClick={() => handleRemoveSpecItem('productTypes', item)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit' }}>
                                                <X size={12} />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            </div>

                            {/* Supported Models */}
                            <div>
                                <label className="form-label text-xs font-bold">Supported Hardware Models</label>
                                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                    <input
                                        type="text"
                                        className="form-control"
                                        placeholder="Add model name (e.g. Pax A920, Verifone V200)..."
                                        value={specInputs.model}
                                        onChange={(e) => setSpecInputs(p => ({ ...p, model: e.target.value }))}
                                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddSpecItem('models', 'model'); } }}
                                    />
                                    <button type="button" className="btn btn-secondary" onClick={() => handleAddSpecItem('models', 'model')}>
                                        Add
                                    </button>
                                </div>
                                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                                    {specsData.models.map(item => (
                                        <span key={item} className="status-pill info" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                            {item}
                                            <button type="button" onClick={() => handleRemoveSpecItem('models', item)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit' }}>
                                                <X size={12} />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            </div>

                            {/* HW Revisions */}
                            <div>
                                <label className="form-label text-xs font-bold">HW Revisions</label>
                                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                    <input
                                        type="text"
                                        className="form-control"
                                        placeholder="Add HW Revision (e.g. V1.0, V2.1)..."
                                        value={specInputs.hwRevision}
                                        onChange={(e) => setSpecInputs(p => ({ ...p, hwRevision: e.target.value }))}
                                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddSpecItem('hwRevisions', 'hwRevision'); } }}
                                    />
                                    <button type="button" className="btn btn-secondary" onClick={() => handleAddSpecItem('hwRevisions', 'hwRevision')}>
                                        Add
                                    </button>
                                </div>
                                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                                    {specsData.hwRevisions.map(item => (
                                        <span key={item} className="status-pill default" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                            {item}
                                            <button type="button" onClick={() => handleRemoveSpecItem('hwRevisions', item)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit' }}>
                                                <X size={12} />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            </div>

                            {/* SW Revisions */}
                            <div>
                                <label className="form-label text-xs font-bold">Target SW / Firmware Revisions</label>
                                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                    <input
                                        type="text"
                                        className="form-control"
                                        placeholder="Add SW Version (e.g. 2.4.0, 3.1.2)..."
                                        value={specInputs.swRevision}
                                        onChange={(e) => setSpecInputs(p => ({ ...p, swRevision: e.target.value }))}
                                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddSpecItem('swRevisions', 'swRevision'); } }}
                                    />
                                    <button type="button" className="btn btn-secondary" onClick={() => handleAddSpecItem('swRevisions', 'swRevision')}>
                                        Add
                                    </button>
                                </div>
                                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                                    {specsData.swRevisions.map(item => (
                                        <span key={item} className="status-pill success" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                            {item}
                                            <button type="button" onClick={() => handleRemoveSpecItem('swRevisions', item)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit' }}>
                                                <X size={12} />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
                            <button type="button" className="btn btn-secondary" onClick={() => setSpecsProject(null)}>
                                Cancel
                            </button>
                            <button type="button" className="btn btn-primary" onClick={handleSaveSpecs}>
                                Save Specifications
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── MODAL: SERIAL RULES & GOVERNANCE ─── */}
            {serialRulesProject && (
                <div className="modal-overlay" onClick={() => setSerialRulesProject(null)}>
                    <div className="card modal-box animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: 580 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                            <div>
                                <h3 className="font-extrabold text-lg" style={{ margin: 0 }}>
                                    Serial Number Governance & Validation
                                </h3>
                                <span className="text-muted text-xs">
                                    Project: <strong>{serialRulesProject.name}</strong>
                                </span>
                            </div>
                            <button className="btn-ghost" onClick={() => setSerialRulesProject(null)}>
                                <X size={18} />
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {/* Regex Validation Pattern */}
                            <div>
                                <label className="form-label text-xs font-bold">Serial Number Regex Pattern *</label>
                                <input
                                    type="text"
                                    className="form-control font-mono text-sm"
                                    value={serialRulesData.regex}
                                    onChange={(e) => setSerialRulesData(p => ({ ...p, regex: e.target.value }))}
                                    placeholder="^[A-Z0-9-]{6,25}$"
                                />
                                <span className="text-muted text-xs">
                                    Controls scan pattern validation at terminal intake.
                                </span>
                            </div>

                            {/* Live Regex Tester */}
                            <div style={{
                                background: 'var(--bg-main)',
                                border: '1px solid var(--border)',
                                borderRadius: 'var(--radius-md)',
                                padding: '0.75rem'
                            }}>
                                <label className="form-label text-xs font-bold" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                    <Terminal size={14} color="var(--primary)" />
                                    <span>Interactive Serial Tester</span>
                                </label>
                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                    <input
                                        type="text"
                                        className="form-control font-mono text-sm"
                                        placeholder="Type test serial number (e.g. SN12345678)..."
                                        value={serialTestValue}
                                        onChange={(e) => setSerialTestValue(e.target.value)}
                                    />
                                    {isSerialTestValid !== null && (
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.25rem',
                                            padding: '0.4rem 0.65rem',
                                            borderRadius: 'var(--radius-sm)',
                                            background: isSerialTestValid ? 'rgba(22, 101, 52, 0.12)' : 'rgba(153, 27, 27, 0.12)',
                                            color: isSerialTestValid ? 'var(--success)' : 'var(--error)',
                                            fontSize: '11px',
                                            fontWeight: 700
                                        }}>
                                            {isSerialTestValid ? <Check size={14} /> : <X size={14} />}
                                            <span>{isSerialTestValid ? 'VALID' : 'INVALID'}</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Duplicate Policy */}
                            <div>
                                <label className="form-label text-xs font-bold">Duplicate Serial Re-Entry Policy</label>
                                <select
                                    className="form-control"
                                    value={serialRulesData.duplicatePolicy}
                                    onChange={(e) => setSerialRulesData(p => ({ ...p, duplicatePolicy: e.target.value }))}
                                >
                                    <option value="LOOPER">Route to Looper Analysis / Refurbishment (Standard MES)</option>
                                    <option value="BLOCK">Strict Block (Prevent Re-scan of Completed/Active Serials)</option>
                                    <option value="ALLOW">Allow Re-scan with Warning</option>
                                </select>
                            </div>

                            {/* Sub-assembly Requirements */}
                            <div>
                                <label className="form-label text-xs font-bold mb-2">Mandatory Sub-Assembly Scans</label>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                    <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem' }}>
                                        <input
                                            type="checkbox"
                                            checked={serialRulesData.requirePcbScan}
                                            onChange={(e) => setSerialRulesData(p => ({ ...p, requirePcbScan: e.target.checked }))}
                                        />
                                        <span>Require PCB Serial</span>
                                    </label>
                                    <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem' }}>
                                        <input
                                            type="checkbox"
                                            checked={serialRulesData.requireTopPanelScan}
                                            onChange={(e) => setSerialRulesData(p => ({ ...p, requireTopPanelScan: e.target.checked }))}
                                        />
                                        <span>Require Top Panel Scan</span>
                                    </label>
                                    <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem' }}>
                                        <input
                                            type="checkbox"
                                            checked={serialRulesData.requireBottomPanelScan}
                                            onChange={(e) => setSerialRulesData(p => ({ ...p, requireBottomPanelScan: e.target.checked }))}
                                        />
                                        <span>Require Bottom Panel Scan</span>
                                    </label>
                                    <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem' }}>
                                        <input
                                            type="checkbox"
                                            checked={serialRulesData.requireBatteryScan}
                                            onChange={(e) => setSerialRulesData(p => ({ ...p, requireBatteryScan: e.target.checked }))}
                                        />
                                        <span>Require Battery Serial</span>
                                    </label>
                                    <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem' }}>
                                        <input
                                            type="checkbox"
                                            checked={serialRulesData.requireDisplayScan}
                                            onChange={(e) => setSerialRulesData(p => ({ ...p, requireDisplayScan: e.target.checked }))}
                                        />
                                        <span>Require Display Serial</span>
                                    </label>
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
                            <button type="button" className="btn btn-secondary" onClick={() => setSerialRulesProject(null)}>
                                Cancel
                            </button>
                            <button type="button" className="btn btn-primary" onClick={handleSaveSerialRules}>
                                Save Serial Rules
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── MODAL: CLONE PROJECT ─── */}
            {cloningProject && (
                <div className="modal-overlay" onClick={() => setCloningProject(null)}>
                    <div className="card modal-box animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Copy size={20} color="var(--primary)" />
                                <h3 className="font-extrabold text-lg" style={{ margin: 0 }}>
                                    Clone Project Configuration
                                </h3>
                            </div>
                            <button className="btn-ghost" onClick={() => setCloningProject(null)}>
                                <X size={18} />
                            </button>
                        </div>

                        <p className="text-muted text-xs mb-4">
                            Duplicates all specifications, models, and serial rules from <strong>{cloningProject.name}</strong> into a new Project master profile.
                        </p>

                        <form onSubmit={handleExecuteClone}>
                            <div style={{ marginBottom: '0.75rem' }}>
                                <label className="form-label text-xs font-bold">New Project Name *</label>
                                <input
                                    type="text"
                                    className="form-control"
                                    required
                                    value={cloneData.newName}
                                    onChange={(e) => setCloneData(p => ({ ...p, newName: e.target.value }))}
                                />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
                                <div>
                                    <label className="form-label text-xs font-bold">New Project ID *</label>
                                    <input
                                        type="text"
                                        className="form-control font-mono"
                                        required
                                        value={cloneData.newId}
                                        onChange={(e) => setCloneData(p => ({ ...p, newId: e.target.value }))}
                                    />
                                </div>
                                <div>
                                    <label className="form-label text-xs font-bold">New Project Code *</label>
                                    <input
                                        type="text"
                                        className="form-control"
                                        required
                                        maxLength={6}
                                        value={cloneData.newCode}
                                        onChange={(e) => setCloneData(p => ({ ...p, newCode: e.target.value.toUpperCase() }))}
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                                <button type="button" className="btn btn-secondary" onClick={() => setCloningProject(null)}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary">
                                    Clone Project
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ─── MODAL: ARCHIVE PROJECT ─── */}
            {archivingProject && (
                <div className="modal-overlay" onClick={() => setArchivingProject(null)}>
                    <div className="card modal-box animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', color: 'var(--error)' }}>
                            <Archive size={24} />
                            <h3 className="font-extrabold text-lg" style={{ margin: 0 }}>
                                Archive Project Master
                            </h3>
                        </div>

                        <p className="text-muted text-xs mb-3" style={{ lineHeight: 1.6 }}>
                            Are you sure you want to archive <strong>{archivingProject.name}</strong>?
                            Archiving deactivates new unit intake for this project while fully preserving all historical production data.
                        </p>

                        <div style={{ marginBottom: '1.25rem' }}>
                            <label className="form-label text-xs font-bold">Operational Reason for Archiving *</label>
                            <textarea
                                className="form-control"
                                rows={3}
                                required
                                placeholder="State reason for compliance audit record..."
                                value={archiveReason}
                                onChange={(e) => setArchiveReason(e.target.value)}
                            />
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                            <button type="button" className="btn btn-secondary" onClick={() => setArchivingProject(null)}>
                                Cancel
                            </button>
                            <button type="button" className="btn btn-error" onClick={handleExecuteArchive}>
                                Confirm Archive
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProjectStudio;
