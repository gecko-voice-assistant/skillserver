/*
This file is part of G.E.C.K.O.
Copyright (C) 2023  Finn Wehn

G.E.C.K.O. is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/
const express = require("express");
const app = express();
const cors = require("cors");
const zip = require("express-easy-zip");
const fileUpload = require("express-fileupload");
const admZip = require("adm-zip");
const bodyParser = require("body-parser");
const fs = require("fs");

getVersionFile();

// defining middleware
app.use(
    fileUpload({
        createParentPath: true,
    })
);

app.use(express.static("public"));
app.use(zip());
app.use(cors());
app.use(
    bodyParser.urlencoded({
        extended: false,
    })
);
app.use(bodyParser.json());

// Returns a list of available Skills with their last version tag
app.get("/skills/:locale", (req, res) => {
    let dirs = fs.readdirSync(`${__dirname}/skills/`);
    let body = {};
    for (let i in dirs) {
        // Filters Dummies
        if (dirs[i].startsWith("_")) continue;

        let skillData = {
            name: dirs[i],
            versions: [],
            latest: getLatestTag(dirs[i]),
        };

        // Filters by locale
        let allVersions = fs.readdirSync(`${__dirname}/skills/${dirs[i]}`);
        for (let j in allVersions) {
            let path = `${__dirname}/skills/${dirs[i]}/${allVersions[j]}`;
            if (!fs.readdirSync(`${path}/locales`).includes(`${req.params.locale}.json`)) continue;

            skillData.versions.push(allVersions[j]);
        }

        body[dirs[i]] = skillData;
    }
    res.json(body);
});

// Returns details about skill version
app.get("/skill/:skillName/:versionTag", (req, res) => {
    if (
        req.params.skillName.startsWith("_") ||
        !fs.readdirSync(`${__dirname}/skills`).includes(req.params.skillName) ||
        !fs.readdirSync(`${__dirname}/skills/${req.params.skillName}`).includes(req.params.versionTag)
    ) {
        res.json({ error: "Skill/Version not found!" });
        return;
    }

    let details = {};
    let skillManifest = JSON.parse(
        fs.readFileSync(`${__dirname}/skills/${req.params.skillName}/${req.params.versionTag}/manifest.json`).toString()
    );

    details["version"] = skillManifest.version;
    details["locales"] = fs
        .readdirSync(`${__dirname}/skills/${req.params.skillName}/${req.params.versionTag}/locales`)
        .map((locale) => locale.split(".")[0]);
    details["dependencies"] = skillManifest.dependencies;
    res.json(details);
});

// Checks if the latest Version has same tag as requested
app.get("/update/:locale/:skillName/:version", (req, res) => {
    let tag = getLatestTag(req.params.skillName);

    if (!tag) {
        res.json({ update: false, version: "Skill not existing" });
        return;
    }

    let path = `${__dirname}/skills/${req.params.skillName}/${tag}`;
    let manifest = JSON.parse(fs.readFileSync(`${path}/manifest.json`).toString());
    let version = req.params.version;

    let body = {
        update: false,
        version: version,
    };

    if (fs.readdirSync(`${path}/locales`).includes(`${req.params.locale}.json`) && manifest.version !== version) {
        body.update = true;
        body.version = manifest.version;
    }

    res.json(body);
});

// Zips up requested skill and returns it
app.get("/download/:skillName/:versionTag", async (req, res) => {
    let tag = req.params.versionTag === "latest" ? getLatestTag(req.params.skillName) : req.params.versionTag;
    if (!tag) {
        res.send("Error: Skill not existing");
        return;
    }

    let dirPath = `${__dirname}/skills/${req.params.skillName}/${tag}`;
    await res.zip({
        files: [
            {
                path: dirPath,
                name: tag,
            },
        ],
        filename: `${req.params.skillName}.zip`,
    });
});

// Endpoint for upload-page
app.post("/upload", (req, res) => {
    try {
        if (!req.body.skillName) {
            // Name for the skill is required
            res.send({
                status: false,
                message: "Enter SkillName",
            });
            return;
        }
        if (!req.body.versionTag) {
            // Version Tag for the Skill is required
            res.send({
                status: false,
                message: "Enter Version Tag",
            });
            return;
        }
        if (!req.files || Object.keys(req.files).length === 0) {
            // Files need to be uploaded
            res.send({
                status: false,
                message: "No file uploaded",
            });
            return;
        }

        let zip = new admZip(req.files.zipped.data);
        zip.extractAllTo(`${__dirname}/skills/${req.body.skillName}/${req.body.versionTag}`, true);

        updateLatest(req.body.skillName, req.body.versionTag);

        res.send({
            status: true,
            message: "Skill Uploaded",
        });
    } catch (e) {
        res.status(500).send(e);
    }
});

function updateLatest(skill, tag) {
    let versionFile = getVersionFile();

    if (!Object.prototype.hasOwnProperty.call(versionFile, skill)) versionFile[skill] = [];

    versionFile[skill] = [tag, ...versionFile[skill]];

    writeVersionFile(versionFile);
}

function getLatestTag(skill) {
    let skillData = getVersionFile()[skill];
    return (skillData || [])[0];
}

function getVersionFile() {
    try {
        return JSON.parse(fs.readFileSync(`${__dirname}/config/versions.json`).toString());
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error(err);
        if (err.code === "ENOENT") writeVersionFile({});

        return {};
    }
}

function writeVersionFile(data) {
    fs.writeFileSync(`${__dirname}/config/versions.json`, JSON.stringify(data));
}

app.listen(3000, () => {
    // eslint-disable-next-line no-console
    console.log(`Server listening on: http://127.0.0.1:3000`);
});
