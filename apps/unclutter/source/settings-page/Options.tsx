import React from "react";
import {
    allowlistDomainOnManualActivationFeatureFlag,
    enableArchiveDetection,
    enableBootUnclutterMessage,
    enableSocialCountsFeatureFlag,
    getFeatureFlag,
    hypothesisSyncFeatureFlag,
} from "../common/featureFlags";
import browser, { getBrowserType } from "../common/polyfill";
import { reportEventContentScript } from "@unclutter/library-components/dist/common/messaging";
import ContributionStats from "./ContributionStats";
import DomainSettingsList from "./DomainSettingsList";
import FeatureFlagSwitch from "./FeatureFlagSwitch";
import HypothesisConfig from "./HypothesisConfig";
import { useAutoDarkMode } from "@unclutter/library-components/dist/common";
import clsx from "clsx";

function OptionsPage({}) {
    React.useEffect(() => {
        reportEventContentScript("openSettings");
    }, []);

    const [automaticActivationEnabled, setAutomaticActivationEnabled] = React.useState(null);
    React.useEffect(() => {
        getFeatureFlag(allowlistDomainOnManualActivationFeatureFlag).then(
            setAutomaticActivationEnabled
        );
    }, []);

    const [hypothesisEnabled, setHypothesisEnabled] = React.useState(null);
    React.useEffect(() => {
        (async function () {
            const enabled = await getFeatureFlag(hypothesisSyncFeatureFlag);
            setHypothesisEnabled(enabled);
        })();
    }, []);
    function onChangeHypothesisSync(enabled) {
        setHypothesisEnabled(enabled);
    }

    // to get actual the shortcut we'd need to use a custom command other than '_execute_action'
    const [keyboardShortcut, setKeyboardShortcut] = React.useState("");
    browser.runtime
        .getPlatformInfo()
        .then(({ os }) => setKeyboardShortcut(os === "mac" ? "⌥+C" : "Alt+C"));

    const keyboardShortcutsUrl =
        getBrowserType() === "chromium"
            ? "chrome://extensions/shortcuts"
            : "https://support.mozilla.org/en-US/kb/manage-extension-shortcuts-firefox";
    const unclutterLibraryLink =
        getBrowserType() === "firefox"
            ? "https://addons.mozilla.org/en-GB/firefox/addon/unclutter-library"
            : "https://chrome.google.com/webstore/detail/bghgkooimeljolohebojceacblokenjn";

    const darkModeEnabled = useAutoDarkMode();

    return (
        <div className={clsx(darkModeEnabled && "dark")}>
            <div className="flex flex-col gap-5 text-gray-900 dark:text-white">
                <OptionsGroup
                    headerText="Unclutter articles"
                    iconSvg={
                        <svg className="w-4" viewBox="0 0 384 512">
                            <path
                                fill="currentColor"
                                d="M289.7 .0006C308.8 .0006 322.6 18.26 317.4 36.61L263.8 224H349.1C368.4 224 384 239.6 384 258.9C384 269.2 379.5 278.9 371.7 285.6L112.9 505.2C107.7 509.6 101.1 512 94.27 512C75.18 512 61.4 493.7 66.64 475.4L120.2 288H33.74C15.1 288 0 272.9 0 254.3C0 244.4 4.315 235 11.81 228.6L271.1 6.893C276.3 2.445 282.9 0 289.7 0V.0006zM253.6 84.99L72.36 240H152C159.5 240 166.6 243.5 171.2 249.5C175.7 255.6 177.1 263.4 175.1 270.6L130.3 427.5L313.5 272H232C224.5 272 217.4 268.5 212.8 262.5C208.3 256.4 206.9 248.6 208.9 241.4L253.6 84.99z"
                            />
                        </svg>
                    }
                >
                    <p>
                        Unclutter articles by clicking the extension icon or pressing{" "}
                        <div
                            className="inline-block px-1 py-0.5 text-gray-600 shadow-inner dark:text-gray-300"
                            style={{ background: "var(--embedded-background)" }}
                        >
                            {keyboardShortcut}
                        </div>{" "}
                        (
                        <a
                            href={keyboardShortcutsUrl}
                            className="underline"
                            onClick={(e) => {
                                // cannot open chrome:// urls via <a> link
                                browser.tabs.create({
                                    url: keyboardShortcutsUrl,
                                });
                                e.preventDefault();
                            }}
                        >
                            customize
                        </a>
                        )
                    </p>
                    {/* <FeatureFlagSwitch featureFlagKey={enableArchiveDetection}>
                        Use{" "}
                        <a href="" className="underline" target="_blank" rel="noopener noreferrer">
                            web archives
                        </a>{" "}
                        to show unavailable articles
                    </FeatureFlagSwitch> */}
                    {/* <FeatureFlagSwitch featureFlagKey={enableBootUnclutterMessage}>
                        Show unclutter button on web pages{" "}
                        <a
                            href="https://github.com/lindylearn/unclutter/blob/main/docs/article-detection.md#unclutter-reminder"
                            className="underline"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            that look like articles
                        </a>
                    </FeatureFlagSwitch> */}

                    <FeatureFlagSwitch
                        featureFlagKey={allowlistDomainOnManualActivationFeatureFlag}
                        onChange={setAutomaticActivationEnabled}
                    >
                        Automatically activate on websites you unclutter once
                    </FeatureFlagSwitch>
                    <DomainSettingsList />
                </OptionsGroup>

                <OptionsGroup
                    headerText="Your Library"
                    iconSvg={
                        <svg className="w-5" viewBox="0 0 640 512">
                            <path
                                fill="currentColor"
                                d="M443.5 17.94C409.8 5.608 375.3 0 341.4 0C250.1 0 164.6 41.44 107.1 112.1c-6.752 8.349-2.752 21.07 7.375 24.68C303.1 203.8 447.4 258.3 618.4 319.1c1.75 .623 3.623 .9969 5.5 .9969c8.25 0 15.88-6.355 16-15.08C643 180.7 567.2 62.8 443.5 17.94zM177.1 108.4c42.88-36.51 97.76-58.07 154.5-60.19c-4.5 3.738-36.88 28.41-70.25 90.72L177.1 108.4zM452.6 208.1L307.4 155.4c14.25-25.17 30.63-47.23 48.13-63.8c25.38-23.93 50.13-34.02 67.51-27.66c17.5 6.355 29.75 29.78 33.75 64.42C459.6 152.4 457.9 179.6 452.6 208.1zM497.8 224.4c7.375-34.89 12.13-76.76 4.125-117.9c45.75 38.13 77.13 91.34 86.88 150.9L497.8 224.4zM576 488.1C576 501.3 565.3 512 552 512L23.99 510.4c-13.25 0-24-10.72-24-23.93c0-13.21 10.75-23.93 24-23.93l228 .6892l78.35-214.8l45.06 16.5l-72.38 198.4l248.1 .7516C565.3 464.1 576 474.9 576 488.1z"
                            />
                        </svg>
                    }
                >
                    <p>
                        Press{" "}
                        <div
                            className="inline-block px-1 py-0.5 text-gray-600 shadow-inner dark:text-gray-300"
                            style={{ background: "var(--embedded-background)" }}
                        >
                            TAB
                        </div>{" "}
                        while reading to manage your saved articles and highlights.
                    </p>
                    <p>
                        Install{" "}
                        <a
                            href={unclutterLibraryLink}
                            className="underline"
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() =>
                                reportEventContentScript("clickNewTabLink", { source: "settings" })
                            }
                        >
                            Unclutter New Tab
                        </a>{" "}
                        to access your reading queue from your new tab page.
                    </p>
                </OptionsGroup>

                <OptionsGroup
                    headerText="Highlights"
                    iconSvg={
                        <svg className="w-5" viewBox="0 0 512 512">
                            <path
                                fill="currentColor"
                                d="M320 62.06L362.7 19.32C387.7-5.678 428.3-5.678 453.3 19.32L492.7 58.75C517.7 83.74 517.7 124.3 492.7 149.3L229.5 412.5C181.5 460.5 120.3 493.2 53.7 506.5L28.71 511.5C20.84 513.1 12.7 510.6 7.03 504.1C1.356 499.3-1.107 491.2 .4662 483.3L5.465 458.3C18.78 391.7 51.52 330.5 99.54 282.5L286.1 96L272.1 82.91C263.6 73.54 248.4 73.54 239 82.91L136.1 184.1C127.6 194.3 112.4 194.3 103 184.1C93.66 175.6 93.66 160.4 103 151L205.1 48.97C233.2 20.85 278.8 20.85 306.9 48.97L320 62.06zM320 129.9L133.5 316.5C94.71 355.2 67.52 403.1 54.85 457.2C108 444.5 156.8 417.3 195.5 378.5L382.1 192L320 129.9z"
                            />
                        </svg>
                    }
                >
                    <p>
                        Select any article text to create a{" "}
                        <a
                            href="https://github.com/lindylearn/unclutter/blob/main/docs/annotations.md"
                            className="underline"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            highlight
                        </a>{" "}
                        saved in your browser. Toggle the feature via the "pen" toolbar icon.
                    </p>
                    <FeatureFlagSwitch
                        featureFlagKey={hypothesisSyncFeatureFlag}
                        onChange={onChangeHypothesisSync}
                    >
                        Back-up notes to my{" "}
                        <a
                            href="https://web.hypothes.is"
                            className="underline"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            Hypothes.is
                        </a>{" "}
                        account
                    </FeatureFlagSwitch>
                    {hypothesisEnabled && <HypothesisConfig />}
                </OptionsGroup>

                <OptionsGroup
                    headerText="Social comments"
                    iconSvg={
                        <svg className="w-5" viewBox="0 0 640 512">
                            <path
                                fill="currentColor"
                                d="M319.9 320c57.41 0 103.1-46.56 103.1-104c0-57.44-46.54-104-103.1-104c-57.41 0-103.1 46.56-103.1 104C215.9 273.4 262.5 320 319.9 320zM319.9 160c30.85 0 55.96 25.12 55.96 56S350.7 272 319.9 272S263.9 246.9 263.9 216S289 160 319.9 160zM512 160c44.18 0 80-35.82 80-80S556.2 0 512 0c-44.18 0-80 35.82-80 80S467.8 160 512 160zM369.9 352H270.1C191.6 352 128 411.7 128 485.3C128 500.1 140.7 512 156.4 512h327.2C499.3 512 512 500.1 512 485.3C512 411.7 448.4 352 369.9 352zM178.1 464c10.47-36.76 47.36-64 91.14-64H369.9c43.77 0 80.66 27.24 91.14 64H178.1zM551.9 192h-61.84c-12.8 0-24.88 3.037-35.86 8.24C454.8 205.5 455.8 210.6 455.8 216c0 33.71-12.78 64.21-33.16 88h199.7C632.1 304 640 295.6 640 285.3C640 233.8 600.6 192 551.9 192zM183.9 216c0-5.449 .9824-10.63 1.609-15.91C174.6 194.1 162.6 192 149.9 192H88.08C39.44 192 0 233.8 0 285.3C0 295.6 7.887 304 17.62 304h199.5C196.7 280.2 183.9 249.7 183.9 216zM128 160c44.18 0 80-35.82 80-80S172.2 0 128 0C83.82 0 48 35.82 48 80S83.82 160 128 160z"
                            />
                        </svg>
                    }
                >
                    <p>
                        Click the underlined quotes on 86,457+ supported articles to show{" "}
                        <a
                            href="https://github.com/lindylearn/unclutter/blob/main/docs/social-highlights.md"
                            className="underline"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            quote comments
                        </a>{" "}
                        from Hacker News and Hypothes.is.
                    </p>
                    <FeatureFlagSwitch featureFlagKey={enableSocialCountsFeatureFlag}>
                        Show number of available social comments on the extension icon
                    </FeatureFlagSwitch>
                </OptionsGroup>

                <OptionsGroup
                    headerText="Contributions"
                    iconSvg={
                        <svg className="w-5" viewBox="0 0 512 512">
                            <path
                                fill="currentColor"
                                d="M244 84L255.1 96L267.1 84.02C300.6 51.37 347 36.51 392.6 44.1C461.5 55.58 512 115.2 512 185.1V190.9C512 232.4 494.8 272.1 464.4 300.4L283.7 469.1C276.2 476.1 266.3 480 256 480C245.7 480 235.8 476.1 228.3 469.1L47.59 300.4C17.23 272.1 0 232.4 0 190.9V185.1C0 115.2 50.52 55.58 119.4 44.1C164.1 36.51 211.4 51.37 244 84C243.1 84 244 84.01 244 84L244 84zM255.1 163.9L210.1 117.1C188.4 96.28 157.6 86.4 127.3 91.44C81.55 99.07 48 138.7 48 185.1V190.9C48 219.1 59.71 246.1 80.34 265.3L256 429.3L431.7 265.3C452.3 246.1 464 219.1 464 190.9V185.1C464 138.7 430.4 99.07 384.7 91.44C354.4 86.4 323.6 96.28 301.9 117.1L255.1 163.9z"
                            />
                        </svg>
                    }
                >
                    <ContributionStats />
                    <div className="">
                        This project is open source! Join our{" "}
                        <a
                            href="https://unclutter.it/discord"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline"
                        >
                            Discord server
                        </a>{" "}
                        to discuss improvements, or contribute{" "}
                        <a
                            href="https://github.com/lindylearn/unclutter/issues"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline"
                        >
                            on GitHub
                        </a>{" "}
                        to improve reading on the web for everyone.
                    </div>
                </OptionsGroup>
            </div>
        </div>
    );
}
export default OptionsPage;

function OptionsGroup({ headerText, iconSvg, children, docsLink = null }) {
    return (
        <div>
            <h2 className="mb-1 flex select-none items-center text-lg font-semibold">
                <div className="group-icon mr-1 w-7">{iconSvg}</div>
                <div className="group-title">{headerText}</div>
                {docsLink && (
                    <a href={docsLink} target="_blank" rel="noopener noreferrer" className="ml-5">
                        <svg className="h-4 text-gray-400" viewBox="0 0 320 512">
                            <path
                                fill="currentColor"
                                d="M144 416c-17.67 0-32 14.33-32 32s14.33 32.01 32 32.01s32-14.34 32-32.01S161.7 416 144 416zM211.2 32H104C46.66 32 0 78.66 0 136v16C0 165.3 10.75 176 24 176S48 165.3 48 152v-16c0-30.88 25.12-56 56-56h107.2C244.7 80 272 107.3 272 140.8c0 22.66-12.44 43.27-32.5 53.81L167 232.8C137.1 248 120 277.9 120 310.6V328c0 13.25 10.75 24.01 24 24.01S168 341.3 168 328V310.6c0-14.89 8.188-28.47 21.38-35.41l72.47-38.14C297.7 218.2 320 181.3 320 140.8C320 80.81 271.2 32 211.2 32z"
                            />
                        </svg>
                    </a>
                )}
            </h2>
            <div className="ml-8 mr-5 flex flex-col gap-2">{children}</div>
        </div>
    );
}
