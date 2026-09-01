import { Buffer } from "node:buffer";
import console from "node:console";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import * as ResEdit from "resedit";

const projectRoot = process.cwd();
const packageJson = JSON.parse(
  fs.readFileSync(path.join(projectRoot, "package.json"), "utf8")
);
const executablePath = path.join(projectRoot, "out", "win-unpacked", "MeetMap.exe");
const temporaryPath = `${executablePath}.branded`;
const iconPath = path.join(projectRoot, "build", "meetmap.ico");
const language = 1033;
const codepage = 1200;
const version = normalizeWindowsVersion(packageJson.version);

if (!fs.existsSync(executablePath)) {
  throw new Error(`Windows executable not found: ${executablePath}`);
}

const executable = ResEdit.NtExecutable.from(fs.readFileSync(executablePath));
const resources = ResEdit.NtExecutableResource.from(executable);
const iconFile = ResEdit.Data.IconFile.from(fs.readFileSync(iconPath));
const iconGroups = ResEdit.Resource.IconGroupEntry.fromEntries(resources.entries);
const iconGroup = iconGroups[0];

ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
  resources.entries,
  iconGroup?.id ?? 1,
  iconGroup?.lang ?? language,
  iconFile.icons.map((item) => item.data)
);

const versionEntries = ResEdit.Resource.VersionInfo.fromEntries(resources.entries);
if (versionEntries.length === 0) {
  versionEntries.push(
    ResEdit.Resource.VersionInfo.create({
      lang: language,
      fixedInfo: {},
      strings: [{ lang: language, codepage, values: {} }]
    })
  );
}

for (const versionEntry of versionEntries) {
  const translations = versionEntry.getAllLanguagesForStringValues();
  const targets = translations.length > 0 ? translations : [{ lang: language, codepage }];

  versionEntry.setFileVersion(version, language);
  versionEntry.setProductVersion(version, language);
  for (const target of targets) {
    versionEntry.setStringValues(target, {
      CompanyName: "MeetMap",
      FileDescription: "MeetMap desktop meeting assistant",
      InternalName: "MeetMap",
      OriginalFilename: "MeetMap.exe",
      ProductName: "MeetMap"
    });
  }
  versionEntry.outputToResourceEntries(resources.entries);
}

resources.outputResource(executable);
fs.writeFileSync(temporaryPath, Buffer.from(executable.generate()));
fs.copyFileSync(temporaryPath, executablePath);
fs.unlinkSync(temporaryPath);

console.log(`Branded ${executablePath} as MeetMap ${version}.`);

function normalizeWindowsVersion(value) {
  const parts = String(value).split(".");
  if (parts.length < 1 || parts.length > 4 || parts.some((part) => !/^\d+$/.test(part))) {
    throw new Error(`Unsupported package version for Windows resources: ${value}`);
  }
  return [...parts, "0", "0", "0"].slice(0, 4).join(".");
}
