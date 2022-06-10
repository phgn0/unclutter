import { Storage } from "@google-cloud/storage";
import { execSync } from "child_process";
import { existsSync, promises as fs, rmSync } from "fs";

const bucketName = "unclutter-screenshots-serverless";
export const localScreenshotsPath = "./screenshots/new";
export const previousScreenshotsPath = "./screenshots/prev";
export const diffScreenshotsPath = "./screenshots/diff";

const storage = new Storage(); // use default service account

export async function prepare() {
    await createEmptyDir(localScreenshotsPath);
    await createEmptyDir(previousScreenshotsPath);
    await createEmptyDir(diffScreenshotsPath);
}
async function createEmptyDir(path: string) {
    if (existsSync(path)) {
        rmSync(path, { recursive: true, force: true });
    }
    await fs.mkdir(path, { recursive: true });
}

export async function downloadPreviousUrlScreenshot(
    url: string,
    prefix: string
) {
    const file = storage
        .bucket(bucketName)
        .file(`${prefix}/current/${encodeURIComponent(url)}.png`);

    try {
        await file.download({
            destination: `${previousScreenshotsPath}/${encodeURIComponent(
                url
            )}.png`,
        });
        return true;
    } catch (err) {
        return false;
    }
}

export async function uploadResults(prefix: string) {
    console.log("Uploading screenshots");

    const currentFiles = await fs.readdir(localScreenshotsPath);
    await Promise.all(
        currentFiles.map(async (file) => {
            await storage
                .bucket(bucketName)
                .upload(`${localScreenshotsPath}/${file}`, {
                    destination: `${prefix}/current/${file}`,
                });
        })
    );

    const diffFiles = await fs.readdir(diffScreenshotsPath);
    await Promise.all(
        diffFiles.map(async (file) => {
            await storage
                .bucket(bucketName)
                .upload(`${diffScreenshotsPath}/${file}`, {
                    destination: `${prefix}/diff/${file}`,
                });
        })
    );
}

export async function downloadExtensionCode() {
    await storage
        .bucket(bucketName)
        .file(`extension.zip`)
        .download({ destination: "./extension.zip" });

    execSync("unzip -o extension.zip");
}
