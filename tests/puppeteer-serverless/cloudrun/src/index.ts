import cors from "cors";
import express from "express";
import { startBrowser } from "./browser.js";
import { compareUrlImages } from "./compare.js";
import {
    downloadExtensionCode,
    downloadPreviousUrlScreenshot,
    prepare,
    uploadResults,
} from "./results.js";
import { captureUrl } from "./screenshot.js";

const app = express();
app.use(express.json());
app.use(cors());

app.post("/screenshot", async (req, res, next) => {
    const prefix = req.query.prefix as string;

    try {
        await downloadExtensionCode();

        const urls: string[] = req.body;

        await prepare();
        const [browser, extWorker] = await startBrowser();

        for (const url of urls) {
            await captureUrl(browser, extWorker, url);

            const hasPrevScreenshot = await downloadPreviousUrlScreenshot(
                url,
                prefix
            );
            if (hasPrevScreenshot) {
                await compareUrlImages(url);
            }
        }

        await browser.close();
        await uploadResults(prefix);

        res.send("ok");
    } catch (err) {
        next(err);
    }
});

const port = parseInt(process.env.PORT) || 8080;
app.listen(port, () => {
    console.log(`App listening on port ${port}`);
});
