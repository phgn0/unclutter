import { getUrlHash, normalizeUrl } from "@unclutter/library-components/dist/common";
import { Annotation, Article } from "@unclutter/library-components/dist/store";
import { debounce, groupBy } from "lodash";
import { LindyAnnotation, pickleLocalAnnotation } from "../../common/annotations/create";
import { getFeatureFlag, hypothesisSyncFeatureFlag } from "../../common/featureFlags";
import { constructLocalArticleInfo } from "../../common/schema";
import { getHypothesisSyncState, updateHypothesisSyncState } from "../../common/storage";
import {
    createRemoteAnnotation,
    deleteRemoteAnnotation,
    getHypothesisAnnotationsSince,
    updateRemoteAnnotation,
} from "../../sidebar/common/api";
import { deleteAllLegacyAnnotations, getAllLegacyAnnotations } from "../../sidebar/common/legacy";
import { processReplicacheMessage, rep } from "./library";

export async function initHighlightsSync() {
    try {
        await importLegacyAnnotations();
    } catch (err) {
        console.error(err);
    }

    const hypothesisSyncEnabled = await getFeatureFlag(hypothesisSyncFeatureFlag);
    if (hypothesisSyncEnabled) {
        try {
            // upload local changes,
            // sets last updated time to now (so pulled changes are not uploaded again)
            await uploadAnnotations();

            // pull remote changes
            await fetchRemoteAnnotations();

            // watch updates
            await watchLocalAnnotations();
        } catch (err) {
            console.error(err);
        }
    }

    console.log("Annotations sync done");
}

async function importLegacyAnnotations() {
    const annotations = await getAllLegacyAnnotations();
    if (annotations.length === 0) {
        return;
    }

    console.log(`Migrating ${annotations.length} legacy annotations...`);
    await importAnnotations(annotations);

    await deleteAllLegacyAnnotations();
}

export async function fetchRemoteAnnotations() {
    const syncState = await getHypothesisSyncState();

    let [annotations, newDownloadTimestamp] = await getHypothesisAnnotationsSince(
        syncState.lastDownloadTimestamp && new Date(syncState.lastDownloadTimestamp),
        10000
    );

    console.log(
        `Downloading ${annotations.length} hypothes.is annotations since ${syncState.lastDownloadTimestamp}...`
    );
    await importAnnotations(annotations);

    await updateHypothesisSyncState({ lastDownloadTimestamp: newDownloadTimestamp });
}

async function uploadAnnotations() {
    const syncState = await getHypothesisSyncState();
    await updateHypothesisSyncState({ isSyncing: true });

    // get last updated time before async fetching & uploading
    const newUploadTimestamp = new Date().toUTCString();

    // filter annotations to upload
    let annotations = await rep.query.listAnnotations();
    const lastUploadUnix = syncState.lastUploadTimestamp
        ? Math.round(new Date(syncState.lastUploadTimestamp).getTime() / 1000)
        : 0;
    annotations = annotations
        .filter((a) => a.updated_at > lastUploadUnix)
        .sort((a, b) => a.updated_at - b.updated_at); // sort with oldest first
    if (annotations.length === 0) {
        await updateHypothesisSyncState({ lastUploadTimestamp: newUploadTimestamp });
        return;
    }
    console.log(
        `Uploading ${annotations.length} changed annotations since ${syncState.lastUploadTimestamp} to hypothes.is...`
    );

    // fetch articles
    const articleIds = Object.keys(groupBy(annotations, (a) => a.article_id));
    const articles = await Promise.all(
        articleIds.map((articleId) => rep.query.getArticle(articleId))
    );
    const articleMap: { [articleId: string]: Article } = articles.reduce((acc, article) => {
        acc[article.id] = article;
        return acc;
    }, {});

    // upload changes
    await Promise.all(
        annotations.map(async (annotation) => {
            const article = articleMap[annotation.article_id];

            if (annotation.h_id) {
                // already exists remotely
                return updateRemoteAnnotation(annotation);
            } else {
                // create remotely, then save id
                const remoteId = await createRemoteAnnotation(
                    annotation,
                    article.url,
                    article.title
                );
                await processReplicacheMessage({
                    type: "mutate",
                    methodName: "updateAnnotation",
                    args: {
                        id: annotation.id,
                        h_id: remoteId,
                    },
                });
            }
        })
    );

    await updateHypothesisSyncState({ isSyncing: false, lastUploadTimestamp: newUploadTimestamp });
}
const uploadAnnotationsDebounced = debounce(uploadAnnotations, 10000);

// only handle deletes using store watch for reslience
let watchActive = false;
async function watchLocalAnnotations() {
    if (watchActive) {
        return;
    }
    watchActive = true;

    rep.watch("annotations/", async (changed: Annotation[], removed: Annotation[]) => {
        if (changed.length > 0) {
            // process based on edit timestamp for resilience
            uploadAnnotationsDebounced();
        }
        if (removed.length > 0) {
            console.log(`Deleting ${removed.length} annotation remotely...`);
            await Promise.all(removed.map((annotation) => deleteRemoteAnnotation(annotation)));
        }
    });
}

async function importAnnotations(annotations: LindyAnnotation[]) {
    // fetch article state
    const annotationsPerArticle = groupBy(annotations, (a) => a.url);
    const urls = Object.keys(annotationsPerArticle);

    let articleInfos = urls.map((url) =>
        constructLocalArticleInfo(url, getUrlHash(url), normalizeUrl(url))
    );

    articleInfos = articleInfos.map((articleInfo) => {
        articleInfo.article.reading_progress = 1.0;

        const articleAnnotations = annotationsPerArticle[articleInfo.article.url];
        if (articleAnnotations.length > 0) {
            articleInfo.article.time_added = Math.round(
                new Date(articleAnnotations[0].created_at).getTime() / 1000
            );
        }

        return articleInfo;
    });

    // insert articles
    await Promise.all(
        articleInfos.map((articleInfo) =>
            processReplicacheMessage({
                type: "mutate",
                methodName: "putArticleIfNotExists",
                args: articleInfo.article,
            })
        )
    );

    // merge remote changes
    processReplicacheMessage({
        type: "mutate",
        methodName: "mergeRemoteAnnotations",
        args: annotations.map(pickleLocalAnnotation),
    });
}
