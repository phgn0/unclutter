import ky from "ky";

import { Article } from "../store/_schema";
import { getBrowserType, sendMessage } from "./extension";
import { getNewTabVersion, getUnclutterVersion } from "./messaging";
import { SearchResult } from "./search";

const lindyApiUrl = "https://api2.lindylearn.io";
// const lindyApiUrl = "http://localhost:8000";

export async function getPageHistory(url: string) {
    const response = await fetch(
        `${lindyApiUrl}/annotations/get_page_history?${new URLSearchParams({
            page_url: url,
        })}`
    );
    const json = await response.json();
    return json;
}

export async function reportBrokenPage(url: string) {
    const domain = getDomainFrom(new URL(url));
    const browserType = "serverless-screenshots";

    try {
        await fetch(`https://api2.lindylearn.io/report_broken_page`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                url,
                domain,
                userAgent: navigator.userAgent,
                browserType,
                unclutterVersion: null,
            }),
        });
    } catch {}
}

export async function quickReport(
    message: string,
    url?: string,
    userId?: string
): Promise<string | null> {
    const browserType = getBrowserType();
    const unclutterVersion = await getUnclutterVersion();
    const newTabVersion = await getNewTabVersion();

    try {
        const response = await fetch(`https://unclutter.lindylearn.io/api/quickReport`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                url,
                userId,
                message,
                userAgent: navigator.userAgent,
                browserType,
                unclutterVersion,
                newTabVersion,
            }),
        });
        return await response.text();
    } catch {
        return null;
    }
}

function getDomainFrom(url: URL) {
    return url.hostname.replace("www.", "");
}

export async function searchArticles(user_id: string, query: string): Promise<SearchResult[]> {
    let data = (await ky
        .get(`${lindyApiUrl}/library/search_articles`, {
            searchParams: {
                user_id,
                query,
            },
        })
        .json()) as SearchResult[];

    return data.filter((d) => d.sentences?.[0]?.length);
}

export async function checkHasSubscription(user_id: string, email: string): Promise<boolean> {
    let data: any = await ky
        .get(`${lindyApiUrl}/subscriptions/check_subscription`, {
            searchParams: {
                user_id,
                email,
            },
        })
        .json();

    return data?.is_subscribed || false;
}

export async function createScreenshots(urls: string[]): Promise<string[]> {
    try {
        const response = await fetch(`${lindyApiUrl}/library/create_screenshots`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ urls }),
        });
        return await response.json(); // returns new urls
    } catch {
        return [];
    }
}

export interface BookmarkedPage {
    url: string;
    time_added: number;
    favorite: boolean;
}
export async function clusterLibraryArticles(
    articles: BookmarkedPage[],
    user_id: string
): Promise<void> {
    // normalize fields to reduce message size
    const importData = {
        urls: articles.map(({ url }) => url),
        time_added: articles.map(({ time_added }) => time_added),
        favorite: articles.map(({ favorite }) => favorite),
    };

    await fetch(
        `${lindyApiUrl}/library/cluster_articles?${new URLSearchParams({
            user_id,
        })}`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(importData),
        }
    );
}
