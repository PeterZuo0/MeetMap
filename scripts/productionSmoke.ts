import { join, resolve } from "node:path";
import { loadDotEnvFile } from "../electron/envFile.js";
import { parseProviderConfig } from "../src/features/config/providerConfig.js";
import { createOpenAiMeetingStructureClient } from "../src/features/intelligence/openAiMeetingStructureClient.js";
import { createOpenAiRequesters } from "../src/features/providers/openAiRequesters.js";
import { createOpenAiTranscriptionClient } from "../src/features/transcription/openAiTranscriptionClient.js";
import {
  assertProductionSmokeInputCanStart,
  parseProductionSmokeArgs,
  runProductionSmoke,
  type ProductionSmokeInput,
  type ProductionSmokeReport
} from "../src/features/workflow/productionSmokeRunner.js";
import { createProductionWorkflowServices } from "../src/features/workflow/productionWorkflowServices.js";

async function main(): Promise<void> {
  try {
    const hadShellOpenAiKey = Boolean(process.env.OPENAI_API_KEY?.trim());
    const dotEnvResult = await loadDotEnvFile({
      env: process.env,
      filePath: join(process.cwd(), ".env")
    });
    const input = parseProductionSmokeArgs(process.argv.slice(2));
    assertProductionSmokeInputCanStart(input);
    const providerConfig = parseProviderConfig(process.env);

    if (providerConfig.mode !== "production") {
      throw new Error("Production smoke requires production provider configuration.");
    }

    printUploadWarning({
      input,
      keySource: hadShellOpenAiKey
        ? "shell environment"
        : dotEnvResult.keys.includes("OPENAI_API_KEY")
        ? ".env"
        : "configured environment"
    });

    const requesters = createOpenAiRequesters();
    const report = await runProductionSmoke(input, {
      workflowServices: createProductionWorkflowServices({
        structureClient: createOpenAiMeetingStructureClient({
          apiKey: providerConfig.structure.apiKey,
          model: providerConfig.structure.model,
          requestStructure: requesters.requestStructure
        }),
        transcriptionClient: createOpenAiTranscriptionClient({
          apiKey: providerConfig.transcription.apiKey,
          model: providerConfig.transcription.model,
          requestTranscription: requesters.requestTranscription
        })
      })
    });

    printReport(report);
  } catch (error) {
    process.exitCode = 1;
    console.error(error instanceof Error ? error.message : String(error));
  }
}

function printUploadWarning({
  input,
  keySource
}: {
  input: ProductionSmokeInput;
  keySource: string;
}): void {
  console.warn("Production smoke will upload the following local audio files:");
  if (input.systemAudioPath) {
    console.warn(`- system: ${resolve(input.systemAudioPath)}`);
  }
  if (input.microphoneAudioPath) {
    console.warn(`- microphone: ${resolve(input.microphoneAudioPath)}`);
  }
  console.warn(`OpenAI API key source: ${keySource}`);
  console.warn(`Local artifacts directory: ${resolve(input.dataDir, input.meetingId)}`);
}

function printReport(report: ProductionSmokeReport): void {
  console.log("Production smoke completed.");
  console.log(`Meeting: ${report.meetingId}`);
  console.log(`Meeting directory: ${report.meetingDir}`);
  console.log(`Transcript: ${report.transcriptPath}`);
  console.log(`Structure: ${report.structurePath}`);
  console.log(`Word summary: ${report.wordExportPath}`);
  console.log(`HTML meeting map: ${report.htmlMapExportPath}`);
}

void main();
