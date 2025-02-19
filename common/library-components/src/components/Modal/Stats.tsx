import React, { useContext, useEffect, useState } from "react";
import {
    Annotation,
    Article,
    readingProgressFullClamp,
    ReplicacheContext,
    Topic,
    UserInfo,
} from "../../store";
import { ArticleActivityCalendar, getActivityColor, getActivityLevel } from "../Charts";
import { getDomain, getRandomLightColor, getWeekStart, groupBy, subtractWeeks } from "../../common";
import { useArticleGroups } from "../ArticleList";
import { TopicEmoji } from "../TopicTag";
import clsx from "clsx";
import { BigNumber, ResourceIcon, ResourceStat } from "./components/numbers";
import { FilterContext } from "..";

export default function StatsModalTab({
    userInfo,
    articleCount,
    darkModeEnabled,
    defaultWeekOverlay = 3,
    reportEvent = () => {},
}: {
    userInfo: UserInfo;
    articleCount?: number;
    darkModeEnabled: boolean;
    defaultWeekOverlay?: number;
    reportEvent?: (event: string, data?: any) => void;
}) {
    const { showTopic, showDomain } = useContext(FilterContext);

    const rep = useContext(ReplicacheContext);

    const [allArticles, setAllArticles] = useState<Article[]>();
    const [allAnnotations, setAllAnnotations] = useState<Annotation[]>();
    useEffect(() => {
        if (!rep) {
            return;
        }
        rep.query.listRecentArticles().then(setAllArticles);
        rep.query.listAnnotations().then(setAllAnnotations);
    }, [rep]);

    const [start, setStart] = useState<Date>();
    const [end, setEnd] = useState<Date>(new Date());
    const [startWeeksAgo, setStartWeeksAgo] = useState(defaultWeekOverlay);
    useEffect(() => {
        const end = getWeekStart(new Date());
        const start = subtractWeeks(end, startWeeksAgo - 1);
        setStart(start);
    }, [startWeeksAgo]);

    return (
        <div className="animate-fadein relative flex flex-col gap-4">
            <div className="absolute top-0 right-0 flex cursor-default items-center gap-2 rounded-md bg-stone-50 px-2 py-1 font-medium transition-transform hover:scale-[97%] dark:bg-neutral-800">
                <svg className="h-4" viewBox="0 0 512 512">
                    <path
                        fill="currentColor"
                        d="M0 73.7C0 50.67 18.67 32 41.7 32H470.3C493.3 32 512 50.67 512 73.7C512 83.3 508.7 92.6 502.6 100L336 304.5V447.7C336 465.5 321.5 480 303.7 480C296.4 480 289.3 477.5 283.6 472.1L191.1 399.6C181.6 392 176 380.5 176 368.3V304.5L9.373 100C3.311 92.6 0 83.3 0 73.7V73.7zM54.96 80L218.6 280.8C222.1 285.1 224 290.5 224 296V364.4L288 415.2V296C288 290.5 289.9 285.1 293.4 280.8L457 80H54.96z"
                    />
                </svg>
                Last {startWeeksAgo + 1} week
                {startWeeksAgo + 1 !== 1 ? "s" : ""}
            </div>

            <NumberStats
                userInfo={userInfo}
                articleCount={articleCount}
                allArticles={allArticles}
                allAnnotations={allAnnotations}
                darkModeEnabled={darkModeEnabled}
            />
            <ArticleActivityCalendar
                articles={allArticles}
                darkModeEnabled={darkModeEnabled}
                startWeeksAgo={startWeeksAgo}
                setStartWeeksAgo={setStartWeeksAgo}
                defaultWeekOverlay={defaultWeekOverlay}
                reportEvent={reportEvent}
            />
            {start && end && (
                <WeekDetails
                    userInfo={userInfo}
                    start={start}
                    end={end}
                    allArticles={allArticles}
                    allAnnotations={allAnnotations}
                    darkModeEnabled={darkModeEnabled}
                    showTopic={showTopic}
                    showDomain={showDomain}
                />
            )}
        </div>
    );
}

function NumberStats({
    userInfo,
    articleCount,
    allArticles,
    allAnnotations,
    darkModeEnabled,
}: {
    userInfo: UserInfo;
    articleCount?: number;
    allArticles?: Article[];
    allAnnotations?: Annotation[];
    darkModeEnabled: boolean;
}) {
    const rep = useContext(ReplicacheContext);
    const [topicsCount, setTopicsCount] = useState<number>();
    useEffect(() => {
        if (userInfo.onPaidPlan || userInfo.trialEnabled) {
            rep?.query
                .listTopics()
                .then((topics) => setTopicsCount(topics.filter((t) => !!t.group_id).length));
        }
    }, [rep]);

    const readArticlesCount = allArticles?.filter(
        (a) => a.reading_progress >= readingProgressFullClamp
    ).length;
    const unreadCount =
        articleCount !== undefined && readArticlesCount !== undefined
            ? articleCount - readArticlesCount
            : undefined;

    return (
        <div className="grid grid-cols-5 gap-4">
            <BigNumber
                value={readArticlesCount}
                tag={`read article${readArticlesCount !== 1 ? "s" : ""}`}
                icon={<ResourceIcon type="articles_completed" large />}
            />
            <BigNumber
                value={unreadCount}
                tag={`unread article${unreadCount !== 1 ? "s" : ""}`}
                icon={<ResourceIcon type="articles" large />}
            />
            <BigNumber
                value={allAnnotations?.length}
                tag={`highlight${allAnnotations?.length !== 1 ? "s" : ""}`}
                icon={<ResourceIcon type="highlights" large />}
            />

            {(userInfo.onPaidPlan || userInfo.trialEnabled) && (
                <BigNumber
                    value={topicsCount}
                    tag={`article topic${topicsCount !== 1 ? "s" : ""}`}
                    icon={<ResourceIcon type="links" large />}
                />
            )}
        </div>
    );
}

function WeekDetails({
    userInfo,
    start,
    end,
    allArticles,
    allAnnotations,
    darkModeEnabled,
    showTopic,
    showDomain,
}: {
    userInfo: UserInfo;
    start: Date;
    end: Date;
    allArticles?: Article[];
    allAnnotations?: Annotation[];
    darkModeEnabled: boolean;
    showTopic: (topicId: string) => void;
    showDomain: (domain: string) => void;
}) {
    const [selectedArticles, setSelectedArticles] = useState<Article[]>([]);
    const [selectedAnnotations, setSelectedAnnotations] = useState<Annotation[]>([]);
    useEffect(() => {
        if (!allArticles || !allAnnotations) {
            return;
        }

        setSelectedArticles(
            allArticles.filter(
                (a) => a.time_added * 1000 >= start.getTime() && a.time_added * 1000 < end.getTime()
            )
        );
        // setSelectedAnnotations(
        //     allAnnotations.filter(
        //         (a) => a.created_at * 1000 >= start.getTime() && a.created_at * 1000 < end.getTime()
        //     )
        // );
        // TODO fetch older annotated articles?
    }, [allArticles, allAnnotations, start, end]);

    let [groups, setGroups] = useState<[string, Article[]][]>();
    // if (userInfo.onPaidPlan || userInfo.trialEnabled) {
    //     groups = useArticleGroups(
    //         selectedArticles,
    //         false,
    //         "topic_size",
    //         "recency_order",
    //         undefined
    //     );
    // } else {
    useEffect(() => {
        if (selectedArticles.length === 0) {
            return;
        }
        const groups: { [domain: string]: Article[] } = groupBy(
            selectedArticles.map((a) => {
                // @ts-ignore
                a.domain = getDomain(a.url);
                return a;
            }),
            "domain"
        );
        setGroups(Object.entries(groups).sort((a, b) => b[1].length - a[1].length));
    }, [selectedArticles]);
    // }

    // TODO sum article fields instead for performance?
    const [annotationGroups, setAnnotationGroups] = useState<{ [key: string]: number }>({});
    useEffect(() => {
        if (!groups || !selectedAnnotations) {
            return;
        }
        const annotationGroups = {};
        groups.map(([groupKey, articles]) => {
            annotationGroups[groupKey] = articles.reduce(
                (acc, article) => acc + (article.annotation_count || 0),
                0
            );
        });
        setAnnotationGroups(annotationGroups);
    }, [groups, selectedAnnotations]);

    return (
        <div className="animate-fadein">
            <div className="grid grid-cols-5 gap-4">
                {groups?.map(([groupKey, groupArticles]) => (
                    <ArticleGroupStat
                        userInfo={userInfo}
                        key={groupKey}
                        groupKey={groupKey}
                        selectedArticles={groupArticles}
                        annotationsCount={annotationGroups[groupKey]}
                        darkModeEnabled={darkModeEnabled}
                        showTopic={showTopic}
                        showDomain={showDomain}
                    />
                ))}
            </div>
        </div>
    );
}

function ArticleGroupStat({
    userInfo,
    groupKey,
    selectedArticles,
    annotationsCount,
    darkModeEnabled,
    showTopic,
    showDomain,
}: {
    userInfo: UserInfo;
    groupKey: string;
    selectedArticles: Article[];
    annotationsCount: number;
    darkModeEnabled: boolean;
    showTopic: (topicId: string) => void;
    showDomain: (domain: string) => void;
}) {
    const [topic, setTopic] = useState<Topic>();
    if (userInfo.onPaidPlan || userInfo.trialEnabled) {
        const rep = useContext(ReplicacheContext);
        useEffect(() => {
            rep?.query.getTopic(groupKey).then(setTopic);
        }, [rep, groupKey]);
    }

    const addedCount = selectedArticles.length;
    const readCount = selectedArticles.filter(
        (a) => a.reading_progress >= readingProgressFullClamp
    ).length;
    const unreadCount = addedCount - readCount;

    const activityLevel = getActivityLevel(addedCount);

    return (
        <div
            className={clsx(
                "flex cursor-pointer select-none flex-col items-center gap-1 overflow-hidden rounded-md bg-stone-50 p-3 transition-all hover:scale-[97%] dark:bg-neutral-800",
                activityLevel === 4 && "dark:text-stone-800"
            )}
            style={{
                background: getActivityColor(activityLevel, darkModeEnabled || false),
            }}
            onClick={() => {
                // if (userInfo.onPaidPlan || userInfo.trialEnabled) {
                //     showTopic(topic!.id);
                // } else {
                showDomain(groupKey);
                // }
            }}
        >
            <div className="flex max-w-full items-center overflow-hidden font-medium">
                {/* {topic?.emoji && <TopicEmoji emoji={topic?.emoji} className="w-4" />} */}
                {/* {!(userInfo.onPaidPlan || userInfo.trialEnabled) && ( */}
                <div className="mr-1 w-4 opacity-90">
                    <img
                        className="w-4"
                        src={`https://www.google.com/s2/favicons?sz=128&domain=https://${groupKey}`}
                    />
                </div>
                {/* )} */}
                <div className="overflow-hidden overflow-ellipsis whitespace-nowrap">
                    {topic?.name || groupKey}
                </div>
            </div>

            <div className="flex gap-3">
                <ResourceStat
                    type="articles_completed"
                    value={readCount}
                    className={clsx(readCount === 0 && "opacity-0")}
                />
                <ResourceStat
                    type="articles"
                    value={unreadCount}
                    className={clsx(unreadCount === 0 && "opacity-0")}
                />
                <ResourceStat
                    type="highlights"
                    value={annotationsCount}
                    className={clsx(annotationsCount === 0 && "opacity-0")}
                />
            </div>
        </div>
    );
}
