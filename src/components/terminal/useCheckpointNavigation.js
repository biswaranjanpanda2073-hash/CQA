import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * useCheckpointNavigation
 * Reusable universal keyboard shortcut & focus navigation hook for station checkpoints.
 * 
 * Safety & Behavior Rules:
 * 1. Automatically activates Checkpoint #01 upon load.
 * 2. Resets activeIndex to 0 whenever unitId changes (new valid SN).
 * 3. Only ONE checkpoint is active at a time.
 * 4. Shift + ArrowRight: moves focus to next checkpoint (stops at last, no wrap).
 * 5. Shift + ArrowLeft: moves focus to previous checkpoint (stops at first, no wrap).
 * 6. Mouse click on card: activates clicked checkpoint.
 * 7. P / F / H shortcuts:
 *    - Ignored if focus is inside input, textarea, select, or contenteditable.
 *    - Applies only to active checkpoint.
 *    - Automatically moves to next checkpoint upon successful update.
 * 8. Enter key on value/data checkpoint:
 *    - Invokes onValueSubmit(activeIndex, currentItem).
 *    - If valid/true, moves to next checkpoint.
 *    - If invalid/false, stays on current checkpoint.
 *    - Always prevents default form submit.
 * 9. Moving focus NEVER alters checkpoint results.
 * 10. Prevents duplicate event listeners and duplicate submissions.
 */
export function useCheckpointNavigation({
    items = [],
    unitId = '',
    onStatusSelect = null,
    onValueSubmit = null,
    isItemValueType = null,
    enabled = true
}) {
    const [activeIndex, setActiveIndex] = useState(0);
    const [prevUnitId, setPrevUnitId] = useState(unitId);

    // 1. Reset activeIndex to 0 whenever a new valid SN is loaded (React-recommended state adjustment)
    if (unitId !== prevUnitId) {
        setPrevUnitId(unitId);
        setActiveIndex(0);
    }

    // 2. Keep latest state in ref to avoid stale closures in event listener
    const stateRef = useRef({
        activeIndex,
        items,
        unitId,
        onStatusSelect,
        onValueSubmit,
        isItemValueType,
        enabled
    });

    useEffect(() => {
        stateRef.current = {
            activeIndex,
            items,
            unitId,
            onStatusSelect,
            onValueSubmit,
            isItemValueType,
            enabled
        };
    }, [activeIndex, items, unitId, onStatusSelect, onValueSubmit, isItemValueType, enabled]);

    // Boundary-safe navigation
    const navigateNext = useCallback(() => {
        setActiveIndex(prev => {
            const count = stateRef.current.items.length;
            if (count === 0) return 0;
            return Math.min(count - 1, prev + 1);
        });
    }, []);

    const navigatePrev = useCallback(() => {
        setActiveIndex(prev => {
            return Math.max(0, prev - 1);
        });
    }, []);

    // 3. Centralized keyboard event listener
    useEffect(() => {
        const handleKeyDown = (e) => {
            const { enabled, items, activeIndex, onStatusSelect, onValueSubmit, isItemValueType } = stateRef.current;
            if (!enabled || !items || items.length === 0) return;

            // Prevent rapid key-repeat repeats
            if (e.repeat && ['p', 'P', 'f', 'F', 'h', 'H', 'Enter'].includes(e.key)) {
                return;
            }

            const target = e.target;
            const isInsideInput = target && (
                target.tagName === 'INPUT' ||
                target.tagName === 'TEXTAREA' ||
                target.tagName === 'SELECT' ||
                target.isContentEditable
            );

            // Allow native button behavior (Enter, Space, etc.) without interception
            const isButton = target && (
                target.tagName === 'BUTTON' ||
                (typeof target.closest === 'function' && target.closest('button'))
            );
            if (isButton) {
                return;
            }

            // ── Shift + Arrow Navigation ──
            if (e.shiftKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
                e.preventDefault();
                if (e.key === 'ArrowRight') {
                    navigateNext();
                } else {
                    navigatePrev();
                }
                return;
            }

            // ── When User is Focused Inside an Input / Textarea ──
            if (isInsideInput) {
                // If the user pressed ENTER inside a value-based input
                if (e.key === 'Enter') {
                    const currentItem = items[activeIndex];
                    const isValue = isItemValueType 
                        ? isItemValueType(activeIndex, currentItem) 
                        : (currentItem?.type === 'DATA');

                    if (isValue && onValueSubmit) {
                        e.preventDefault(); // Always prevent default form submission!
                        const valid = onValueSubmit(activeIndex, currentItem);
                        if (valid !== false) {
                            navigateNext();
                        }
                        return;
                    }
                    // For multiline textareas, let Enter create a new line normally
                    if (target.tagName === 'TEXTAREA') {
                        return;
                    }
                    // For other inputs, prevent premature form submission
                    e.preventDefault();
                    return;
                }

                // CRITICAL SAFETY: P / F / H must NOT be intercepted when typing inside inputs/textareas!
                return;
            }

            // ── When User is NOT Inside an Input / Textarea ──
            const currentItem = items[activeIndex];
            const isValue = isItemValueType 
                ? isItemValueType(activeIndex, currentItem) 
                : (currentItem?.type === 'DATA');

            // ENTER key outside inputs: prevent default form submission
            if (e.key === 'Enter') {
                e.preventDefault();
                if (isValue && onValueSubmit) {
                    const valid = onValueSubmit(activeIndex, currentItem);
                    if (valid !== false) {
                        navigateNext();
                    }
                }
                return;
            }

            const keyLower = e.key.toLowerCase();

            // P → PASS
            if (keyLower === 'p') {
                e.preventDefault();
                if (onStatusSelect) {
                    const res = onStatusSelect(activeIndex, currentItem, 'Pass');
                    if (res !== false) {
                        navigateNext();
                    }
                }
                return;
            }

            // F → FAIL
            if (keyLower === 'f') {
                e.preventDefault();
                if (onStatusSelect) {
                    const res = onStatusSelect(activeIndex, currentItem, 'Fail');
                    if (res !== false) {
                        navigateNext();
                    }
                }
                return;
            }

            // H → HOLD
            if (keyLower === 'h') {
                e.preventDefault();
                if (onStatusSelect) {
                    const res = onStatusSelect(activeIndex, currentItem, 'Hold');
                    if (res !== false) {
                        navigateNext();
                    }
                }
                return;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [navigateNext, navigatePrev]);

    return {
        activeIndex,
        setActiveIndex,
        navigateNext,
        navigatePrev
    };
}

export default useCheckpointNavigation;
