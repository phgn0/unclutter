import { LindyAnnotation } from "../../common/annotations/create";
import {
    allowlistDomainOnManualActivationFeatureFlag,
    enableAnnotationsFeatureFlag,
    enableSocialCommentsFeatureFlag,
    getFeatureFlag,
    submittedFeedbackFlag,
} from "../../common/featureFlags";
import browser, { BrowserType, getBrowserType } from "../../common/polyfill";
import { LibraryState } from "../../common/schema";
import { Article } from "@unclutter/library-components/dist/store/_schema";
import { createStylesheetLink, overrideClassname } from "../../common/stylesheets";
import { backgroundColorThemeVariable } from "../../common/theme";
import BottomContainerSvelte from "../../overlay/outline/BottomContainer.svelte";
import { getElementYOffset } from "../../overlay/outline/components/common";
import {
    createRootItem,
    getHeadingItems,
    getOutline,
    OutlineItem,
} from "../../overlay/outline/components/parse";
import TopLeftContainer from "../../overlay/outline/TopLeftContainer.svelte";
import PageAdjacentContainerSvelte from "../../overlay/ui/PageAdjacentContainer.svelte";
import TopRightContainerSvelte from "../../overlay/ui/TopRightContainer.svelte";
import AnnotationsModifier from "./annotations/annotationsModifier";
import ThemeModifier from "./CSSOM/theme";
import TextContainerModifier from "./DOM/textContainer";
import ElementPickerModifier from "./elementPicker";
import LibraryModalModifier from "./libraryModal";
import { PageModifier, trackModifierExecution } from "./_interface";
import ReadingTimeModifier from "./DOM/readingTime";
import { setUserSettingsForDomain } from "../../common/storage";
import LibraryModifier from "./library";
import BodyStyleModifier from "./bodyStyle";
import { reportEventContentScript } from "@unclutter/library-components/dist/common";

@trackModifierExecution
export default class OverlayManager implements PageModifier {
    private domain: string;
    private browserType: BrowserType;
    private themeModifier: ThemeModifier;
    private annotationsModifer: AnnotationsModifier;
    private textContainerModifier: TextContainerModifier;
    private elementPickerModifier: ElementPickerModifier;
    private libraryModifier: LibraryModifier;
    private libraryModalModifier: LibraryModalModifier;
    private bodyStyleModifier: BodyStyleModifier;

    outline: OutlineItem[];
    private flatOutline: OutlineItem[];
    private topleftSvelteComponent: TopLeftContainer;
    private toprightSvelteComponent: TopRightContainerSvelte;
    private pageAdjacentSvelteComponent: PageAdjacentContainerSvelte;
    private bottomSvelteComponent: BottomContainerSvelte;

    private annotationsEnabled: boolean;

    constructor(
        domain: string,
        themeModifier: ThemeModifier,
        annotationsModifer: AnnotationsModifier,
        textContainerModifier: TextContainerModifier,
        elementPickerModifier: ElementPickerModifier,
        libraryModifier: LibraryModifier,
        libraryModalModifier: LibraryModalModifier,
        readingTimeModifier: ReadingTimeModifier,
        bodyStyleModifier: BodyStyleModifier
    ) {
        this.domain = domain;
        this.browserType = getBrowserType();
        this.themeModifier = themeModifier;
        this.annotationsModifer = annotationsModifer;
        this.textContainerModifier = textContainerModifier;
        this.elementPickerModifier = elementPickerModifier;
        this.libraryModifier = libraryModifier;
        this.libraryModalModifier = libraryModalModifier;
        this.bodyStyleModifier = bodyStyleModifier;

        annotationsModifer.annotationListeners.push(this.onAnnotationUpdate.bind(this));
        readingTimeModifier.readingTimeLeftListeners.push(this.onReadingTimeUpdate.bind(this));
        libraryModifier.libraryStateListeners.push(this.updateLibraryState.bind(this));

        // fetch users settings to run code synchronously later
        (async () => {
            this.annotationsEnabled = await getFeatureFlag(enableAnnotationsFeatureFlag);
        })();
    }

    private topleftIframe: HTMLIFrameElement;
    private bottomIframe: HTMLIFrameElement;
    createIframes() {
        this.topleftIframe = createIframeNode("lindy-info-topleft");
        this.topleftIframe.style.setProperty("position", "fixed", "important"); // put on new layer
        this.topleftIframe.style.setProperty(
            "max-width",
            "calc((100vw - var(--lindy-pagewidth)) / 2 - 7px)",
            "important"
        ); // prevent initial transition
        document.documentElement.appendChild(this.topleftIframe);
        insertIframeFont(this.topleftIframe);

        // insert even if not used to set theme variables
        this.bottomIframe = createIframeNode("lindy-info-bottom");
        this.bottomIframe.style.position = "absolute"; // put on new layer
        this.bottomIframe.style.display = "none"; // hide until used
        // if (this.libraryEnabled) {
        //     // allow overflow to the right
        //     this.bottomIframe.style.width = `calc(var(--side-width) + var(--lindy-pagewidth))`;
        // }
        document.documentElement.appendChild(this.bottomIframe);
        insertIframeFont(this.bottomIframe); // TODO run later? need to modify initial dark theme insert then
    }

    renderUi() {
        // insert styles and font definition
        createStylesheetLink(browser.runtime.getURL("overlay/index.css"), "lindy-switch-style");

        this.renderTopLeftContainer();
        this.renderUiContainers();
    }

    setEnableAnnotations(enableAnnotations: boolean) {
        this.topleftSvelteComponent?.$set({
            annotationsEnabled: enableAnnotations,
        });
    }

    parseOutline() {
        const headingItems = getHeadingItems(); // List raw DOM nodes and filter to likely headings
        this.outline = getOutline(headingItems);
        if (this.outline.length <= 3) {
            // Use just article title, as outline likely not useful or invalid
            // taking the first outline entry sometimes doesn't work, e.g. on https://newrepublic.com/maz/article/167263/amazons-global-quest-crush-unions
            this.outline = [createRootItem(headingItems)];
        }

        function flatten(item: OutlineItem): OutlineItem[] {
            return [item].concat(item.children.flatMap(flatten));
        }
        this.flatOutline = this.outline.flatMap(flatten);

        // Remove outline nesting if too large
        if (this.flatOutline.length > 15) {
            this.outline.forEach((_, i) => {
                this.outline[i].children = [];
            });
            this.flatOutline = this.outline;
        }
        if (this.flatOutline.length > 15) {
            this.outline = [this.outline[0]];
            this.flatOutline = [this.outline[0]];
        }

        this.listenToOutlineScroll();
    }

    async renderTopLeftContainer() {
        if (this.browserType === "firefox") {
            // wait until iframe rendered
            // TODO attach listener instead of static wait?
            await new Promise((r) => setTimeout(r, 10));
        }

        // set background color immediately
        this.topleftIframe.contentDocument.body.style.setProperty(
            backgroundColorThemeVariable,
            this.themeModifier.backgroundColor
        );

        // render DOM elements into iframe to simplify message passing
        this.topleftSvelteComponent = new TopLeftContainer({
            target: this.topleftIframe.contentDocument.body,
            props: {
                outline: this.outline, // null at first
                activeOutlineIndex: this.outline?.[0].index,
                annotationsEnabled: this.annotationsEnabled,
                readingTimeLeft: this.readingTimeLeft,
                libraryState: this.libraryModifier.libraryState,
                darkModeEnabled: this.darkModeEnabled,
                libraryModifier: this.libraryModifier,
                libraryModalModifier: this.libraryModalModifier,
            },
        });
    }

    renderUiContainers() {
        // render UI into main page to prevent overlaps with sidebar iframe

        // create DOM container nodes
        const topRightContainer = this.createUiContainer("lindy-page-settings-toprght");
        // const pageAdjacentContainer = this.createUiContainer("lindy-page-settings-pageadjacent");

        // render svelte component
        this.toprightSvelteComponent = new TopRightContainerSvelte({
            target: topRightContainer,
            props: {
                domain: this.domain,
                themeModifier: this.themeModifier,
                annotationsModifer: this.annotationsModifer,
                overlayModifier: this,
                textContainerModifier: this.textContainerModifier,
                elementPickerModifier: this.elementPickerModifier,
            },
        });
        // this.pageAdjacentSvelteComponent = new PageAdjacentContainerSvelte({
        //     target: pageAdjacentContainer,
        //     props: {
        //         domain: this.domain,
        //     },
        // });

        // insert rendered nodes into document
        document.documentElement.appendChild(topRightContainer);
        // document.documentElement.appendChild(pageAdjacentContainer);

        // handle automatic activation here since pageAdjacentContainer disabled
        getFeatureFlag(allowlistDomainOnManualActivationFeatureFlag).then(
            (allowlistOnActivation) => {
                if (allowlistOnActivation) {
                    setUserSettingsForDomain(this.domain, "allow");
                }
            }
        );
    }

    async insertRenderBottomContainer() {
        // run later, once libraryState available

        const submittedAlready = await getFeatureFlag(submittedFeedbackFlag);
        if (submittedAlready) {
            return;
        }

        // only show feedback message after some usage
        if (
            !this.libraryModifier.libraryState?.readingProgress?.articleCount ||
            this.libraryModifier.libraryState?.readingProgress?.articleCount < 5
        ) {
            return;
        }

        this.bodyStyleModifier.setBottomContainerPadding();
        this.bottomIframe.style.display = "block";

        this.bottomSvelteComponent = new BottomContainerSvelte({
            target: this.bottomIframe?.contentDocument.body,
            props: {
                libraryModalModifier: this.libraryModalModifier,
            },
        });
    }

    // insert font into main HTML doc
    insertUiFont() {
        const fontLink = document.createElement("link");
        fontLink.rel = "stylesheet";
        fontLink.href = browser.runtime.getURL("assets/fonts/fontface.css");
        document.head.appendChild(fontLink);
    }

    private createUiContainer(id: string) {
        // create container DOM element
        const container = document.createElement("div");
        container.id = id;
        container.className = `${overrideClassname} lindy-overlay-elem ${id}`;
        container.style.contain = "layout style";
        container.style.visibility = "hidden"; // hide until overlay/index.css applied (so don't set importance)
        container.style.willChange = "opacity";

        return container;
    }

    private uninstallScrollListener: () => void;
    private listenToOutlineScroll() {
        // listen to scroll changes, compare to last header
        let currentOutlineIndex = 0;
        let lowTheshold: number;
        let highTheshold: number;

        const updateTresholds = () => {
            const margin = 20; // a bit more than the auto scroll margin
            lowTheshold = getElementYOffset(this.flatOutline[currentOutlineIndex].element, margin);
            if (currentOutlineIndex + 1 < this.flatOutline.length) {
                highTheshold = getElementYOffset(
                    this.flatOutline[currentOutlineIndex + 1].element,
                    margin
                );
            } else {
                highTheshold = Infinity;
            }
        };
        updateTresholds();

        const handleScroll = (skipRender = false) => {
            if (window.scrollY === 0) {
                // start of document
                currentOutlineIndex = 0;
                updateTresholds();
            } else if (
                window.scrollY + window.innerHeight >=
                document.documentElement.scrollHeight - 20
            ) {
                // end of document
                currentOutlineIndex = this.flatOutline.length - 1;
                updateTresholds();
            } else if (currentOutlineIndex > 0 && window.scrollY < lowTheshold) {
                // scrolled up
                currentOutlineIndex -= 1;
                updateTresholds();

                // check if jumped multiple sections
                handleScroll(true);
            } else if (window.scrollY >= highTheshold) {
                // scrolled down
                currentOutlineIndex += 1;
                updateTresholds();

                // check if jumped multiple sections
                handleScroll(true);
            }

            if (!skipRender) {
                const currentHeading = this.flatOutline[currentOutlineIndex];
                this.topleftSvelteComponent?.$set({
                    activeOutlineIndex: currentHeading.index,
                });
            }
        };

        const scrollListener = () => handleScroll();
        document.addEventListener("scroll", scrollListener);
        this.uninstallScrollListener = () => document.removeEventListener("scroll", scrollListener);
    }

    fadeOutUi() {
        document
            .querySelectorAll(
                "#lindy-page-settings-toprght, #lindy-page-settings-pageadjacent, #lindy-info-topleft, #lindy-info-bottom"
            )
            .forEach((e) => e.classList.add("lindy-ui-fadeout"));

        if (this.uninstallScrollListener) {
            this.uninstallScrollListener();
        }
    }

    removeUi() {
        document
            .querySelectorAll(
                "#lindy-page-settings-toprght, #lindy-page-settings-pageadjacent, #lindy-info-topleft, #lindy-info-bottom"
            )
            .forEach((e) => e.remove());
    }

    // listen to annotation updates and attribute to outline heading
    private totalAnnotationCount = 0;
    private totalSocialCommentsCount = 0;
    private async onAnnotationUpdate(
        action: "set" | "add" | "remove",
        annotations: LindyAnnotation[]
    ) {
        if (!this.flatOutline || this.flatOutline.length === 0) {
            return;
        }

        if (
            action === "remove" &&
            this.totalAnnotationCount === 0 &&
            this.totalSocialCommentsCount === 0
        ) {
            // removing overlapping annotations before displaying them -- ignore this
            return;
        }

        if (action === "set") {
            // reset state
            this.totalAnnotationCount = 0;
            this.totalSocialCommentsCount = 0;
            this.flatOutline.map((_, index) => {
                this.flatOutline[index].myAnnotationCount = 0;
                this.flatOutline[index].socialCommentsCount = 0;
            });
        }

        annotations.map((annotation) => {
            const outlineIndex = this.getOutlineIndexForAnnotation(annotation);

            if (!annotation.isMyAnnotation) {
                if (action === "set" || action === "add") {
                    this.totalSocialCommentsCount += 1;
                    this.flatOutline[outlineIndex].socialCommentsCount += 1;
                } else if (action === "remove") {
                    this.totalSocialCommentsCount -= 1;
                    this.flatOutline[outlineIndex].socialCommentsCount -= 1;
                }
            } else {
                if (action === "set" || action === "add") {
                    this.totalAnnotationCount += 1;
                    this.flatOutline[outlineIndex].myAnnotationCount += 1;
                } else if (action === "remove") {
                    this.totalAnnotationCount -= 1;
                    this.flatOutline[outlineIndex].myAnnotationCount -= 1;
                }
            }
        });

        this.topleftSvelteComponent?.$set({
            totalAnnotationCount: this.totalAnnotationCount,
            outline: this.outline,
        });

        if (this.totalSocialCommentsCount === 0) {
            const socialAnnotationsEnabled = await getFeatureFlag(enableSocialCommentsFeatureFlag);
            if (!socialAnnotationsEnabled) {
                // expected to find 0 displayed social annotations
                // don't update counts, we might still want to show them
                return;
            }
        }
        setTimeout(() => {
            this.toprightSvelteComponent?.$set({
                anchoredSocialHighlightsCount: this.totalSocialCommentsCount,
            });
        }, 4000);
        browser.runtime.sendMessage(null, {
            event: "setSocialAnnotationsCount",
            count: this.totalSocialCommentsCount,
        });
    }

    disableSocialAnnotations() {
        this.flatOutline.map((_, index) => {
            this.flatOutline[index].socialCommentsCount = 0;
        });
        this.topleftSvelteComponent?.$set({
            totalAnnotationCount: this.totalAnnotationCount,
            outline: this.outline,
        });
    }

    private getOutlineIndexForAnnotation(annotation: LindyAnnotation): number {
        if (!this.flatOutline) {
            return null;
        }

        // TODO cache outline offsets?

        let lastIndex: number = 0;
        while (lastIndex + 1 < this.flatOutline.length) {
            const item = this.flatOutline[lastIndex + 1];
            const startOffset = getElementYOffset(item.element);
            if (annotation.displayOffset < startOffset) {
                break;
            }

            lastIndex += 1;
        }

        return lastIndex;
    }

    private maxPageProgress = 0;
    private readingTimeLeft: number = null;
    onReadingTimeUpdate(pageProgress: number, readingTimeLeft: number) {
        this.readingTimeLeft = readingTimeLeft;
        this.topleftSvelteComponent?.$set({
            readingTimeLeft,
        });

        if (this.bottomSvelteComponent && pageProgress >= 0.9 && this.maxPageProgress < 0.9) {
            reportEventContentScript("seeFeedbackMessage");
        }

        this.maxPageProgress = Math.max(this.maxPageProgress, pageProgress);
    }

    updateLibraryState(libraryState: LibraryState) {
        this.topleftSvelteComponent?.$set({
            libraryState,
        });

        this.libraryModalModifier.updateLibraryState(libraryState);
    }

    updateLinkedArticles(linkedArticles: Article[]) {
        this.bottomSvelteComponent?.$set({
            linkedArticles,
        });
    }

    private darkModeEnabled: boolean = null;
    async setOverlayDarkMode(darkModeEnabled: boolean) {
        this.darkModeEnabled = darkModeEnabled;

        if (darkModeEnabled) {
            createStylesheetLink(
                browser.runtime.getURL("overlay/indexDark.css"),
                "dark-mode-ui-style"
            );
            createStylesheetLink(
                browser.runtime.getURL("overlay/outline/outlineDark.css"),
                "dark-mode-ui-style",
                this.topleftIframe.contentDocument?.head.lastChild as HTMLElement,
                this.topleftIframe.contentDocument
            );
            createStylesheetLink(
                browser.runtime.getURL("overlay/outline/bottomDark.css"),
                "dark-mode-ui-style",
                this.bottomIframe?.contentDocument?.head.lastChild as HTMLElement,
                this.bottomIframe?.contentDocument
            );
        } else {
            document.querySelectorAll(".dark-mode-ui-style").forEach((e) => e.remove());
            this.topleftIframe.contentDocument?.head
                ?.querySelectorAll(".dark-mode-ui-style")
                .forEach((e) => e.remove());
            this.bottomIframe?.contentDocument?.head
                ?.querySelectorAll(".dark-mode-ui-style")
                .forEach((e) => e.remove());
        }

        this.topleftSvelteComponent?.$set({
            darkModeEnabled: this.darkModeEnabled,
        });
        this.libraryModalModifier.setDarkMode(darkModeEnabled);
    }
}

export function createIframeNode(id: string) {
    const iframe = document.createElement("iframe");
    iframe.classList.add("lindy-overlay-elem");
    iframe.id = id;

    iframe.setAttribute("scrolling", "no");
    iframe.setAttribute("frameBorder", "0");
    iframe.style.setProperty("contain", "strict", "important");
    iframe.style.setProperty("z-index", "3000", "important");

    return iframe;
}

export function insertIframeFont(iframe: HTMLIFrameElement) {
    if (getBrowserType() === "firefox") {
        // Firefox bug: need to wait until iframe initial render to insert elements
        // See https://stackoverflow.com/questions/60814167/firefox-deleted-innerhtml-of-generated-iframe
        setTimeout(() => {
            insertIframeFontUnsafe(iframe);
        }, 10);
    } else {
        insertIframeFontUnsafe(iframe);
    }
}

function insertIframeFontUnsafe(iframe: HTMLIFrameElement) {
    if (!iframe.contentDocument) {
        return;
    }

    const fontLink = iframe.contentDocument.createElement("link");
    fontLink.rel = "stylesheet";
    fontLink.href = browser.runtime.getURL("assets/fonts/fontface.css");
    iframe.contentDocument.head.appendChild(fontLink);
}
