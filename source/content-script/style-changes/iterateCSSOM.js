import browser from "../../common/polyfill";
import { createStylesheetText } from "./common";

export async function iterateCSSOM() {
    const stylesheets = [...document.styleSheets];
    const accessibleStylesheets = await Promise.all(
        stylesheets.map(async (sheet) => {
            // Only consider applicable stylesheets
            // e.g. 'print' at https://www.theguardian.com/world/2022/mar/25/russian-troops-mutiny-commander-ukraine-report-western-officials
            // TODO also consider responsive styles that would become valid?
            if (
                sheet.disabled ||
                !window.matchMedia(sheet.media.mediaText).matches
            ) {
                console.log(
                    `Excluding stylesheet with media condition '${sheet.media.mediaText}'`
                );
                return;
            }

            try {
                sheet.cssRules;
                return sheet;
            } catch (err) {
                console.log(`Replicating ${sheet.href}...`);

                const styleId = sheet.href.split("/").pop().split(".")[0];

                let cssText = await fetchCssRemote(sheet.href);

                const baseUrl = sheet.href || window.location.href;
                cssText = transformProxyCssText(cssText, baseUrl);

                if (cssText) {
                    const element = createStylesheetText(
                        cssText,
                        "lindy-stylesheet-proxy"
                    );

                    disableStylesheet(sheet.ownerNode, styleId);

                    return element.sheet;
                }
            }
        })
    );
    // TODO listen to new

    const oldWidth = window.innerWidth;
    const newWidth = 750;
    const fixedPositionRules = [];
    const expiredRules = [];
    const newRules = [];
    function mapAggregatedRule(aggregationNode) {
        for (const rule of aggregationNode.cssRules) {
            if (rule.type === CSSRule.STYLE_RULE) {
                if (
                    rule.style.getPropertyValue("position") === "fixed" ||
                    rule.style.getPropertyValue("position") === "sticky"
                ) {
                    fixedPositionRules.push(rule);
                }
                styleRuleTweaks(rule);
            } else if (rule.type === CSSRule.SUPPORTS_RULE) {
                // recurse
                mapAggregatedRule(rule);
            } else if (rule.type === CSSRule.MEDIA_RULE) {
                // recurse
                mapAggregatedRule(rule);

                const [appliedBefore, appliesNow] = parseMediaCondition(
                    rule,
                    oldWidth,
                    newWidth
                );
                if (appliedBefore && !appliesNow) {
                    expiredRules.push(
                        ...[...rule.cssRules].filter((rule) => !!rule.style)
                    );
                }
                if (!appliedBefore && appliesNow) {
                    newRules.push(
                        ...[...rule.cssRules].filter((rule) => !!rule.style)
                    );
                }
            }
        }
    }

    accessibleStylesheets
        .filter((sheet) => sheet)
        .map((sheet) => {
            mapAggregatedRule(sheet);
        });

    return [
        hideNoise.bind(null, fixedPositionRules, expiredRules, newRules),
        enableResponsiveStyle.bind(null, expiredRules, newRules),
        restoreOriginalStyle.bind(null, expiredRules, newRules),
    ];
}

function parseMediaCondition(rule, oldWidth, newWidth) {
    // TODO ideally, iterate the media list
    const condition = rule.media[0];

    // get viewport range where condition applies
    let min = 0;
    let max = Infinity;
    let minMatch = /\(min-width:\s*([0-9]+)([a-z]+)/g.exec(condition);
    let maxMatch = /\(max-width:\s*([0-9]+)([a-z]+)/g.exec(condition);
    if (minMatch) {
        min = unitToPx(minMatch[2], parseFloat(minMatch[1]));
    }
    if (maxMatch) {
        max = unitToPx(maxMatch[2], parseFloat(maxMatch[1]));
    }

    const appliedBefore = min <= oldWidth && oldWidth <= max;
    const appliesNow = min <= newWidth && newWidth <= max;

    return [appliedBefore, appliesNow];
}

function unitToPx(unit, value) {
    if (unit === "px") {
        return value;
    } else if (unit === "em" || unit === "rem") {
        const rootFontSize = window
            .getComputedStyle(document.documentElement)
            .getPropertyValue("font-size");
        const rootFontSizePx = parseFloat(rootFontSize.match(/\d+/)[0]);

        return value * rootFontSizePx;
    } else {
        console.error(`Unexpected media query breakpoint unit ${unit}:`, value);
        return 1000000;
    }
}

function styleRuleTweaks(rule) {
    // hack: remove vw and vh rules for now (mostly used to add margin, which we already add elsewhere)
    // conditionScale is not neccessarily equal to actual pageview with, so cannot easily get correct margin
    if (
        rule.style.getPropertyValue("width")?.includes("vw") ||
        rule.style.getPropertyValue("min-width")?.includes("vw")
    ) {
        rule.style.setProperty("width", "100%");
        rule.style.setProperty("min-width", "100%");
    }
    if (
        rule.style.getPropertyValue("height")?.includes("vh") ||
        rule.style.getPropertyValue("min-height")?.includes("vh")
    ) {
        rule.style.setProperty("height", "100%");
        rule.style.setProperty("min-height", "100%");
    }
}

const animatedRulesToHide = []; // list of obj and previous display style
let fixedPositionRules = [];
function hideNoise(fixedPositionRulesArg, expiredRules, newRules) {
    fixedPositionRules = fixedPositionRulesArg;

    fixedPositionRulesArg.map((rule) => {
        // Check which elements were actually visible
        // This does not catch all visible elements, e.g. if another rule overrides opacity
        // Alternative is window.getComputedStyle(), which is more expensive to call
        if (
            rule.style.getPropertyValue("display") !== "none" &&
            rule.style.getPropertyValue("opacity") !== "0"
        ) {
            // Element is visible right now, so re-enable when disabling pageview
            // might be hidden by another rule, which is fine

            // Save current display to keep e.g. flex at https://www.esa.int/Enabling_Support/Space_Transportation/Ariane_6_Vega-C_microlaunchers_ESA_looks_to_full_range_of_launch_options_for_European_institutional_missions
            animatedRulesToHide.push([
                rule,
                rule.style.getPropertyValue("display"),
            ]);
        }

        // Hide every static element as it could popup up later
        rule.style.removeProperty("display");
        rule.style.setProperty("opacity", "0", "important");
        rule.style.setProperty("visibility", "hidden", "important");
        rule.style.setProperty(
            "transition",
            "visibility 0.2s, opacity 0.2s linear"
        );
    });

    // TODO fade-out expiredRules?

    newRules.map((rule) => {
        if (rule.style.getPropertyValue("display") === "none") {
            // Modify old style to get updated cssText
            rule.style.removeProperty("display");
            rule.style.setProperty("opacity", "0", "important");
            rule.style.setProperty("visibility", "hidden", "important");
            rule.style.setProperty(
                "transition",
                "visibility 0.2s, opacity 0.2s linear"
            );

            // Insert new rule for the fade-out
            const newIndex = rule.parentStyleSheet.insertRule(
                rule.cssText,
                rule.parentStyleSheet.cssRules.length
            );
            const newRule = rule.parentStyleSheet.cssRules[newIndex];

            // Revert old style changes
            rule.style.setProperty("display", "none");

            // Handle fade-in
            animatedRulesToHide.push([newRule, "block"]);
        }
    });
}

const originalStyleList = [];
const addedRules = [];
function enableResponsiveStyle(expiredRules, newRules) {
    expiredRules.map((rule, index) => {
        // actually deleting & reinserting rule is hard -- need to keep track of mutating rule index
        // so simply remove style properties from rule

        // save properties for restoration later
        // TODO measure performance of this
        const obj = {};
        for (const key of rule.style) {
            obj[key] = rule.style.getPropertyValue(key);
        }
        originalStyleList.push(obj);

        // this works, even if it should be read-only in theory
        rule.style = {};
    });

    newRules.map((rule) => {
        const newIndex = rule.parentStyleSheet.insertRule(
            rule.cssText,
            rule.parentStyleSheet.cssRules.length
        );
        const newRule = rule.parentStyleSheet.cssRules[newIndex];

        addedRules.push(newRule);
    });

    fixedPositionRules.map((rule) => {
        rule.style.setProperty("display", "none", "important");
    });
    animatedRulesToHide.map(([rule, display]) => {
        rule.style.setProperty("display", "none", "important");
    });
}

function restoreOriginalStyle(expiredRules) {
    expiredRules.map((rule, index) => {
        for (const [key, value] of Object.entries(originalStyleList[index])) {
            rule.style.setProperty(key, value);
        }
    });

    addedRules.map((rule) => {
        rule.style = {};
    });

    // set up for animation again
    animatedRulesToHide.map(([rule, display]) => {
        rule.style.setProperty("opacity", "0", "important");
        rule.style.setProperty("visibility", "hidden", "important");

        // Position: sticky doesn't show correctly unfortunately
        // e.g. at https://slack.com/intl/en-gb/blog/collaboration/etiquette-tips-in-slack

        rule.style.setProperty("display", display);
    });
}

export function fadeInNoise() {
    animatedRulesToHide.map(([rule, display]) => {
        rule.style.removeProperty("opacity", "1");
        rule.style.removeProperty("visibility", "visible");
        rule.style.setProperty(
            "transition",
            "visibility 0.2s, opacity 0.2s linear"
        );
    });
}

const disabledClassname = "lindylearn-disabled-style";
function disableStylesheet(elem, styleId) {
    elem.disabled = true;
    elem.classList.add(disabledClassname);
    elem.classList.add(styleId);
}

export function reenableOriginalStylesheets() {
    [...document.getElementsByClassName(disabledClassname)].map((elem) => {
        elem.classList.remove(disabledClassname);
        elem.disabled = false;
    });

    document
        .querySelectorAll(".lindy-stylesheet-proxy")
        .forEach((e) => e.remove());
}

// Send an event to the extensions service worker to rewrite a stylesheet, and wait for a response.
async function fetchCssRemote(url) {
    const response = await browser.runtime.sendMessage(null, {
        event: "fetchCss",
        url,
    });
    if (response.status === "success") {
        return response.cssText;
    }
    if (response.status === "error") {
        console.error(`Error fetching CSS:`, err);
        return null;
    }
    console.error(`Error fetching CSS`);
    return null;
}
function transformProxyCssText(cssText, baseUrl) {
    // Transform css text before old style is replaced to prevent flicker

    // New inline style will have different base ref than imported stylesheets, so replace relative file references
    // e.g. https://arstechnica.com/science/2022/03/plant-based-nanocrystals-could-be-the-secret-to-preventing-crunchy-ice-cream/
    cssText = cssText.replace(
        /url\((('.+?')|(".+?")|([^\)]*?))\)/g,
        (match) => {
            try {
                const relativeUrl = match
                    .replace(/^url\((.*)\)$/, "$1")
                    .trim()
                    .replace(/^"(.*)"$/, "$1")
                    .replace(/^'(.*)'$/, "$1");
                const absoluteUrl = new URL(relativeUrl, baseUrl);

                return `url("${absoluteUrl}")`;
            } catch (err) {
                console.error(
                    "Not able to replace relative URL with Absolute URL, skipping",
                    err
                );
                return match;
            }
        }
    );

    // TODO parse imported sheets as well? or get notified through listener?
    // TODO find example site for import rules
    // cssText = cssText.replace(
    //     /@import\s*(url\()?(('.+?')|(".+?")|([^\)]*?))\)? ?(screen)?;?/gi,
    //     (match) => {
    //         try {
    //             console.log(match);

    //             return match;
    //         } catch (err) {
    //             console.error(
    //                 "Not able to replace relative URL with Absolute URL, skipping",
    //                 err
    //             );
    //             return match;
    //         }
    //     }
    // );

    return cssText;
}

export function disable() {}
