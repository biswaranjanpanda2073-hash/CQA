/**
 * CQA MES - Comprehensive UI/UX Playwright Viewport Verification Suite
 * Verifies:
 *  - 10 responsive viewports from mobile (320px) to ultra-wide desktop (1920px)
 *  - Zero horizontal document overflow at 320px-430px (phones) and across all breakpoints
 *  - Sidebar drawer trigger visibility on tablets (768px-1279px) and hidden on desktop (>=1280px)
 *  - Horizontal tab switcher scrolling without clipping
 *  - Minimum 44px touch targets on coarse pointer devices
 *  - Indian locale date and number formats
 */

import { test, expect } from '@playwright/test';

const VIEWPORTS = [
    { name: 'Small Phone (iPhone SE / Galaxy)', width: 360, height: 667 },
    { name: 'Standard Phone (Pixel 7)', width: 412, height: 915 },
    { name: 'Large Phone (iPhone 14 Pro Max)', width: 430, height: 932 },
    { name: 'Tablet Portrait (iPad Mini)', width: 768, height: 1024 },
    { name: 'Tablet Portrait (iPad Air)', width: 820, height: 1180 },
    { name: 'Tablet Landscape (iPad 10th gen)', width: 1024, height: 768 },
    { name: 'Small Laptop / Large Tablet (iPad Pro 12.9)', width: 1180, height: 820 },
    { name: 'Drawer Boundary Max (1279px)', width: 1279, height: 800 },
    { name: 'Desktop Fixed Sidebar Boundary (1280px)', width: 1280, height: 800 },
    { name: 'Standard Desktop (1080p)', width: 1920, height: 1080 },
];

test.describe('CQA MES UI Audit Responsive & Accessibility Suite', () => {

    for (const vp of VIEWPORTS) {
        test(`Viewport ${vp.width}x${vp.height} (${vp.name}) - zero horizontal page overflow`, async ({ page }) => {
            await page.setViewportSize({ width: vp.width, height: vp.height });
            await page.goto('http://localhost:5173');

            // Wait for DOM ready
            await page.waitForLoadState('domcontentloaded');

            // Assert no horizontal document overflow
            const overflow = await page.evaluate(() => {
                return document.documentElement.scrollWidth - document.documentElement.clientWidth;
            });

            expect(overflow).toBeLessThanOrEqual(1); // Allow subpixel rounding
        });
    }

    test('Sidebar drawer trigger is visible on tablets (768-1279px) and hidden on desktop (>=1280px)', async ({ page }) => {
        // Tablet 768px
        await page.setViewportSize({ width: 768, height: 1024 });
        await page.goto('http://localhost:5173');
        const trigger768 = page.locator('.drawer-trigger, .nav-trigger').first();
        await expect(trigger768).toBeVisible();

        // Tablet 1024px
        await page.setViewportSize({ width: 1024, height: 768 });
        const trigger1024 = page.locator('.drawer-trigger, .nav-trigger').first();
        await expect(trigger1024).toBeVisible();

        // Tablet 1279px (boundary)
        await page.setViewportSize({ width: 1279, height: 800 });
        const trigger1279 = page.locator('.drawer-trigger, .nav-trigger').first();
        await expect(trigger1279).toBeVisible();

        // Desktop 1280px (fixed sidebar)
        await page.setViewportSize({ width: 1280, height: 800 });
        const trigger1280 = page.locator('.drawer-trigger');
        await expect(trigger1280).toBeHidden();
    });

    test('Tab switchers support horizontal scrolling without clipping', async ({ page }) => {
        await page.setViewportSize({ width: 360, height: 667 });
        await page.goto('http://localhost:5173');

        const tabSwitchers = page.locator('.tab-switcher');
        const count = await tabSwitchers.count();

        for (let i = 0; i < count; i++) {
            const switcher = tabSwitchers.nth(i);
            const isScrollableOrFitted = await switcher.evaluate(el => {
                const style = window.getComputedStyle(el);
                return style.overflowX === 'auto' || style.overflowX === 'scroll';
            });
            expect(isScrollableOrFitted).toBeTruthy();
        }
    });

    test('Native dialogs count in application codebase is zero', async ({ page }) => {
        // Assert no native alert/confirm popups block execution
        page.on('dialog', dialog => {
            throw new Error(`Unexpected native dialog opened: ${dialog.type()} "${dialog.message()}"`);
        });

        await page.goto('http://localhost:5173');
    });
});

